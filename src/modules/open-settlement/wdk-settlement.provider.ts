/**
 * Sails OpenSettlement — WDK USDT (EVM) SettlementProvider
 *
 * The first real (non-Mock) `SettlementProvider` implementation
 * (`EscrowType.WDK_USDT_EVM`) — `LightningHodlProvider`/`LiquidCovenantProvider`
 * still throw "not yet implemented" (TODO.md §4); this one is real,
 * using `@tetherto/wdk-wallet-evm`, the actual Tether WDK package.
 *
 * Testnet only — never mainnet. This provider must never be pointed at
 * an RPC/contract holding real value; that boundary is enforced by
 * config (`WDK_RPC_URL` defaults to Sepolia, `.env.example`) and by
 * convention, not by code, since the provider has no way to distinguish
 * "testnet with worthless tokens" from "mainnet with real USDT" other
 * than the RPC URL and contract address it's given.
 *
 * Custody model — stated plainly, not glossed over (same discipline
 * `MOCK`'s own "escrow is theater" config comment already applies):
 * this is a **single-seed, two-hop escrow**, not a trustless multisig.
 * One WDK seed (`WDK_SEED_PHRASE`) controls both the treasury account
 * (index 0) and every per-trade escrow sub-account (a deterministic
 * child derived from the tradeId) — the same key that can lock funds
 * can also move them anywhere. Every lock/release/refund below is a
 * *real* on-chain transfer with a real, checkable transaction hash —
 * what's not yet real is a third, independent party who could stop a
 * bad-faith release. That's the same gap `MULTISIG`'s own "not
 * implemented" status already documents (TODO.md §4); this provider is
 * an honest step between `MOCK` (fakes everything) and a genuine
 * trustless multisig (nobody has built yet), not a claim to have closed
 * that gap.
 *
 * Bounded Remediation (WDK Fund-Moving Safety, 2026-09-08) — every method
 * below that self-initiates a real transfer (`lockFunds`/`releaseFunds`/
 * `refundFunds`/`splitFunds`) now runs through `wdk-execution-truth.ts`'s
 * `ensureAttempt()`/`waitForReceiptOutcome()`, closing the DEMONSTRATED
 * retry-safety and receipt-verification gaps
 * `docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md` (#56) and
 * `docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md` (#58) found. See that
 * module's own header comment for the full design. This does NOT change
 * `WDK_USDT_EVM`'s `PRODUCTION-INELIGIBLE` status (RFC-019) — it closes
 * one class of blocker, not all of them.
 */
