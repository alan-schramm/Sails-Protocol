import { AssetType } from '../../common/types'
import { EscrowType } from '../../common/types/trade'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import { randomUUID as uuidv4 } from 'crypto'
import { wdkSettlementProvider } from './wdk-settlement.provider'
import { multisigProvider } from './multisig.provider'
import { lightningHodlProvider } from './lightning-hodl.provider'
import { safeGuardEvmProvider } from './safe-guard-evm.provider'

/**
 * Sails OpenSettlement — SettlementProvider registry (ARCHITECTURE_AUDIT_REPORT.md
 * §2's "escrow.service.ts" finding, recommendation #1: "extrair em pelo
 * menos 4 módulos focados: ciclo de vida, registry de providers,
 * dual-approval, transações pendentes" — closed 2026-08-08).
 *
 * Everything in this file was previously inline in escrow.service.ts.
 * Moved verbatim (no behavior change) — this is the "which real
 * settlement backend handles this escrow type" concern, genuinely
 * separable from the lifecycle state machine in escrow.service.ts that
 * calls into it.
 */

export type EscrowRecord = {
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
  // Missão 10 — the funding UTXO's vout, alongside txLockId's own
  // (unchanged) txid. Null for every escrow that locked funds before
  // this migration, and for every non-Bitcoin provider (EVM/mock
  // providers have no outpoint concept) — multisig.provider.ts's
  // buildUnsignedSpend() falls back to its pre-existing txid-only match
  // only when this is null.
  txLockVout: number | null
  txReleaseId: string | null
  timelockHours: number
  lockedAt: Date | null
  expiresAt: Date | null
  releasedAt: Date | null
  createdAt: Date
  updatedAt: Date
  // Trade's own parties — Escrow itself has no buyer/seller columns
  // (OpenSettlement must never own Trade's data, see escrow.service.ts's
  // header comment), so these are attached by lockFunds()/releaseFunds()/
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
  // Missão 11 Fase 4 — the escrow's own immutable fee-policy snapshot
  // (Escrow columns, Fase 2.2/2.3). Already carried through by every real
  // call site's existing `{ ...escrow, ... }` spread (escrow.service.ts/
  // escrow-pending-tx.ts) — declared here so provider code can read them
  // with real types instead of an unsafe cast. Null/undefined for every
  // legacy escrow, unchanged behavior.
  feePolicyVersionId?: string | null
  snapshotProtocolFeeRate?: string | null
  fundedAmount?: string | null
  // Missão 11 Fase 4.1 — the frozen collection destination and
  // pre-funding-waiver decision (see multisig.provider.ts's own
  // MultisigEscrowInput comment for the full explanation). Same
  // null/undefined-for-legacy convention as the other snapshot fields.
  snapshotFeeCollectionAddress?: string | null
  snapshotFeeCollectionWaivedPreFunding?: boolean | null
}

