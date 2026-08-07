import { Prisma } from '@prisma/client'
import { prisma } from '../../common/database'
import { NotFoundError, EscrowError, ForbiddenError, ValidationError } from '../../common/errors'
import { AssetType } from '../../common/types'
import { EscrowType } from '../../common/types/trade'
import { config } from '../../config'
import { eventBus } from '../../common/events/event-bus'
import { randomUUID as uuidv4 } from 'crypto'
import { wdkSettlementProvider } from './wdk-settlement.provider'
import { multisigProvider } from './multisig.provider'
import { lightningHodlProvider } from './lightning-hodl.provider'
import { safeGuardEvmProvider } from './safe-guard-evm.provider'
import { payoutAddressService } from './payout-address.service'
import { capabilityRegistry, CAPABILITY_IMPLEMENTATIONS } from '../../core/capability-registry'

/**
 * Sails OpenSettlement — Reference Implementation
 *
 * Owns: escrow state machine, SettlementProvider abstraction.
 * Does NOT own: Trade, User. This service must never write to those
 * tables directly — it only emits settlement.escrow.* events. The
 * modules that own Trade (OpenP2P) and User/reputation (OpenReputation)
 * subscribe to those events and update their own domain.
 *
 * This boundary was violated in the previous version of this file
 * (direct prisma.trade.update / prisma.user.update calls). Fixed here —
 * see /common/events/handlers.ts for the listeners that now do that work.
 */

type EscrowRecord = {
  id: string
  tradeId: string
  type: string
  status: string
  lockedAmount: string   // decimal string — RFC-009, never a JS number
  asset: string
  network: string | null
  multisigAddr: string | null
  redeemScript: string | null
  txLockId: string | null
  txReleaseId: string | null
  timelockHours: number
  lockedAt: Date | null
  expiresAt: Date | null
  releasedAt: Date | null
  createdAt: Date
  updatedAt: Date
  // Trade's own parties — Escrow itself has no buyer/seller columns
  // (OpenSettlement must never own Trade's data, see this file's header
  // comment), so these are attached by lockFunds()/releaseFunds()/
  // refundFunds() below from a Trade row they already fetch for the
  // isPartyOrAgent() authorization check.
  buyerId?: string
  sellerId?: string
  // Client-submitted pubkeys (EscrowParticipantKey, hex, 33-byte
  // compressed) — attached by lockFunds() for MULTISIG/LIGHTNING_HODL,
  // the only two providers that need them (they no longer derive
  // buyer/seller keys server-side, see each provider's own header
  // comment). Optional so every other provider keeps ignoring them.
  buyerPubkey?: string
  sellerPubkey?: string
  // Set only for releaseFunds()/refundFunds() — the arbiter id
  // (resolveDispute()'s triggeredBy) an arbitrated call was authorized
  // with, so MultisigProvider can refuse a mismatched dispute-arbiter
  // signature instead of attempting one that would fail to validate. See
  // multisig.provider.ts's assertArbiterMatchesScript().
  triggeredBy?: string
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['FUNDS_LOCKED', 'REFUNDED'],
  FUNDS_LOCKED: ['PAYMENT_PENDING', 'DISPUTED', 'REFUNDED'],
  PAYMENT_PENDING: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  // RFC-021 D9 — SPLIT only ever reaches an escrow via a dispute ruling
  // (§1.9's third option has no non-disputed equivalent, unlike
  // RELEASE/REFUND which both also have a normal happy-path route here).
  DISPUTED: ['COMPLETED', 'REFUNDED', 'SPLIT'],
  REFUNDED: [],
  SPLIT: [],
}

// ─── SettlementProvider — the protocol interface (Sails Protocol Spec) ────────
export interface SettlementProvider {
  name: string
  lockFunds(escrow: EscrowRecord): Promise<{ txId: string; address: string }>
  releaseFunds(escrow: EscrowRecord, toAddress: string): Promise<{ txId: string }>
  refundFunds(escrow: EscrowRecord): Promise<{ txId: string }>
  verifyLock(escrow: EscrowRecord): Promise<boolean>
  // RFC-021 D9 — optional: only the providers where a partial payout is
  // actually representable implement this (MOCK, WDK_USDT_EVM this pass).
  // buyerBps is the buyer's share in basis points out of 10000 (the
  // seller gets the remainder) — strictly between 0 and 10000; a caller
  // wanting an all-or-nothing outcome should use release/refund instead.
  // Two real transfers, not one, since neither of this pass's direct
  // providers has an atomic multi-recipient primitive.
  splitFunds?(escrow: EscrowRecord, buyerAddress: string, sellerAddress: string, buyerBps: number): Promise<{ txIds: string[] }>
}

class MockSettlementProvider implements SettlementProvider {
  name = 'MOCK'
  async lockFunds(escrow: EscrowRecord) {
    await new Promise((r) => setTimeout(r, 100))
    return { txId: `mock-lock-${uuidv4()}`, address: `mock-addr-${escrow.id.slice(0, 8)}` }
  }
  async releaseFunds(_escrow: EscrowRecord, toAddress: string) {
    await new Promise((r) => setTimeout(r, 100))
    return { txId: `mock-release-${uuidv4()}-to-${toAddress.slice(0, 8)}` }
  }
  async refundFunds(_escrow: EscrowRecord) {
    await new Promise((r) => setTimeout(r, 100))
    return { txId: `mock-refund-${uuidv4()}` }
  }
  async verifyLock(_escrow: EscrowRecord) {
    return true
  }
  async splitFunds(_escrow: EscrowRecord, buyerAddress: string, sellerAddress: string) {
    await new Promise((r) => setTimeout(r, 100))
    return {
      txIds: [
        `mock-split-${uuidv4()}-to-${buyerAddress.slice(0, 8)}`,
        `mock-split-${uuidv4()}-to-${sellerAddress.slice(0, 8)}`,
      ],
    }
  }
}

const PROVIDERS: Record<string, SettlementProvider> = {
  MOCK: new MockSettlementProvider(),
  // Real Arkade (Ark protocol) VTXO/Taproot escrow — lightning-hodl.provider.ts's
  // own doc comment has the full custody-model caveat (server-derived
  // keys, single-arbiter limitation, release/refund verification scope,
  // testnet/mutinynet only). Previously a throw-only stub inline in this
  // file; extracted to its own file and implemented for real.
  LIGHTNING_HODL: lightningHodlProvider,
  // Real @tetherto/wdk-wallet-evm USDT settlement — wdk-settlement.provider.ts's
  // own doc comment has the full custody-model caveat (single-seed
  // two-hop escrow, testnet only).
  WDK_USDT_EVM: wdkSettlementProvider,
  // Real 2-of-3 Bitcoin PSBT construction/signing — multisig.provider.ts's
  // own doc comment has the full custody-model caveat (server-derived
  // keys, single-arbiter limitation, testnet only). Previously absent
  // from this map entirely, meaning getProvider() silently fell through
  // to MOCK for every MULTISIG escrow ever created (fixed below too —
  // that fallback no longer exists for any type).
  MULTISIG: multisigProvider,
  // Real Safe Transaction Guard + ERC-4337 escrow (RFC-020) —
  // safe-guard-evm.provider.ts's own doc comment has the full
  // custody-model caveat (client-held buyer/seller keys, KMS-backed
  // arbiter co-signer, and the real-but-not-yet-deployable boundary:
  // lockFunds/verifyLock/broadcast all require live EVM RPC +
  // ERC-4337 bundler infrastructure this environment doesn't have).
  SAFE_GUARD_EVM: safeGuardEvmProvider,
}