import WalletManagerEvm, { type WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { createHash } from 'crypto'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import type { SettlementProvider } from './escrow.service'
import { ensureAttempt, waitForReceiptOutcome } from './wdk-execution-truth'
import { wdkTransferAttemptRepository } from './wdk-transfer-attempt-repository'

// USDT's real, historically-fixed decimal precision on every EVM chain
// it's deployed on — deliberately not read from the token contract at
// runtime (an extra RPC round-trip for a value that never changes for
// this specific asset). schema.prisma's Decimal(24,8) columns store more
// precision than USDT actually has on-chain; amounts are truncated to 6
// decimals here, not rounded up, so this provider never sends more than
// what was actually locked.
const USDT_DECIMALS = 6

// Exported for direct unit testing (tests/wdkSettlementProvider.test.ts) —
// pure, deterministic, no network/wallet dependency, so they're tested
// directly rather than only indirectly through a mocked wallet.
export function toBaseUnits(decimalAmount: string, decimals: number): bigint {
  const [whole, fraction = ''] = decimalAmount.split('.')
  const truncatedFraction = fraction.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(truncatedFraction || '0')
}

// The exact inverse of toBaseUnits() above — used only to give
// WdkTransferAttempt's own `amount` column a human-readable decimal
// record for a split leg's own computed base-unit amount (buyerAmount/
// sellerAmount below never round-trip through this for the actual
// transfer() call itself, which always uses the exact bigint).
export function fromBaseUnits(baseUnits: bigint, decimals: number): string {
  const negative = baseUnits < 0n
  const abs = negative ? -baseUnits : baseUnits
  const divisor = 10n ** BigInt(decimals)
  const whole = abs / divisor
  const fractionDigits = (abs % divisor).toString().padStart(decimals, '0')
  return `${negative ? '-' : ''}${whole}.${fractionDigits}`
}

// Deterministic per-trade escrow account index — a BIP-44 non-hardened
// index must fit in 31 bits (0..2^31-1). sha256(tradeId) gives a stable,
// evenly-distributed source; same tradeId always re-derives the same
// escrow account, which is what lets releaseFunds()/refundFunds() find
// the account lockFunds() funded without persisting the derivation path
// anywhere.
export function escrowIndexFor(tradeId: string): number {
  const hash = createHash('sha256').update(tradeId).digest()
  return hash.readUInt32BE(0) % 0x7fffffff
}

// Same derivation shape as escrowIndexFor, distinct salt (`buyer:` prefix)
// so a buyer's receiving-address index and a trade's escrow-account index
// never collide even for coincidentally-equal input strings. Stands in for
// real per-user EVM address onboarding, which doesn't exist yet in this
// reference implementation (this provider's own header comment) — a
// deterministic per-buyer top-level account at least means different
// buyers get different, stable addresses, not the same hardcoded demo
// address every time settlement-orchestrator.ts's auto-settle handler
// (common/events/handlers.ts) releases funds.
export function buyerIndexFor(buyerId: string): number {
  const hash = createHash('sha256').update(`buyer:${buyerId}`).digest()
  return hash.readUInt32BE(0) % 0x7fffffff
}

export class WdkSettlementProvider implements SettlementProvider {
  name = 'WDK_USDT_EVM'

  // RFC-019 Phase 1 (rfcs/RFC-019-settlement-custody-reference-vs-normative.md)
  // — makes this class's own header comment above (the "single-seed,
  // two-hop escrow" disclosure) introspectable in code, not just
  // readable by whoever opens this file. Any code path holding a
  // `SettlementProvider` can now check this field to tell a genuinely
  // non-custodial implementation apart from this reference one — no
  // such implementation exists yet (`MOCK` is a demonstration, this is
  // the only real one), so this field always reads the same value
  // today, but the field itself is the deliverable: it's what a future
  // wallet-authorized provider (RFC-019's Phase 2, unscoped, not built)
  // would set differently.
  readonly custodyModel = 'server-custodial-reference-implementation' as const

  private wallet: WalletManagerEvm | null = null

  private getWallet(): WalletManagerEvm {
    if (this.wallet) return this.wallet
    if (!config.wdk.seedPhrase) {
      throw new EscrowError('WDK_USDT_EVM provider requires WDK_SEED_PHRASE configured (.env.example) — refusing to construct a wallet from an empty seed')
    }
    if (!config.wdk.usdtContract) {
      throw new EscrowError('WDK_USDT_EVM provider requires WDK_USDT_CONTRACT configured (.env.example) — no token address to transfer')
    }
    this.wallet = new WalletManagerEvm(config.wdk.seedPhrase, { provider: config.wdk.rpcUrl })
    return this.wallet
  }

  private async treasuryAccount(): Promise<WalletAccountEvm> {
    return this.getWallet().getAccount(0)
  }

  private async escrowAccount(tradeId: string): Promise<WalletAccountEvm> {
    const index = escrowIndexFor(tradeId)
    return this.getWallet().getAccountByPath(`0'/0/${index}`)
  }

  // Demo/inspection helper, not part of the SettlementProvider interface
  // — src/demo/pix-to-usdt-flow.ts uses this to get a real address to
  // release funds to, standing in for a buyer's own independently
  // controlled wallet (this reference implementation doesn't onboard
  // per-user EVM keys yet — see that script's own doc comment).
  async getAccountAddress(index: number): Promise<string> {
    const account = await this.getWallet().getAccount(index)
    return account.getAddress()
  }

  async lockFunds(escrow: { id: string; tradeId: string; lockedAmount: string }): Promise<{ txId: string; address: string }> {
    const treasury = await this.treasuryAccount()
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const escrowAddress = await escrowAcct.getAddress()
    const amount = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)

    const txId = await this.executeTransfer(escrow.id, 'LOCK', treasury, escrowAddress, escrow.lockedAmount, amount)
    return { txId, address: escrowAddress }
  }

  // Bounded Remediation (WDK Fund-Moving Safety, 2026-09-08) — the one
  // shared, provider-local execution path every self-initiated transfer
  // below (lock/release/refund, and each of splitFunds()'s two legs)
  // goes through: ensureAttempt() (durable identity before the side
  // effect, Property A; blocks an unsafe blind retry, Property B) ->
  // the real transfer() call -> waitForReceiptOutcome() (never declares
  // success on a bare hash, Property C). Kept as one method rather than
  // duplicated per caller — the exact same sequence, same error
  // semantics, same durable bookkeeping, for every WDK_USDT_EVM
  // operation type. See wdk-execution-truth.ts's own header comment for
  // the full design and docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md §13 for
  // why this is the minimum mechanism chosen (a single shared helper
  // inside this ONE provider file, not a generic cross-provider
  // abstraction).
  private async executeTransfer(
    escrowId: string,
    operationType: 'LOCK' | 'RELEASE' | 'REFUND' | 'SPLIT_BUYER' | 'SPLIT_SELLER',
    sourceAccount: WalletAccountEvm,
    destination: string,
    decimalAmount: string,
    baseUnitsAmount: bigint
  ): Promise<string> {
    const outcome = await ensureAttempt(escrowId, operationType, destination, decimalAmount, sourceAccount)
    if (outcome.action === 'RESUME_CONFIRMED') {
      return outcome.txHash
    }

    const attemptId = outcome.attemptId
    let hash: string
    try {
      const result = await sourceAccount.transfer({ token: config.wdk.usdtContract, recipient: destination, amount: baseUnitsAmount })
      hash = result.hash
    } catch (err) {
      // No hash was ever obtained — this call cannot distinguish "never
      // reached the network" from "reached it and the response was
      // lost" (docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md's own central
      // finding about this exact WDK API). Conservative-by-design:
      // SUBMISSION_UNKNOWN, not a revert-to-retryable.
      await wdkTransferAttemptRepository.updateStatus(attemptId, 'SUBMISSION_UNKNOWN')
      throw err
    }

    await wdkTransferAttemptRepository.updateStatus(attemptId, 'SUBMITTED', { txHash: hash })

    const receiptOutcome = await waitForReceiptOutcome(sourceAccount, hash)
    if (receiptOutcome === 'CONFIRMED') {
      await wdkTransferAttemptRepository.updateStatus(attemptId, 'CONFIRMED')
      return hash
    }
    if (receiptOutcome === 'REVERTED') {
      await wdkTransferAttemptRepository.updateStatus(attemptId, 'REVERTED')
      throw new EscrowError(`WDK_USDT_EVM ${operationType} transfer ${hash} for escrow ${escrowId} reverted on-chain — no funds were delivered.`)
    }
    // PENDING — the bounded wait elapsed with no receipt yet. Stays
    // SUBMITTED; a subsequent call (retry) will re-check this exact
    // hash's receipt via ensureAttempt() before ever broadcasting again.
    throw new EscrowError(`WDK_USDT_EVM ${operationType} transfer ${hash} for escrow ${escrowId} was submitted but is not yet confirmed on-chain within the bounded wait — this is not a failure; retry will reconcile automatically once the transaction is mined.`)
  }

  // Missão 11 Fase 4 — rail-parity audit: NOT extended with fee-aware
  // construction, deliberately. This provider funds its own escrow from
  // Sails' own treasury account (this file's own header comment) — there
  // is no external, seller-controlled deposit for a "seller-funded
  // reserve" to attach to, so this rail is explicitly non-authoritative
  // as evidence for (or against) the non-custodial funding model designed
  // for MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM. Its existing recordObligationForEscrowSettlement()
  // call (via escrow.service.ts's direct-call path) still runs, using the
  // generic, non-Bitcoin-specific fixture-only small-trade rule — never
  // this rail's own (nonexistent) dust/collection-address logic.
  async releaseFunds(escrow: { id: string; tradeId: string; lockedAmount: string }, toAddress: string): Promise<{ txId: string }> {
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const amount = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)

    const txId = await this.executeTransfer(escrow.id, 'RELEASE', escrowAcct, toAddress, escrow.lockedAmount, amount)
    return { txId }
  }

  async refundFunds(escrow: { id: string; tradeId: string; lockedAmount: string }): Promise<{ txId: string }> {
    const treasury = await this.treasuryAccount()
    const treasuryAddress = await treasury.getAddress()
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const amount = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)

    const txId = await this.executeTransfer(escrow.id, 'REFUND', escrowAcct, treasuryAddress, escrow.lockedAmount, amount)
    return { txId }
  }

  // RFC-021 D9 (2026-08-02) — real, two separate on-chain transfers (no
  // atomic multi-recipient primitive on this provider's transfer() API,
  // same constraint releaseFunds()/refundFunds() above already live
  // with). buyerBps is out of 10000; the seller gets the exact remainder
  // (computed from what's left over, not a second independent
  // percentage) so the two legs always sum to the full lockedAmount with
  // no truncation dust unaccounted for.
  // Bounded Remediation (WDK Fund-Moving Safety, 2026-09-08) — Property D
  // (Safe Multi-Leg Resume), closing docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md
  // §5's DEMONSTRATED partial-execution gap. The two legs are tracked as
  // two entirely independent logical operations (SPLIT_BUYER,
  // SPLIT_SELLER — separate WdkTransferAttempt rows), each going through
  // the exact same executeTransfer() every other method above uses. The
  // seller leg is never attempted until the buyer leg has a real,
  // receipt-confirmed txHash — resuming (skipping the transfer() call
  // entirely) whenever a prior attempt already reached CONFIRMED, exactly
  // satisfying the mission's own four named cases: buyer CONFIRMED +
  // seller not started -> resumes at seller only; buyer CONFIRMED +
  // seller UNKNOWN -> executeTransfer()'s own ensureAttempt() call for
  // the seller leg blocks until reconciled; buyer UNKNOWN -> blocked
  // before ever reaching the seller leg (buyer never repeated); buyer
  // CONFIRMED + a prior seller REVERTED -> the seller leg's own
  // ensureAttempt() call safely starts a fresh seller attempt (a
  // definitively reverted transfer proves no funds moved), the buyer leg
  // is never touched again.
  async splitFunds(escrow: { id: string; tradeId: string; lockedAmount: string }, buyerAddress: string, sellerAddress: string, buyerBps: number): Promise<{ txIds: string[] }> {
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const total = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)
    const buyerAmount = (total * BigInt(buyerBps)) / 10000n
    const sellerAmount = total - buyerAmount

    const buyerTxId = await this.executeTransfer(escrow.id, 'SPLIT_BUYER', escrowAcct, buyerAddress, fromBaseUnits(buyerAmount, USDT_DECIMALS), buyerAmount)
    // The seller leg is only ever attempted once the buyer leg above has
    // returned — executeTransfer() either resumed a real, confirmed prior
    // txHash or genuinely reached CONFIRMED just now; either way, by this
    // line, the buyer leg is durably CONFIRMED. If it wasn't, the line
    // above already threw and this code is never reached — the seller
    // leg's transfer() is never even attempted, let alone the buyer leg
    // repeated.
    const sellerTxId = await this.executeTransfer(escrow.id, 'SPLIT_SELLER', escrowAcct, sellerAddress, fromBaseUnits(sellerAmount, USDT_DECIMALS), sellerAmount)

    return { txIds: [buyerTxId, sellerTxId] }
  }

}

export const wdkSettlementProvider = new WdkSettlementProvider()