// ─── SettlementProvider — the protocol interface (Sails Protocol Spec) ────────
export interface SettlementProvider {
  name: string
  // Missão 10 — vout is optional and additive: only providers with a
  // real Bitcoin-style outpoint (MULTISIG) populate it; every other
  // provider's existing return shape ({txId, address}) still satisfies
  // this type unchanged.
  // Missão 11 Fase 4 — fundedAmount is optional/additive: only providers
  // that observe a real external funding amount (MULTISIG) populate it;
  // every other provider's existing return shape stays valid unchanged.
  // Purely observational (escrow.service.ts persists it to Escrow.fundedAmount
  // for policy-aware escrows only) — never the source of truth for
  // construction, which always re-reads the real chain/provider state.
  lockFunds(escrow: EscrowRecord): Promise<{ txId: string; address: string; vout?: number; fundedAmount?: number }>
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

export const PROVIDERS: Record<string, SettlementProvider> = {
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
// Missão 11 Fase 5.2 §2 — getDepositAddress()'s return shape widened from a
// bare address string to include the arbiter commitment MultisigProvider
// now resolves as part of the SAME script-building call (never a second,
// independent derivation — see its own header comment). arbiterPubkeyHex/
// arbiterId are optional: LIGHTNING_HODL/SAFE_GUARD_EVM don't populate them
// (out of this phase's scope — their own analogous arbiter-commitment gap
// is disclosed, not fixed, in this mission's report), so they simply wrap
// their existing address in `{ address }` and leave the rest undefined.
export const NON_CUSTODIAL_PROVIDERS: Record<string, { getDepositAddress(tradeId: string, buyerPubkey: string, sellerPubkey: string): Promise<{ address: string; arbiterPubkeyHex?: string; arbiterId?: string }> }> = {
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
// Missão 11 Fase 4 — populated only by a provider that actually implements
// fee-aware output construction (MULTISIG this pass); null/absent for a
// legacy (non-policy-aware) escrow, and for any provider that hasn't been
// extended yet (LIGHTNING_HODL/SAFE_GUARD_EVM — see this mission's own
// rail-parity audit for why their construction is deliberately unchanged
// this phase). Lets escrow-pending-tx.ts persist the real, actually-built
// fee amount as collection evidence, rather than a second independent
// recomputation.
export interface FeeCollectionResult {
  feeSats: number
  waived: boolean
}

export interface SignatureCollectionProvider {
  buildUnsignedRelease(escrow: unknown, toAddress: string): Promise<{ psbtBase64: string; requiredSigners: string[]; feeCollection?: FeeCollectionResult | null }>
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
  buildUnsignedSplit?(escrow: unknown, buyerAddress: string, sellerAddress: string, buyerBps: number): Promise<{ psbtBase64: string; requiredSigners: string[]; feeCollection?: FeeCollectionResult | null }>
  finalizeSplit?(escrow: unknown, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }>
}
export const SIGNATURE_COLLECTION_PROVIDERS: Record<string, SignatureCollectionProvider> = {
  MULTISIG: multisigProvider,
  LIGHTNING_HODL: lightningHodlProvider,
  SAFE_GUARD_EVM: safeGuardEvmProvider,
}

// 33-byte compressed secp256k1 pubkey, hex — the canonical client-submitted
// format both MULTISIG and LIGHTNING_HODL derive their own required
// representation from (see each provider's own header comment).
export const PUBKEY_HEX_PATTERN = /^0[23][0-9a-fA-F]{64}$/

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

// Missão 11 Fase 5 §10 — Rail Activation Gating. Fee-collection capability
// is SEPARATE from settlement capability: implementing SettlementProvider
// (every rail in PROVIDERS above) does not imply real, atomic Protocol Fee
// construction. Only MULTISIG builds a real Sails fee output today (Fase
// 4/4.1) — this is the ONE place that truth is declared, consumed by both
// escrow-fee-snapshot.service.ts's pre-funding check and
// fee-policy.service.ts's publish()-time activation gate, so the two
// questions ("is this rail collection-capable" and "can this rail's
// policy go live") can never independently drift. Extend this set only
// once a rail's own buildUnsignedRelease()/buildUnsignedSplit() actually
// construct a real, tested fee output — never in anticipation of one.
export const FEE_COLLECTION_CAPABLE_RAILS: ReadonlySet<string> = new Set(['MULTISIG'])

// The five real EscrowType values this gate applies to — deliberately
// NOT every possible railScope string. FeePolicyVersion.railScope is
// intentionally free-form (this file's own EscrowRecord/PROVIDERS
// comments explain why), and this codebase's own isolated accounting
// tests (Fase 2.2/3) legitimately publish policies against fixture rail
// names that were never meant to represent a real settlement rail — this
// gate must never reject those. It only ever fires for a railScope that
// IS one of these five real, addressable rails.
const REAL_ESCROW_TYPES: ReadonlySet<string> = new Set(['MULTISIG', 'LIGHTNING_HODL', 'SAFE_GUARD_EVM', 'WDK_USDT_EVM', 'MOCK'])

// Missão 11 Fase 4.2's own Activation Blocker B, closed here: a
// FeePolicyVersion must not become active for a rail with no real
// fee-aware collection — publishing one for LIGHTNING_HODL/SAFE_GUARD_EVM/
// WDK_USDT_EVM/MOCK would silently create FeeObligation rows reporting a
// real, positive computedFee while the underlying settlement never
// collects a single unit. Two real call sites use this identically:
// fee-policy.service.ts's publish() (the real production activation gate)
// and escrow-fee-snapshot.service.ts's computeSnapshotFields() (a second,
// defense-in-depth check — catching a policy that somehow reached
// PUBLISHED status without going through publish(), e.g. a raw-SQL
// insert, which should never happen via any real application path but
// must fail loudly, not silently snapshot, if it ever does).
export function assertRailCanActivateFeeCollection(railScope: string): void {
  if (REAL_ESCROW_TYPES.has(railScope) && !FEE_COLLECTION_CAPABLE_RAILS.has(railScope)) {
    throw new EscrowError(
      `Fee policy activation is not supported for rail '${railScope}' — it has no real, atomic Protocol Fee collection implementation ` +
      `(Missão 11 Fase 5 rail-activation gating). Only ${[...FEE_COLLECTION_CAPABLE_RAILS].join(', ')} may activate a real fee policy today.`
    )
  }
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

export function getSettlementProvider(type: string): SettlementProvider {
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