// Providers that never push funds into escrow themselves (MULTISIG,
// LIGHTNING_HODL/Arkade, SAFE_GUARD_EVM) and whose buyer/seller keys are
// client-held — their deposit address can only be derived once both
// pubkeys have been submitted (submitParticipantKey() below), not at
// creation time. SAFE_GUARD_EVM added 2026-08-01 (real CREATE2 address
// prediction landed, safe-guard-evm.provider.ts's own header comment) —
// previously absent here entirely, meaning submitParticipantKey() never
// derived/persisted a Safe address for it and lockFunds() had no
// multisigAddr to verify a balance against.
const NON_CUSTODIAL_PROVIDERS: Record<string, { getDepositAddress(tradeId: string, buyerPubkey: string, sellerPubkey: string): Promise<string> }> = {
  MULTISIG: multisigProvider,
  LIGHTNING_HODL: lightningHodlProvider,
  SAFE_GUARD_EVM: safeGuardEvmProvider,
}

// Phase 2 (2026-07-27) — providers whose release/refund now goes through
// client-signature collection instead of a single synchronous provider
// call. Both MULTISIG and LIGHTNING_HODL as of the same day's follow-up
// pass — verified experimentally first that @arkade-os/sdk's SingleKey
// (a raw-private-key signer, the same private key generateEscrowKeypair()
// already produces for MULTISIG) needs no ASP/wallet machinery to sign,
// and bundles cleanly for a browser target with zero Node-core imports.
// The "psbtBase64" field is generic across both providers — MULTISIG's is
// a literal Bitcoin PSBT, LIGHTNING_HODL's is a JSON bundle of Ark tx +
// checkpoint PSBTs (see lightning-hodl.provider.ts's own header comment)
// — this service never inspects the string's contents itself, only
// stores/relays it, so the difference is invisible here.
interface SignatureCollectionProvider {
  buildUnsignedRelease(escrow: unknown, toAddress: string): Promise<{ psbtBase64: string; requiredSigners: string[] }>
  buildUnsignedRefund(escrow: unknown): Promise<{ psbtBase64: string; requiredSigners: string[]; toAddress: string }>
  finalizeRelease(escrow: unknown, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }>
  finalizeRefund(escrow: unknown, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }>
  // RFC-021 D9 — optional, same reasoning as SettlementProvider.splitFunds
  // above. Unlike that direct-call version, this is a single PSBT with two
  // real outputs (one transaction, one txid) — a signature-collection
  // provider's own script (2-of-3, output-structure-agnostic) doesn't care
  // how many outputs it spends to. Only MULTISIG implements this pass;
  // LIGHTNING_HODL/SAFE_GUARD_EVM each have a real, provider-specific
  // reason they can't (see each one's own buildUnsignedSplit() override).
  buildUnsignedSplit?(escrow: unknown, buyerAddress: string, sellerAddress: string, buyerBps: number): Promise<{ psbtBase64: string; requiredSigners: string[] }>
  finalizeSplit?(escrow: unknown, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }>
}
const SIGNATURE_COLLECTION_PROVIDERS: Record<string, SignatureCollectionProvider> = {
  MULTISIG: multisigProvider,
  LIGHTNING_HODL: lightningHodlProvider,
  SAFE_GUARD_EVM: safeGuardEvmProvider,
}

// 33-byte compressed secp256k1 pubkey, hex — the canonical client-submitted
// format both MULTISIG and LIGHTNING_HODL derive their own required
// representation from (see each provider's own header comment).
const PUBKEY_HEX_PATTERN = /^0[23][0-9a-fA-F]{64}$/

export interface CreateEscrowInput {
  tradeId: string
  type?: EscrowType
  lockedAmount: string   // decimal string — RFC-009, never a JS number
  asset: AssetType
  network?: string
  timelockHours?: number
}

// Found during the multisig-coverage-per-asset audit: createEscrow() used
// to default an omitted `type` to a hardcoded 'MULTISIG' regardless of
// `asset` — the real live call site (sails-ui's Trade.tsx) never sends
// `type` at all, so in a non-mock deployment EVERY trade of EVERY asset
// silently became a Bitcoin PSBT escrow, correct only by accident for BTC.
// This is the single source of truth for "which real provider actually
// fits this asset" — BTC/LN_BTC map to the two genuinely non-custodial
// (client-held-keys, 2-of-3) providers; USDT_ERC20 maps to WDK_USDT_EVM,
// the best REAL option today even though its own header discloses it's
// single-seed, not multisig (SAFE_GUARD_EVM would be the right answer but
// its lockFunds/verifyLock/broadcast are still throw-only — routing USDT
// there would just fail every trade). Every other AssetType has no real
// provider at all yet (LIQUID_COVENANT/SPARK/STACKS/etc. — see
// BACKLOG.md's asset x custody coverage note) and intentionally has no
// entry here, so createEscrow() throws instead of guessing.
const RECOMMENDED_ESCROW_TYPE: Partial<Record<AssetType, EscrowType>> = {
  BTC: 'MULTISIG',
  LN_BTC: 'LIGHTNING_HODL',
  USDT_ERC20: 'WDK_USDT_EVM',
}

export function recommendedEscrowType(asset: AssetType): EscrowType {
  const type = RECOMMENDED_ESCROW_TYPE[asset]
  if (!type) {
    throw new EscrowError(
      `No real SettlementProvider is wired for asset '${asset}' yet — refusing to guess an escrow type. ` +
      "Pass type: 'MOCK' explicitly if a fake/test escrow for this asset is actually intended."
    )
  }
  return type
}

// Found during a general gap audit (not tied to any single RFC): none of
// this class's mutating methods verified `triggeredBy` was actually a
// party to the trade before this fix — any authenticated participant on
// the platform could lock/confirm/release/refund/dispute *any* other
// trade's escrow, not just their own (an IDOR, the same class of bug
// RT-002 already fixed once for raw-userId-in-body — this was the same
// gap one layer deeper, at the service boundary rather than the auth
// boundary). `triggeredBy` may be a participant's own id, or an agent
// acting on their behalf (`agent:{label}:{participantId}`,
// `wallet-agent.ts`) — that string shape only ever originates from
// trusted internal callers (settlement-orchestrator.ts), never from an
// HTTP request body, so accepting it here doesn't reopen the hole this
// fix closes.
function isPartyOrAgent(triggeredBy: string, participantId: string): boolean {
  return triggeredBy === participantId || new RegExp(`^agent:[^:]+:${participantId}$`).test(triggeredBy)
}

