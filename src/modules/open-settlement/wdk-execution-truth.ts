/**
 * wdk-execution-truth.ts — Bounded Remediation (WDK Fund-Moving Safety,
 * 2026-09-08), closing the retry-safety gaps
 * docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md (#56) and
 * docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md (#58) demonstrated for
 * WDK_USDT_EVM's lockFunds()/releaseFunds()/refundFunds()/splitFunds().
 *
 * Properties this file exists to satisfy (full reasoning in the two docs
 * above, not re-derived here):
 *   A — Durable Operation Truth: identity for a logical economic
 *       operation is persisted BEFORE the external submission, not
 *       merely inferred from Escrow.status afterward.
 *   B — Unknown Outcome Safety: a call whose outcome is genuinely
 *       ambiguous (submitted, response lost) must not become blindly
 *       retryable — ensureAttempt() below refuses a second submission
 *       and requires reconciliation (a receipt check, if a hash exists)
 *       or manual intervention (if it doesn't).
 *   C — Submission != Confirmation: waitForReceiptOutcome() below never
 *       reports success on a bare returned hash — only on a real,
 *       queried receipt with status 1.
 *
 * Deliberately WDK-specific — this module is imported ONLY by
 * wdk-settlement.provider.ts. It is not a generic cross-rail primitive:
 * MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM's own release/refund/split
 * paths are client-signature-collection or read-only verification, not
 * self-initiated custodial transfers, so they have no equivalent need
 * (docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md §10).
 *
 * Escrow.status (the semantic escrow lifecycle) is deliberately left
 * untouched by this file — this is a separate, lower-level truth layer
 * underneath it (Fase 10's own architectural preference). A caller whose
 * attempt is blocked here sees a thrown EscrowError; escrow.service.ts's
 * own existing claim/revert logic is unmodified and still runs exactly
 * as before — the real safety property (no second on-chain transfer for
 * one logical operation) is enforced HERE, before WalletAccountEvm.transfer()
 * is ever called again, regardless of what Escrow.status says.
 */
