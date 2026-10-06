/**
 * #235 R7G-B1 — UNILATERAL_INTENT_REVOCATION_V1.
 *
 * A participant may cancel a Trade unilaterally only while the protocol can
 * prove that no funds can exist for it on its rail. `Escrow.status === CREATED`
 * is not that proof: a MULTISIG deposit address can be funded without the
 * server observing it, and a WDK_USDT_EVM lock that failed after its transfer
 * was submitted reverts the escrow to CREATED (R7G-B F6). Past this point the
 * trade ends through refund, dispute, settlement or recovery — never through a
 * manual CANCELLED, which would manufacture economic finality.
 *
 * Read by TradeRepository.transitionManually() under the trade-lifecycle and
 * escrow locks, so the evidence cannot change while it is evaluated.
 */
import type { Prisma } from '@prisma/client'

/**
 * WdkTransferAttempt states that prove the attempt's transfer() was never
 * submitted or delivered nothing (wdk-execution-truth.ts): PREPARED is only
 * ever followed by transfer() after markSubmissionAttempted() has durably
 * written SUBMISSION_UNKNOWN; FAILED_BEFORE_SUBMISSION and REVERTED are the
 * states ensureAttempt() itself treats as safe to retry from. Every other state
 * (SUBMISSION_UNKNOWN, SUBMITTED, CONFIRMED, or any future value) means funds
 * may have moved.
 */
const WDK_NON_ECONOMIC_ATTEMPT_STATES: ReadonlySet<string> = new Set(['PREPARED', 'FAILED_BEFORE_SUBMISSION', 'REVERTED'])

/** Returns why the trade can no longer be revoked unilaterally, or null while it can. */
export async function unilateralRevocationBlocker(
  tx: Prisma.TransactionClient,
  escrow: { id: string; type: string; status: string; multisigAddr: string | null },
): Promise<string | null> {
  if (escrow.status !== 'CREATED') return `its escrow is ${escrow.status}`
  switch (escrow.type) {
    case 'MOCK':
      return null
    case 'MULTISIG':
    case 'LIGHTNING_HODL':
      // The deposit address is persisted once both participant keys exist; from
      // then on it can be funded without the server observing it.
      return escrow.multisigAddr ? 'its escrow has a funding address, which may already hold funds' : null
    case 'WDK_USDT_EVM': {
      const attempts = await tx.wdkTransferAttempt.findMany({ where: { escrowId: escrow.id }, select: { status: true } })
      const economic = attempts.find((a) => !WDK_NON_ECONOMIC_ATTEMPT_STATES.has(a.status))
      return economic ? `its escrow has a ${economic.status} transfer attempt, so funds may have moved` : null
    }
    default:
      // No proven funding-surface predicate for this rail: fail closed.
      return `its escrow type ${escrow.type} has no proof that it is unfunded`
  }
}