// ─── Private helpers (shared by every mutating method on this class) ───────────
// Extracted from the inline blocks that previously appeared in lockFunds(),
// releaseFunds(), refundFunds(), splitFunds(), openDispute(), and
// submitTransactionSignature() — each of those methods ran the same
// 4-step "find escrow → find trade → check authorization → atomic claim"
// pattern, often duplicating the same try/catch and revert boilerplate.
// One source of truth keeps the pattern visible and the race-condition
// guarantees (the robustness-audit fix from 2026-07-20) consistent across
// every settlement action that ever moves real money.
//
// Each helper takes the EscrowService instance explicitly so it can call
// `isSellerOrAssignedArbiter()` (a private method) without exposing it
// publicly and without a forward-reference trick that would couple the
// helper to the module-scope singleton's lifetime.

/** Loads an escrow + its trade + verifies the seller-or-arbiter authorization
 *  every state transition from PAYMENT_PENDING/DISPUTED requires. */
async function loadEscrowWithAuthorization(
  service: EscrowService,
  escrowId: string,
  triggeredBy: string
): Promise<{ escrow: NonNullable<Awaited<ReturnType<typeof prisma.escrow.findUnique>>>; trade: NonNullable<Awaited<ReturnType<typeof prisma.trade.findUnique>>> }> {
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
  if (!escrow) throw new NotFoundError('Escrow', escrowId)
  const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
  if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
  if (!(await service.isSellerOrAssignedArbiter(trade.id, trade.sellerId, triggeredBy))) {
    throw new ForbiddenError(`${triggeredBy} is neither the seller of trade ${trade.id} nor its assigned dispute arbiter`)
  }
  return { escrow, trade }
}

/** Buyer/seller pubkeys from EscrowParticipantKey — only the non-custodial
 *  providers consume these. */
async function loadParticipantPubkeys(escrowId: string): Promise<{ buyerPubkey?: string; sellerPubkey?: string }> {
  const keys = await prisma.escrowParticipantKey.findMany({ where: { escrowId } })
  return {
    buyerPubkey: keys.find((k: { role: string }) => k.role === 'buyer')?.pubkey,
    sellerPubkey: keys.find((k: { role: string }) => k.role === 'seller')?.pubkey,
  }
}

/** Atomic escrow.status transition — the same conditional updateMany +
 *  count === 0 → throw + revert idiom every mutating method below uses
 *  (the robustness-audit fix from 2026-07-20). */
async function claimEscrowTransition(escrowId: string, fromStatus: string, toStatus: string): Promise<void> {
  // Defense in depth — the caller already validated the transition, but
  // re-checking here means a typo or future refactor that bypassed
  // assertTransition() surfaces as a loud EscrowError, not a silent no-op.
  const allowed = VALID_TRANSITIONS[fromStatus] ?? []
  if (!allowed.includes(toStatus)) {
    throw new EscrowError(`Invalid escrow transition: ${fromStatus} → ${toStatus}. Allowed: ${allowed.join(', ') || 'none'}`)
  }
  const claim = await prisma.escrow.updateMany({
    where: { id: escrowId, status: fromStatus as any },
    data: { status: toStatus as any },
  })
  if (claim.count === 0) {
    throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
  }
}

/** Revert-on-failure boilerplate — every provider call in this class wraps
 *  the same try/catch so a partial transition can never leave an escrow
 *  "claiming COMPLETED with no funds behind it." The .catch(() => {}) on
 *  the revert swallows the unlikely double-fault so the original provider
 *  error reaches the caller — they already saw the problem, a "revert
 *  also failed" chain would just bury the real failure. */
async function revertEscrowStatus(escrowId: string, status: string): Promise<void> {
  await prisma.escrow.update({ where: { id: escrowId }, data: { status: status as any } }).catch(() => {})
}

export class EscrowService {
  private getProvider(type: string): SettlementProvider {
    if (config.features.mockEscrow || type === 'MOCK') return PROVIDERS['MOCK']
    const provider = PROVIDERS[type]
    if (!provider) {
      // Correctness fix (found during the MULTISIG provider build): this
      // used to fall through to `?? PROVIDERS['MOCK']` for ANY
      // unregistered type — MULTISIG and LIQUID_COVENANT both silently
      // mock-processed real-money-shaped escrows with no error, unlike
      // LIGHTNING_HODL which at least throws "not yet implemented".
      // MULTISIG is now real (above); LIQUID_COVENANT still has no
      // provider, and now fails the same loud way LIGHTNING_HODL always
      // has, instead of quietly faking it.
      throw new EscrowError(
        `No SettlementProvider registered for escrow type '${type}' — refusing to silently fall back to MOCK for a type that claims to be real. ` +
        "Set MOCK_ESCROW=true (or type: 'MOCK') if a fake escrow is actually intended."
      )
    }
    return provider
  }

  // Shared by releaseFunds()/refundFunds() below — both are legitimately
  // triggered by either the seller (the normal path) or the arbiter
  // assigned to an open dispute on this trade (dispute.service.ts's
  // resolveDispute(), which validates the arbiter match itself *before*
  // calling into this class — this is a second, defense-in-depth check,
  // not the only one). Only queries Dispute when the cheaper seller
  // check already failed. Public (not private) so the module-level
  // `loadEscrowWithAuthorization` helper can call it without a forward-
  // reference trick that would couple that helper to the singleton's
  // lifetime — the same call surface as the `isSellerOrAssignedArbiter`
  // check dispute.service.ts's own resolveDispute() makes, no new
  // authority granted.
  async isSellerOrAssignedArbiter(tradeId: string, sellerId: string, triggeredBy: string): Promise<boolean> {
    if (isPartyOrAgent(triggeredBy, sellerId)) return true
    const dispute = await prisma.dispute.findFirst({ where: { tradeId, arbiterId: triggeredBy } })
    return dispute !== null
  }

  // RFC-021 D9 — exposed so dispute.service.ts's applyRuling() can route a
  // ruling to the right fund-movement mechanism. Bug found while building
  // SPLIT (2026-08-02): applyRuling() previously called releaseFunds()/
  // refundFunds() unconditionally for every escrow type, but those throw
  // "not directly callable" for MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM
  // (client-held keys — see each provider's own releaseFunds() stub) —
  // meaning a disputed RELEASE/REFUND on those three escrow types could
  // never actually resolve through resolveDispute() at all; the dispute
  // row's RESOLVED status got written then immediately reverted by
  // applyRuling()'s own catch block. Never caught before because no test
  // exercised resolveDispute() against a non-MOCK/WDK escrow. Fixed here,
  // for all three rulings uniformly, not just SPLIT: a signature-collection
  // type now routes through initiateRelease()/initiateRefund()/
  // initiateSplit() instead, which is consistent with how the *cooperative*
  // (non-disputed) path already works for these types — funds finish
  // moving once the winning party submits their own signature, not
  // synchronously inside resolveDispute() itself.
  isSignatureCollectionType(type: string): boolean {
    return type in SIGNATURE_COLLECTION_PROVIDERS
  }

  private async transition(
    escrowId: string,
    tradeId: string,
    from: string,
    to: string,
    triggeredBy: string,
    eventName: Parameters<typeof eventBus.emit>[0],
    eventExtra: Record<string, unknown> = {},
    note?: string
  ) {
    await prisma.escrowEvent.create({
      data: { escrowId, fromStatus: from as any, toStatus: to as any, triggeredBy, note },
    })
    // correlationId = tradeId (RFC-010) — stand-in for intentId until Intent
    // persistence exists; Trade already IS the concrete TradeIntent (§2.3).
    await eventBus.emit(eventName as any, {
      escrowId,
      tradeId,
      from,
      to,
      triggeredBy,
      ...eventExtra,
    }, tradeId)
  }