import { config } from '../../config'
import { EscrowError } from '../../common/errors'
import type { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import type { WdkTransferOperationType } from '@prisma/client'
import { wdkTransferAttemptRepository } from './wdk-transfer-attempt-repository'

// The minimal WDK account surface this file needs — real, public API
// (WalletAccountReadOnlyEvm.getTransactionReceipt(), inherited by
// WalletAccountEvm; UPSTREAM DOCUMENTED, confirmed directly in the
// installed @tetherto/wdk-wallet-evm source). Typed narrowly so tests can
// supply a minimal fake without implementing the whole real class.
export type ReceiptCapableAccount = Pick<WalletAccountEvm, 'getTransactionReceipt'>

export type EnsureAttemptResult =
  | { action: 'RESUME_CONFIRMED'; txHash: string }
  | { action: 'PROCEED'; attemptId: string }

/**
 * Called BEFORE every real transfer() attempt. Persists durable identity
 * for a fresh logical operation, or determines from existing durable
 * state whether this exact call can safely resume (already confirmed),
 * must be blocked (ambiguous outcome, unresolved), or may proceed with a
 * newly-created attempt (a prior attempt reached a state proven safe to
 * retry from).
 */
export async function ensureAttempt(
  escrowId: string,
  operationType: WdkTransferOperationType,
  destination: string,
  amount: string,
  account: ReceiptCapableAccount
): Promise<EnsureAttemptResult> {
  const latest = await wdkTransferAttemptRepository.findLatest(escrowId, operationType)

  if (!latest) {
    const created = await wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount })
    return { action: 'PROCEED', attemptId: created.id }
  }

  // Integrity guard, not a strict idempotency key: a stale attempt row
  // for this exact (escrowId, operationType) whose destination/amount
  // genuinely differ from this call's own computed values indicates a
  // real anomaly (a bug upstream, or a genuinely different logical
  // operation reusing the same discriminator) — loud failure, not a
  // silent reuse of mismatched state. Amount compared numerically since
  // Decimal's own string formatting need not match the caller's exactly.
  if (latest.destination !== destination || Number(latest.amount.toString()) !== Number(amount)) {
    throw new EscrowError(
      `WdkTransferAttempt ${latest.id} for escrow ${escrowId}/${operationType} recorded destination=${latest.destination} amount=${latest.amount.toString()}, but this call computed destination=${destination} amount=${amount} — refusing to reconcile against a mismatched prior attempt.`
    )
  }

  switch (latest.status) {
    case 'CONFIRMED': {
      if (!latest.txHash) {
        throw new EscrowError(`WdkTransferAttempt ${latest.id} is CONFIRMED but has no persisted txHash — data integrity violation, refusing to resume`)
      }
      return { action: 'RESUME_CONFIRMED', txHash: latest.txHash }
    }

    case 'SUBMITTED': {
      if (!latest.txHash) {
        throw new EscrowError(`WdkTransferAttempt ${latest.id} is SUBMITTED but has no persisted txHash — data integrity violation`)
      }
      const receipt = await account.getTransactionReceipt(latest.txHash)
      if (!receipt) {
        throw new EscrowError(
          `WDK_USDT_EVM ${operationType} for escrow ${escrowId} was already submitted (tx ${latest.txHash}) and is still pending confirmation on-chain — refusing to submit a second transfer for the same logical operation. Retry later; this same check will re-query the transaction's receipt automatically.`
        )
      }
      if (receipt.status === 1) {
        await wdkTransferAttemptRepository.updateStatus(latest.id, 'CONFIRMED')
        return { action: 'RESUME_CONFIRMED', txHash: latest.txHash }
      }
      // status === 0 — reverted on-chain. The prior attempt definitively
      // did not deliver funds (a receipt with a real, queried status is
      // the strongest evidence this system has), so a fresh attempt for
      // the same logical operation is genuinely safe to start.
      await wdkTransferAttemptRepository.updateStatus(latest.id, 'REVERTED')
      const created = await wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount })
      return { action: 'PROCEED', attemptId: created.id }
    }

    case 'SUBMISSION_UNKNOWN':
      // No txHash was ever obtained for the prior attempt — there is
      // nothing to query, so no automatic reconciliation is possible
      // (docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md's own disclosed
      // residual: "Se reconciliation sem tx hash não puder ser
      // determinística com segurança: bloquear retry... Não inventar
      // certeza"). Correct STOP, not an artificial PASS.
      throw new EscrowError(
        `WDK_USDT_EVM ${operationType} for escrow ${escrowId} has an attempt (${latest.id}) whose outcome is UNKNOWN — the prior provider call failed before any transaction hash was obtained, so Sails cannot determine whether an external transfer already occurred. Refusing to submit a new transfer for the same logical operation. This requires manual/operator reconciliation (checking the deterministic escrow/treasury address's on-chain history directly) before any further attempt is safe.`
      )

    case 'PREPARED':
      // A prior attempt row exists but never reached SUBMITTED or
      // SUBMISSION_UNKNOWN — the process crashed strictly between
      // recording this row and ever calling transfer()
      // (docs/WDK_UNKNOWN_OUTCOME_RETRY_SAFETY.md's own analytical
      // "Window I" crash window, now durable instead of merely
      // hypothetical). transfer() is provably never invoked for THIS row
      // — SUBMITTED/SUBMISSION_UNKNOWN are always written synchronously,
      // immediately following the one and only transfer() call attempt,
      // in the same function invocation (wdk-settlement.provider.ts) — so
      // it is safe to reuse this exact row rather than creating a new
      // one (concurrent duplicate callers are already excluded before
      // this function is ever reached, by escrow.service.ts's own
      // pre-existing atomic claimEscrowTransition()).
      return { action: 'PROCEED', attemptId: latest.id }

    case 'FAILED_BEFORE_SUBMISSION': {
      const created = await wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount })
      return { action: 'PROCEED', attemptId: created.id }
    }

    case 'REVERTED': {
      // Reached directly (not via the SUBMITTED branch above) only when
      // a caller starts a fresh ensureAttempt() call after a PRIOR
      // ensureAttempt() call already reconciled and recorded REVERTED —
      // same reasoning as the SUBMITTED branch's own REVERTED handling:
      // a definitively reverted transfer proves no funds moved, so a
      // fresh attempt is safe.
      const created = await wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount })
      return { action: 'PROCEED', attemptId: created.id }
    }

    default: {
      const exhaustive: never = latest.status
      throw new EscrowError(`WdkTransferAttempt ${latest.id} has an unrecognized status: ${String(exhaustive)}`)
    }
  }
}

export type ReceiptOutcome = 'CONFIRMED' | 'REVERTED' | 'PENDING'

/**
 * Bounded poll for a transaction's receipt after a fresh broadcast — NOT
 * a background worker, NOT unbounded: a plain in-request loop, same
 * category as bounded-rpc.ts's own withBoundedRetry() for reads, applied
 * here to a write's post-submission confirmation instead. Returns
 * 'PENDING' (not an error) if the bound is reached with no receipt yet —
 * the caller is responsible for treating that as "submitted, not yet
 * confirmed," never as success.
 *
 * Confirmation DEPTH (waiting for N blocks after inclusion, to guard
 * against a shallow reorg) is explicitly NOT implemented here — 1
 * confirmation (a real, non-null receipt) is this mission's minimum
 * requirement; deeper confirmation is disclosed as future hardening
 * (docs/WDK_FUND_MOVING_OPERATIONS_SAFETY.md), not built now.
 */
export async function waitForReceiptOutcome(account: ReceiptCapableAccount, hash: string): Promise<ReceiptOutcome> {
  const attempts = config.wdk.receiptPollAttempts
  const intervalMs = config.wdk.receiptPollIntervalMs
  for (let attempt = 0; attempt < attempts; attempt++) {
    const receipt = await account.getTransactionReceipt(hash)
    if (receipt) {
      return receipt.status === 1 ? 'CONFIRMED' : 'REVERTED'
    }
    if (attempt < attempts - 1) {
      await delay(intervalMs)
    }
  }
  return 'PENDING'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