  private assertTransition(current: string, next: string) {
    const allowed = VALID_TRANSITIONS[current] ?? []
    if (!allowed.includes(next)) {
      throw new EscrowError(
        `Invalid escrow transition: ${current} → ${next}. Allowed: ${allowed.join(', ') || 'none'}`
      )
    }
  }

  // RFC-021 Phase 0 — real Protocol Fee computation + PROTOCOL_ECONOMY.md
  // §6.2's already-decided 40/30/20/10 split, persisted as a real
  // FeeDistribution row. Returns null (not 0) when protocolFeeRate is 0
  // (the documented bootstrap default) — see Escrow.feeCharged's own
  // schema comment for why that distinction matters. Called from
  // releaseFunds() only; PROTOCOL_ECONOMY.md §3 is explicit the Protocol
  // Fee "only ever attaches to a completed Settlement," never a refund.
  private async chargeProtocolFee(escrow: { id: string; lockedAmount: Prisma.Decimal | string; asset: string }): Promise<Prisma.Decimal | null> {
    const rate = config.settlement.protocolFeeRate
    if (!rate || rate <= 0) return null

    // Normalize: production always hands this a real Prisma.Decimal (the
    // raw prisma.escrow.findUnique() result), but tests mock the DB layer
    // with plain decimal strings (RFC-009 convention) — this must work
    // for both without asserting the type away.
    const lockedAmount = new Prisma.Decimal(escrow.lockedAmount)
    const totalFee = lockedAmount.times(rate)

    await prisma.feeDistribution.create({
      data: {
        escrowId: escrow.id,
        totalFee,
        asset: escrow.asset as AssetType,
        nodeOperatorShare: totalFee.times(0.4),
        treasuryShare: totalFee.times(0.3),
        walletRebateShare: totalFee.times(0.2),
        arbitratorReserveShare: totalFee.times(0.1),
      },
    })

    return totalFee
  }

  async createEscrow(input: CreateEscrowInput) {
    // Reads Trade only to validate existence — this is a read, not a write,
    // so it does not violate the module boundary (OpenSettlement may read
    // cross-module state; it must never WRITE to another module's tables).
    const trade = await prisma.trade.findUnique({ where: { id: input.tradeId } })
    if (!trade) throw new NotFoundError('Trade', input.tradeId)
    if (trade.escrowId) throw new EscrowError('Trade already has an escrow')

    const type = input.type ?? (config.features.mockEscrow ? 'MOCK' : recommendedEscrowType(input.asset))

    // MULTISIG/LIGHTNING_HODL's buyer/seller keys are now client-held
    // (each provider's own header comment) — the deposit address
    // genuinely cannot be derived yet at creation time, only once both
    // parties have submitted their pubkey via submitParticipantKey()
    // below. Escrow.multisigAddr stays null until then.
    const escrow = await prisma.escrow.create({
      data: {
        tradeId: input.tradeId,
        type: type as any,
        status: 'CREATED',
        lockedAmount: input.lockedAmount,
        asset: input.asset as any,
        network: input.network,
        timelockHours: input.timelockHours ?? config.trade.defaultTimelockHours,
      },
    })

    await eventBus.emit('settlement.escrow.created', {
      escrowId: escrow.id,
      tradeId: escrow.tradeId,
      type: escrow.type,
      lockedAmount: escrow.lockedAmount.toString(),   // RFC-009 — Decimal -> decimal string at the event boundary
      asset: escrow.asset,
    }, escrow.tradeId)   // correlationId = tradeId (RFC-010)

    return escrow
  }

  // The client-held-keys write path (2026-07-27) — buyer/seller each call
  // this once, from their own client, submitting only their public key
  // (their private key never leaves the browser; see multisig.provider.ts's
  // and lightning-hodl.provider.ts's own header comments for the full
  // custody-model disclosure). Idempotent per role: a party resubmitting
  // overwrites their own row (upsert), same shape as approveRelease()
  // above. Once both buyer and seller rows exist, derives and persists
  // the real deposit address — this is the only place that now happens,
  // replacing createEscrow()'s old immediate-population branch.
  async submitParticipantKey(escrowId: string, participantId: string, pubkey: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)

    const provider = NON_CUSTODIAL_PROVIDERS[escrow.type]
    if (!provider) {
      throw new EscrowError(`Escrow type '${escrow.type}' does not use client-submitted keys — nothing to submit`)
    }

    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)

    let role: 'buyer' | 'seller'
    if (participantId === trade.buyerId) role = 'buyer'
    else if (participantId === trade.sellerId) role = 'seller'
    else throw new ForbiddenError(`${participantId} is not a counterparty (buyer or seller) of trade ${trade.id}`)

    if (!PUBKEY_HEX_PATTERN.test(pubkey)) {
      throw new EscrowError('pubkey must be a 33-byte compressed secp256k1 public key, hex-encoded (66 hex characters, starting with 02 or 03)')
    }

    await prisma.escrowParticipantKey.upsert({
      where: { escrowId_role: { escrowId, role } },
      update: { participantId, pubkey },
      create: { escrowId, role, participantId, pubkey },
    })

    const keys = await prisma.escrowParticipantKey.findMany({ where: { escrowId } })
    const buyerKey = keys.find((k: { role: string }) => k.role === 'buyer')
    const sellerKey = keys.find((k: { role: string }) => k.role === 'seller')

    let updatedEscrow = escrow
    if (buyerKey && sellerKey && !escrow.multisigAddr && !config.features.mockEscrow) {
      const address = await provider.getDepositAddress(trade.id, buyerKey.pubkey, sellerKey.pubkey)
      updatedEscrow = await prisma.escrow.update({ where: { id: escrowId }, data: { multisigAddr: address } })
    }

    return { escrow: updatedEscrow, buyerKeySubmitted: !!buyerKey, sellerKeySubmitted: !!sellerKey }
  }

  async lockFunds(escrowId: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'FUNDS_LOCKED')

    // Locking collateral is the seller's own action — see this file's
    // isPartyOrAgent() doc comment for why an IDOR check was missing here.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(triggeredBy, trade.sellerId)) {
      throw new ForbiddenError(`${triggeredBy} is not the seller of trade ${trade.id} — only the seller may lock escrow funds`)
    }

    // ─── Robustness-audit fix (2026-07-20): claim the transition
    // atomically BEFORE calling the external provider, not after. The
    // old code read `escrow.status`, checked it in memory
    // (assertTransition above), then called the real, side-effecting
    // provider — two concurrent lockFunds() calls for the same escrow
    // (double-click, a retried request after a timeout) would both pass
    // that in-memory check before either write landed, so both would go
    // on to call provider.lockFunds(). For WDK_USDT_EVM that means two
    // real on-chain calls for one escrow. The shared claimEscrowTransition
    // helper makes Postgres itself the arbiter: only the request whose
    // WHERE still matches the row's *current* status affects a row —
    // the loser gets `count: 0` and is rejected before ever touching the
    // provider, not after. ────────────────────────────────────────────
    await claimEscrowTransition(escrowId, escrow.status, 'FUNDS_LOCKED')

    try {
      const provider = this.getProvider(escrow.type)
      // MULTISIG/LIGHTNING_HODL need the client-submitted pubkeys
      // (EscrowParticipantKey) to re-derive the same script lockFunds()
      // verifies against — every other provider ignores these extra
      // fields, same "optional, only two providers care" shape as
      // buyerId/sellerId below.
      const { buyerPubkey, sellerPubkey } = NON_CUSTODIAL_PROVIDERS[escrow.type]
        ? await loadParticipantPubkeys(escrowId)
        : { buyerPubkey: undefined, sellerPubkey: undefined }
      const result = await provider.lockFunds({
        ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, buyerPubkey, sellerPubkey,
      } as unknown as EscrowRecord)

      const now = new Date()
      const expiresAt = new Date(now.getTime() + escrow.timelockHours * 3600 * 1000)

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txLockId: result.txId, multisigAddr: result.address, lockedAt: now, expiresAt },
      })

      // NOTE: previously this method also called prisma.trade.update(...) to set
      // Trade.status = 'ACTIVE'. That write belonged to OpenP2P, not here. The
      // OpenP2P trade handler now does this in reaction to the event below.
      await this.transition(escrowId, escrow.tradeId, 'CREATED', 'FUNDS_LOCKED', triggeredBy, 'settlement.escrow.locked', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      // Revert the claim — an escrow left claiming FUNDS_LOCKED with no
      // real lock behind it (the provider call failed) would otherwise
      // block every future lockFunds() attempt via assertTransition,
      // with no way to retry. Same revert-on-failure idiom
      // dispute.service.ts's resolveDispute() already established.
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  async markPaymentSent(escrowId: string, triggeredBy: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'PAYMENT_PENDING')

    // Claiming fiat was sent is the buyer's own claim — see isPartyOrAgent()'s doc comment.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(triggeredBy, trade.buyerId)) {
      throw new ForbiddenError(`${triggeredBy} is not the buyer of trade ${trade.id} — only the buyer may confirm payment sent`)
    }

    // No external provider call here, but still atomic (robustness audit,
    // 2026-07-20) — a double-click could otherwise write the same
    // transition twice, emitting settlement.escrow.payment_pending
    // twice for one real event.
    const claim = await prisma.escrow.updateMany({
      where: { id: escrowId, status: escrow.status },
      data: { status: 'PAYMENT_PENDING' },
    })
    if (claim.count === 0) {
      throw new EscrowError(`Escrow ${escrowId} was already transitioned by a concurrent request`)
    }
    const updated = await prisma.escrow.findUnique({ where: { id: escrowId } })

    await this.transition(
      escrowId,
      escrow.tradeId,
      'FUNDS_LOCKED',
      'PAYMENT_PENDING',
      triggeredBy,
      'settlement.escrow.payment_pending'
    )

    return updated
  }

  // BACKLOG.md's own "Participant payout address" gap, closed 2026-08-04
  // — see payout-address.service.ts's own header comment for the full
  // rationale. Never fabricates a value (CODE_STYLE.md §2): an explicit
  // address always wins; absent that, falls back to the participant's
  // own registered PayoutAddress for this escrow's asset; absent BOTH,
  // throws a clear, specific error naming exactly what's missing rather
  // than guessing.
  private async resolvePayoutAddress(explicitAddress: string | undefined, participantId: string, asset: AssetType): Promise<string> {
    if (explicitAddress) return explicitAddress
    const registered = await payoutAddressService.getPayoutAddress(participantId, asset)
    if (!registered) {
      throw new EscrowError(
        `No payout address provided for participant ${participantId} (asset ${asset}), and none is registered — ` +
        'register one via POST /v1/settlement/payout-addresses first, or pass an explicit address to this call.'
      )
    }
    return registered.address
  }

  async releaseFunds(escrowId: string, toAddress: string | undefined, triggeredBy: string) {
    const { escrow, trade } = await loadEscrowWithAuthorization(this, escrowId, triggeredBy)
    this.assertTransition(escrow.status, 'COMPLETED')
    const resolvedToAddress = await this.resolvePayoutAddress(toAddress, trade.buyerId, escrow.asset)

    // RFC-014: the real capability check. Lives here, not in
    // settlement-orchestrator.ts (where it originally shipped) — found
    // while implementing RFC-015 that this is the actual single choke
    // point every real release goes through (settlement-orchestrator.ts's
    // executeSettlement(), settlement.routes.ts's direct
    // POST /v1/settlement/escrow/:id/release, and dispute.service.ts's
    // arbitrated resolveDispute()); a check placed only in the
    // orchestrator silently missed the other two. Off by default
    // (config.features.enforceCapabilities) — see that flag's own doc
    // comment in config/index.ts.
    if (config.features.enforceCapabilities) {
      const capabilityName = CAPABILITY_IMPLEMENTATIONS.opensettlement
      const allowed = await capabilityRegistry.check(triggeredBy, capabilityName, 'settlement.escrow.released')
      if (!allowed) {
        throw new ForbiddenError(
          `${triggeredBy} has no active '${capabilityName}' capability grant covering 'settlement.escrow.released'`
        )
      }
    }

    // RFC-015: two-person control. Only on the normal (non-disputed)
    // path — escrow.status is still the pre-transition value here
    // (PAYMENT_PENDING for a normal release, DISPUTED for an arbitrated
    // one, both allowed by assertTransition above). An arbitrated release
    // already went through dispute.service.ts's own authorization
    // (only the assigned, TRUSTED_ARBITRATORS-configured arbiter may
    // call resolveDispute()) — requiring the original two counterparties
    // to *also* agree would defeat the point of arbitration existing at
    // all (if they could still agree, there'd be no dispute). Off by
    // default (config.features.requireDualApprovalForRelease) — see that
    // flag's own doc comment in config/index.ts.
    if (config.features.requireDualApprovalForRelease && escrow.status === 'PAYMENT_PENDING') {
      const dual = await this.hasDualApproval(escrowId)
      if (!dual) {
        throw new EscrowError(
          `Release blocked: both counterparties must call POST /v1/settlement/escrow/${escrowId}/approve-release ` +
          'before funds can be released (RFC-015 two-person control).'
        )
      }
    }

    // ─── Robustness-audit fix (2026-07-20), the highest-severity finding
    // of this pass: this is the one call in the entire codebase that can
    // move real money (WDK_USDT_EVM signs and broadcasts a real on-chain
    // USDT transfer). The old code called `provider.releaseFunds()`
    // straight after the in-memory `assertTransition` check above, with
    // no DB-level guard before it — two concurrent releaseFunds() calls
    // for the same escrow (a double-click, a client retrying after a
    // timeout that actually succeeded server-side, or a race between
    // executeSettlement()'s auto-settle path and a manual API call)
    // would both pass assertTransition before either write landed, and
    // both would go on to sign and broadcast a real transfer — an actual
    // double-payment, not a theoretical one. Fixed the same way
    // lockFunds() above now is: atomically claim COMPLETED via a
    // conditional `updateMany` *before* ever calling the provider, so a
    // concurrent loser is rejected before touching real funds, not after.
    await claimEscrowTransition(escrowId, escrow.status, 'COMPLETED')

    try {
      const provider = this.getProvider(escrow.type)
      const result = await provider.releaseFunds(
        { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, triggeredBy } as unknown as EscrowRecord,
        resolvedToAddress
      )

      // RFC-021 Phase 0 — real Protocol Fee (PROTOCOL_ECONOMY.md §3/§6.2).
      // "Only ever attaches to a completed Settlement" — computed here,
      // not in refundFunds() below, deliberately. config.settlement.
      // protocolFeeRate defaults to 0 (the documented bootstrap-phase
      // default), in which case feeCharged stays null and no
      // FeeDistribution row is created — a deployment that hasn't opted
      // into fees yet persists nothing extra.
      const feeCharged = await this.chargeProtocolFee(escrow)

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txId, releasedAt: new Date(), feeCharged },
      })

      // NOTE: previously this method also updated Trade.status/completedAt AND
      // incremented User.totalTrades/totalVolumeBtc directly (reaching into
      // OpenP2P's and OpenReputation's domains). Both writes are now owned by
      // their respective modules, triggered by the event emitted below.
      await this.transition(escrowId, escrow.tradeId, escrow.status, 'COMPLETED', triggeredBy, 'settlement.escrow.released', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      // Revert the claim — see lockFunds()'s identical comment. Critical
      // here specifically: without this, a failed release (provider
      // threw, e.g. RPC error) would leave the escrow permanently stuck
      // claiming COMPLETED with `txReleaseId: null` — funds neither
      // released nor recoverable through this service again.
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  async openDispute(escrowId: string, triggeredBy: string, reason: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    this.assertTransition(escrow.status, 'DISPUTED')

    // Defense in depth: dispute.service.ts's raiseDispute() already makes
    // this exact check before ever calling here (its only real caller
    // today) — kept here too so this method is safe to call directly if
    // a second caller is ever added, consistent with the "the real check
    // belongs at the actual choke point" lesson from RFC-014/015.
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!isPartyOrAgent(triggeredBy, trade.buyerId) && !isPartyOrAgent(triggeredBy, trade.sellerId)) {
      throw new ForbiddenError(`${triggeredBy} is not a party to trade ${trade.id}`)
    }

    // Atomic conditional update — see lockFunds()'s comment. No external
    // provider call here, but dispute.service.ts's raiseDispute() itself
    // already has its own @@unique([tradeId]) guard at the Dispute-row
    // level (2026-07-19 security round); this closes the same race one
    // layer down, at the Escrow row this method actually mutates.
    await claimEscrowTransition(escrowId, escrow.status, 'DISPUTED')
    const updated = await prisma.escrow.findUnique({ where: { id: escrowId } })

    await this.transition(
      escrowId,
      escrow.tradeId,
      escrow.status,
      'DISPUTED',
      triggeredBy,
      'settlement.escrow.disputed',
      {},
      reason
    )

    return updated
  }

  async refundFunds(escrowId: string, triggeredBy: string) {
    const { escrow, trade } = await loadEscrowWithAuthorization(this, escrowId, triggeredBy)
    this.assertTransition(escrow.status, 'REFUNDED')

    // Same fix as releaseFunds() above, same reason: claim REFUNDED
    // atomically before ever calling the real, side-effecting provider.
    await claimEscrowTransition(escrowId, escrow.status, 'REFUNDED')

    try {
      const provider = this.getProvider(escrow.type)
      const result = await provider.refundFunds(
        { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, triggeredBy } as unknown as EscrowRecord
      )

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txId },
      })

      await this.transition(escrowId, escrow.tradeId, escrow.status, 'REFUNDED', triggeredBy, 'settlement.escrow.refunded', {
        txId: result.txId,
      })

      return updated
    } catch (err) {
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  // RFC-021 D9 (2026-08-02) — the direct-call half of SPLIT's real
  // settlement action, for providers in PROVIDERS that move funds
  // synchronously in one call (MOCK, WDK_USDT_EVM this pass). Mirrors
  // releaseFunds()/refundFunds() above exactly (same authorization check,
  // same atomic-claim-before-provider-call race protection) — only
  // reachable from DISPUTED (VALID_TRANSITIONS), since SPLIT has no
  // non-disputed happy path. See initiateSplit() below for the
  // client-signature-collection equivalent (MULTISIG).
  async splitFunds(escrowId: string, buyerAddress: string | undefined, sellerAddress: string | undefined, buyerBps: number, triggeredBy: string) {
    if (!(buyerBps > 0 && buyerBps < 10000)) {
      throw new ValidationError('buyerBps must be strictly between 0 and 10000 for a real split — use release/refund for an all-or-nothing outcome')
    }
    const { escrow, trade } = await loadEscrowWithAuthorization(this, escrowId, triggeredBy)
    this.assertTransition(escrow.status, 'SPLIT')
    const resolvedBuyerAddress = await this.resolvePayoutAddress(buyerAddress, trade.buyerId, escrow.asset)
    const resolvedSellerAddress = await this.resolvePayoutAddress(sellerAddress, trade.sellerId, escrow.asset)

    const provider = this.getProvider(escrow.type)
    if (!provider.splitFunds) {
      throw new EscrowError(
        `Escrow type '${escrow.type}' does not support a SPLIT settlement action — see that provider's own splitFunds()/buildUnsignedSplit() comment for the specific reason (contract/protocol limitation, not a missing wire-up).`
      )
    }

    await claimEscrowTransition(escrowId, escrow.status, 'SPLIT')

    try {
      const result = await provider.splitFunds(
        { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, triggeredBy } as unknown as EscrowRecord,
        resolvedBuyerAddress,
        resolvedSellerAddress,
        buyerBps
      )

      const updated = await prisma.escrow.update({
        where: { id: escrowId },
        data: { txReleaseId: result.txIds.join(','), releasedAt: new Date() },
      })

      // Joined into the shared txId?: string field (SettlementEscrowStatusChangedEvent)
      // rather than widening that event's payload for the one settlement
      // action that can produce two transaction hashes instead of one.
      await this.transition(escrowId, escrow.tradeId, escrow.status, 'SPLIT', triggeredBy, 'settlement.escrow.split', {
        txId: result.txIds.join(','),
      })

      return updated
    } catch (err) {
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  // Phase 2 client-signature-collection flow (2026-07-27) — the real
  // replacement for the direct releaseFunds() call above, for providers in
  // SIGNATURE_COLLECTION_PROVIDERS (MULTISIG only this pass). Runs the
  // exact same ownership/capability/dual-approval checks releaseFunds()
  // already has, but does NOT transition escrow.status or write
  // txReleaseId itself — it only builds and persists an unsigned PSBT for
  // the required parties to sign. The real transition happens inside
  // submitTransactionSignature() below, once every required signature has
  // arrived.
  // ─── Shared skeleton for initiateRelease/Refund/Split ──────────────────────
  // These three methods are 90% identical (~90 lines each). Extracted the
  // shared validation + provider lookup + pending-transaction-create skeleton
  // into this private helper to eliminate ~180 lines of duplication. Each
  // public method only adds its own specific pre-checks (capability,
  // dual-approval, builderBps validation) and provider call.
  private async initiateSignatureCollection(
    escrowId: string,
    kind: 'release' | 'refund' | 'split',
    targetStatus: string,
    triggeredBy: string,
    buildProvider: (provider: any, escrowRecord: any) => Promise<{ psbtBase64: string; requiredSigners: string[]; toAddress?: string; toAddressSecondary?: string }>,
    extraData?: Record<string, unknown>
  ) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)

    const provider = SIGNATURE_COLLECTION_PROVIDERS[escrow.type]
    if (!provider) {
      throw new EscrowError(
        `Escrow type '${escrow.type}' does not use the client-signature-collection ${kind} flow`
      )
    }
    this.assertTransition(escrow.status, targetStatus as any)

    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    if (!(await this.isSellerOrAssignedArbiter(trade.id, trade.sellerId, triggeredBy))) {
      throw new ForbiddenError(`${triggeredBy} is neither the seller of trade ${trade.id} nor its assigned dispute arbiter`)
    }

    const existingPending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
    if (existingPending) {
      throw new EscrowError(`Escrow ${escrowId} already has a pending ${existingPending.kind} transaction awaiting signatures`)
    }

    const { buyerPubkey, sellerPubkey } = await loadParticipantPubkeys(escrowId)
    const escrowRecord = { ...escrow, buyerId: trade.buyerId, sellerId: trade.sellerId, buyerPubkey, sellerPubkey }

    const result = await buildProvider(provider, escrowRecord)

    try {
      return await prisma.escrowPendingTransaction.create({
        data: {
          escrowId,
          kind,
          toAddress: result.toAddress!,
          ...(result.toAddressSecondary ? { toAddressSecondary: result.toAddressSecondary } : {}),
          unsignedPsbtBase64: result.psbtBase64,
          requiredSigners: result.requiredSigners,
          triggeredBy,
          ...extraData,
        },
      })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new EscrowError(`Escrow ${escrowId} already has a pending transaction awaiting signatures (concurrent initiate)`)
      }
      throw err
    }
  }

  async initiateRelease(escrowId: string, toAddress: string | undefined, triggeredBy: string) {
    // Capability check — only release has this (RFC-014).
    if (config.features.enforceCapabilities) {
      const capabilityName = CAPABILITY_IMPLEMENTATIONS.opensettlement
      const allowed = await capabilityRegistry.check(triggeredBy, capabilityName, 'settlement.escrow.released')
      if (!allowed) {
        throw new ForbiddenError(
          `${triggeredBy} has no active '${capabilityName}' capability grant covering 'settlement.escrow.released'`
        )
      }
    }
    // Dual-approval check — only release has this (RFC-015).
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    if (config.features.requireDualApprovalForRelease && escrow.status === 'PAYMENT_PENDING') {
      const dual = await this.hasDualApproval(escrowId)
      if (!dual) {
        throw new EscrowError(
          `Release blocked: both counterparties must call POST /v1/settlement/escrow/${escrowId}/approve-release ` +
          'before funds can be released (RFC-015 two-person control).'
        )
      }
    }
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    const resolvedToAddress = await this.resolvePayoutAddress(toAddress, trade.buyerId, escrow.asset)

    return this.initiateSignatureCollection(
      escrowId, 'release', 'COMPLETED', triggeredBy,
      (provider, record) => provider.buildUnsignedRelease(record, resolvedToAddress).then((r: any) => ({ ...r, toAddress: resolvedToAddress }))
    )
  }

  async initiateRefund(escrowId: string, triggeredBy: string) {
    return this.initiateSignatureCollection(
      escrowId, 'refund', 'REFUNDED', triggeredBy,
      (provider, record) => provider.buildUnsignedRefund(record)
    )
  }

  async initiateSplit(escrowId: string, buyerAddress: string | undefined, sellerAddress: string | undefined, buyerBps: number, triggeredBy: string) {
    if (!(buyerBps > 0 && buyerBps < 10000)) {
      throw new ValidationError('buyerBps must be strictly between 0 and 10000 for a real split — use release/refund for an all-or-nothing outcome')
    }
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
    const resolvedBuyerAddress = await this.resolvePayoutAddress(buyerAddress, trade.buyerId, escrow.asset)
    const resolvedSellerAddress = await this.resolvePayoutAddress(sellerAddress, trade.sellerId, escrow.asset)

    return this.initiateSignatureCollection(
      escrowId, 'split', 'SPLIT', triggeredBy,
      (provider, record) => {
        if (!provider.buildUnsignedSplit) {
          throw new EscrowError(
            `Escrow type '${record.type}' does not support a SPLIT settlement action — see that provider's own buildUnsignedSplit() comment for the specific reason (contract/protocol limitation, not a missing wire-up).`
          )
        }
        return provider.buildUnsignedSplit(record, resolvedBuyerAddress, resolvedSellerAddress, buyerBps).then((r: any) => ({ ...r, toAddress: resolvedBuyerAddress, toAddressSecondary: resolvedSellerAddress }))
      }
    )
  }

  // The signature-collection write path — each required signer (from
  // EscrowPendingTransaction.requiredSigners) calls this once, submitting
  // their own independently-signed copy of the unsigned PSBT
  // (`@sails/sdk`'s signEscrowPsbt()). Upsert-idempotent per participant,
  // same shape as submitParticipantKey()/approveRelease() above. Once
  // every required signer has submitted, combines + broadcasts for real
  // (provider.finalizeRelease()/finalizeRefund()) and performs the same
  // atomic status-claim releaseFunds()/refundFunds() already do, so the
  // race protection those methods have is preserved here too.
  async submitTransactionSignature(escrowId: string, participantId: string, signedPsbtBase64: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)

    const pending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId } })
    if (!pending) {
      throw new EscrowError(`Escrow ${escrowId} has no pending transaction awaiting signatures — call initiate-release/initiate-refund (or, for a dispute SPLIT ruling, resolveDispute()) first`)
    }
    if (!pending.requiredSigners.includes(participantId)) {
      throw new ForbiddenError(
        `${participantId} is not one of the required signers (${pending.requiredSigners.join(', ')}) for escrow ${escrowId}'s pending ${pending.kind}`
      )
    }

    await prisma.escrowTransactionSignature.upsert({
      where: { pendingTxId_participantId: { pendingTxId: pending.id, participantId } },
      update: { signedPsbtBase64 },
      create: { pendingTxId: pending.id, participantId, signedPsbtBase64 },
    })

    const signatures = await prisma.escrowTransactionSignature.findMany({ where: { pendingTxId: pending.id } })
    const submittedIds = new Set(signatures.map((s: { participantId: string }) => s.participantId))
    const allSubmitted = pending.requiredSigners.every((id: string) => submittedIds.has(id))

    if (!allSubmitted) {
      return { pendingTransaction: pending, complete: false, submittedCount: signatures.length, requiredCount: pending.requiredSigners.length }
    }

    const provider = SIGNATURE_COLLECTION_PROVIDERS[escrow.type]
    if (!provider) {
      // Cannot happen in practice — a pending row only exists for a type
      // registered in SIGNATURE_COLLECTION_PROVIDERS — but stated loudly
      // rather than silently, consistent with getProvider()'s own comment.
      throw new EscrowError(`Escrow type '${escrow.type}' has a pending transaction but no registered SignatureCollectionProvider`)
    }
    const targetStatus = pending.kind === 'release' ? 'COMPLETED' : pending.kind === 'refund' ? 'REFUNDED' : 'SPLIT'

    // Validate that the provider supports the required finalization method
    if (pending.kind === 'split' && !provider.finalizeSplit) {
      throw new EscrowError(`Escrow type '${escrow.type}' does not support split finalization — buildUnsignedSplit was allowed but finalizeSplit is not implemented`)
    }

    // Atomic claim before ever calling the real, side-effecting provider —
    // same idiom as releaseFunds()/refundFunds() above.
    await claimEscrowTransition(escrowId, escrow.status, targetStatus)

    try {
      const signedList = pending.requiredSigners.map(
        (id: string) => signatures.find((s: { participantId: string; signedPsbtBase64: string }) => s.participantId === id)!.signedPsbtBase64
      )
      const result = pending.kind === 'release'
        ? await provider.finalizeRelease(escrow, pending.unsignedPsbtBase64, signedList)
        : pending.kind === 'refund'
        ? await provider.finalizeRefund(escrow, pending.unsignedPsbtBase64, signedList)
        : await provider.finalizeSplit!(escrow, pending.unsignedPsbtBase64, signedList)

      const updateData = pending.kind === 'refund'
        ? { txReleaseId: result.txId }
        : { txReleaseId: result.txId, releasedAt: new Date() }
      const updated = await prisma.escrow.update({ where: { id: escrowId }, data: updateData })

      const eventName = pending.kind === 'release'
        ? 'settlement.escrow.released'
        : pending.kind === 'refund'
        ? 'settlement.escrow.refunded'
        : 'settlement.escrow.split'
      await this.transition(escrowId, escrow.tradeId, escrow.status, targetStatus, pending.triggeredBy, eventName, {
        txId: result.txId,
      })

      // Cascade-deletes its EscrowTransactionSignature rows (schema.prisma's
      // onDelete: Cascade) — a completed round leaves no pending row behind.
      await prisma.escrowPendingTransaction.delete({ where: { id: pending.id } }).catch(() => {})

      return { escrow: updated, complete: true }
    } catch (err) {
      // Revert the claim — see releaseFunds()'s identical comment. The
      // pending row and its signatures are left in place on failure so the
      // caller can retry submitTransactionSignature() (idempotent upsert)
      // without needing to re-collect signatures already submitted.
      await revertEscrowStatus(escrowId, escrow.status)
      throw err
    }
  }

  async getPendingTransaction(escrowId: string) {
    const pending = await prisma.escrowPendingTransaction.findUnique({
      where: { escrowId },
      include: { signatures: true },
    })
    if (!pending) throw new NotFoundError('EscrowPendingTransaction', escrowId)
    return pending
  }

  // RFC-015 — the two-person control's write path. Reads Trade only to
  // validate the approver is actually one of this trade's own two
  // counterparties (the same "read is fine, write is not" boundary
  // createEscrow() above already relies on) — never writes to it.
  // Idempotent: the same approver calling twice just returns the
  // existing row rather than erroring, since re-confirming isn't
  // meaningfully different from confirming once.
  async approveRelease(escrowId: string, approverId: string) {
    const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)

    const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
    if (!trade) throw new NotFoundError('Trade', escrow.tradeId)

    if (approverId !== trade.buyerId && approverId !== trade.sellerId) {
      throw new ForbiddenError(`${approverId} is not a counterparty (buyer or seller) of trade ${trade.id}`)
    }

    return prisma.escrowReleaseApproval.upsert({
      where: { escrowId_approverId: { escrowId, approverId } },
      update: {},
      create: { escrowId, approverId },
    })
  }

  async getReleaseApprovals(escrowId: string) {
    return prisma.escrowReleaseApproval.findMany({ where: { escrowId }, orderBy: { approvedAt: 'asc' } })
  }

  // Distinct-approver count >= 2 — the @@unique([escrowId, approverId])
  // constraint (schema.prisma) already guarantees no approver is counted
  // twice, so a plain count is sufficient.
  async hasDualApproval(escrowId: string): Promise<boolean> {
    const count = await prisma.escrowReleaseApproval.count({ where: { escrowId } })
    return count >= 2
  }

  // `disputes` — real gap found while closing the arbiter's own dispute-
  // discovery gap (settlement.routes.ts's new GET /v1/settlement/disputes):
  // whoever CALLS raiseDispute() gets the created Dispute row directly in
  // that response, but the OTHER trade party — who didn't open it — had no
  // way to ever learn the disputeId at all. No listener reacts to
  // `dispute.opened` to push it over the trade's WebSocket room either.
  // `Escrow.disputes` (schema.prisma) already existed as a relation; this
  // just includes it, so the same public GET a trade party already polls
  // for escrow status now also answers "is there a dispute, and what's its
  // id" — no schema change, no new route needed.
  async getEscrow(escrowId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { id: escrowId },
      include: { events: { orderBy: { createdAt: 'asc' } }, disputes: true },
    })
    if (!escrow) throw new NotFoundError('Escrow', escrowId)
    return escrow
  }

  async getEscrowByTrade(tradeId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { tradeId },
      include: { events: { orderBy: { createdAt: 'asc' } }, disputes: true },
    })
    if (!escrow) throw new NotFoundError('Escrow for trade', tradeId)
    return escrow
  }

  // Real gap found (BACKLOG.md P0, "Escrow timelock proactive sweeper"):
  // lockFunds() computes and stores a real Escrow.expiresAt, but nothing
  // ever read it back — a FUNDS_LOCKED escrow whose counterparty never
  // returns stayed locked forever, with no automatic path back to
  // REFUNDED. This is the "notice time has passed" trigger that row
  // said was the only missing piece; refundFunds() itself already
  // existed and is reused unchanged below.
  //
  // triggeredBy is always the trade's own sellerId, never a fabricated
  // "system" actor — isSellerOrAssignedArbiter() only accepts the real
  // seller or an assigned arbiter (INV-OP-1), and a timelock refund
  // returns the seller their own locked collateral, the same effect the
  // seller could trigger themselves by calling this route directly once
  // expiresAt has passed. This mirrors settlement-orchestrator.ts's own
  // `sellerTriggeredBy` precedent for automated, non-human-initiated
  // calls into this same method.
  //
  // Per-escrow try/catch, same "one failure must not stop the rest"
  // shape as getAggregatedOffers() (liquidity.service.ts) — a single
  // stuck/already-transitioning escrow must not block every other
  // legitimately expired one in the same sweep.
  async sweepExpiredEscrows(): Promise<{ refunded: string[]; failed: Array<{ escrowId: string; error: string }> }> {
    const expired = await prisma.escrow.findMany({
      where: { status: 'FUNDS_LOCKED', expiresAt: { lt: new Date() } },
    })

    const refunded: string[] = []
    const failed: Array<{ escrowId: string; error: string }> = []

    for (const escrow of expired) {
      try {
        const trade = await prisma.trade.findUnique({ where: { id: escrow.tradeId } })
        if (!trade) throw new NotFoundError('Trade', escrow.tradeId)
        await this.refundFunds(escrow.id, trade.sellerId)
        refunded.push(escrow.id)
      } catch (err) {
        failed.push({ escrowId: escrow.id, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return { refunded, failed }
  }
}

export const escrowService = new EscrowService()
