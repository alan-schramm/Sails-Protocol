/**
 * #235 R7H-NF-E3C-5 (contract D8) — conservative reconciliation of LEGACY `openp2p.trade.create` idempotency claims.
 *
 * Before B2 a trade and its idempotency claim were two separate commits, so a process that died between them left the
 * claim `IN_PROGRESS` forever (S6): the trade existed, the claim said "being processed", and the key could neither be
 * replayed nor retired. B2 never creates such a row again (the claim is committed WITH the trade). This module settles
 * the ones that already exist, and it is deliberately unable to turn uncertainty into an economic outcome:
 *
 *   - a claim is resolved ONLY when exactly one trade is independently attributable to it: same owner; a LEGACY trade
 *     (no tradeIntentId — every trade admitted since B2 was born with its own claim, or with none); created within
 *     `ATTRIBUTION_WINDOW_SECONDS` after the claim (the old persist() ran milliseconds after it, so a trade made long
 *     afterwards — e.g. a later keyless retry — is another logical attempt, never this one); the request hash
 *     recomputed from the trade's own persisted fields; and no OTHER claim already points at it;
 *   - more than one candidate → AMBIGUOUS, none → NO_ATTRIBUTABLE_TRADE: the claim is NOT touched. "No trade found" is
 *     not proof that nothing committed (the client may have hashed the amount differently than it is stored), and a
 *     timeout alone proves nothing, so an unresolved claim is never marked FAILED and a new trade is never created;
 *   - every decision — resolved or not — is appended to an immutable audit table with the evidence it was based on;
 *   - concurrent workers are safe (`FOR UPDATE SKIP LOCKED` + a conditional update): exactly one decides a claim;
 *   - no trade, event or Intent history is ever created, and there is no operator override: an unresolved claim stays
 *     unresolved (the caller sees 409 IDEMPOTENCY_OUTCOME_UNKNOWN and checks their own trades).
 */
import { randomUUID } from 'crypto'
import { prisma } from '../../common/database'
import { hashIdempotentPayload } from '../../common/idempotency'
import { TRADE_CREATE_SCOPE } from './trade-repository'

export type ReconcileDecision = 'MATCHED' | 'AMBIGUOUS' | 'NO_ATTRIBUTABLE_TRADE'

export interface ReconcileOutcome {
  claimId: string
  /** `SKIPPED`: the claim is not IN_PROGRESS any more, or another worker holds it — nothing was decided here. */
  decision: ReconcileDecision | 'SKIPPED'
  /** Set only for MATCHED. */
  tradeId?: string
  /** Trades the claim's owner is a party to that could be attributed to it (all of them, for AMBIGUOUS). */
  candidateTradeIds: string[]
}

/** The legacy persist() ran right after its claim was inserted; a trade further away than this is not its product. */
export const ATTRIBUTION_WINDOW_SECONDS = 30

type CandidateRow = { id: string; offerId: string; amount: string; accountHash: string | null }

/** The request payload renderings a client could have hashed for this trade: as stored and with trailing zeros trimmed. */
function amountRenderings(amount: string): string[] {
  const trimmed = amount.includes('.') ? amount.replace(/0+$/, '').replace(/\.$/, '') : amount
  return [...new Set([amount, trimmed])]
}

function matchesClaim(requestHash: string, t: CandidateRow): boolean {
  return amountRenderings(t.amount).some((amount) =>
    // SELL offer: the taker sends only { offerId, amount }. BUY offer: the taker also declares their own account hash.
    hashIdempotentPayload({ offerId: t.offerId, amount }) === requestHash
    || (t.accountHash !== null && hashIdempotentPayload({ offerId: t.offerId, amount, paymentAccountHash: t.accountHash }) === requestHash),
  )
}

/**
 * Decides ONE legacy claim. Safe to call concurrently and repeatedly: an already-settled claim, or one another worker is
 * deciding, yields SKIPPED; an undecidable claim yields the same decision (and one more audit row) each time.
 */
export async function reconcileLegacyTradeClaim(claimId: string, decidedBy: string): Promise<ReconcileOutcome> {
  return prisma.$transaction(async (tx) => {
    const [claim] = await tx.$queryRaw<Array<{ id: string; participantId: string; requestHash: string; createdAt: Date }>>`
      SELECT id, "participantId", "requestHash", "createdAt"
      FROM idempotency_keys
      WHERE id = ${claimId} AND scope = ${TRADE_CREATE_SCOPE} AND status = 'IN_PROGRESS'::"IdempotencyKeyStatus"
      FOR UPDATE SKIP LOCKED`
    if (!claim) return { claimId, decision: 'SKIPPED', candidateTradeIds: [] } as const

    const scanned = await tx.$queryRaw<CandidateRow[]>`
      SELECT t.id, t."offerId", t.amount::text AS amount, pa."accountHash" AS "accountHash"
      FROM trades t
      LEFT JOIN payment_accounts pa ON pa.id = t."sellerPaymentAccountId"
      WHERE (t."buyerId" = ${claim.participantId} OR t."sellerId" = ${claim.participantId})
        AND t."tradeIntentId" IS NULL
        AND t."createdAt" >= ${claim.createdAt}
        AND t."createdAt" <= ${claim.createdAt}::timestamp + make_interval(secs => ${ATTRIBUTION_WINDOW_SECONDS})
        AND NOT EXISTS (SELECT 1 FROM idempotency_keys o WHERE o."resultRef" = t.id AND o.id <> ${claim.id})`
    const matches = scanned.filter((t) => matchesClaim(claim.requestHash, t))

    const decision: ReconcileDecision = matches.length === 1 ? 'MATCHED' : matches.length > 1 ? 'AMBIGUOUS' : 'NO_ATTRIBUTABLE_TRADE'
    if (decision === 'MATCHED') {
      await tx.$executeRaw`
        UPDATE idempotency_keys
        SET status = 'COMPLETED'::"IdempotencyKeyStatus", "resultRef" = ${matches[0].id}, "completedAt" = now()
        WHERE id = ${claim.id} AND status = 'IN_PROGRESS'::"IdempotencyKeyStatus"`
    }
    await tx.$executeRaw`
      INSERT INTO idempotency_reconciliation_audit (id, "claimId", scope, "participantId", decision, "candidateTradeIds", evidence, "decidedBy")
      VALUES (${randomUUID()}, ${claim.id}, ${TRADE_CREATE_SCOPE}, ${claim.participantId}, ${decision},
              ${JSON.stringify(matches.map((m) => m.id))}::jsonb,
              ${JSON.stringify({ tradesScanned: scanned.length, claimCreatedAt: claim.createdAt, basis: 'owner + legacy trade + created within window after the claim + recomputed requestHash + not attributed to another claim', windowSeconds: ATTRIBUTION_WINDOW_SECONDS })}::jsonb,
              ${decidedBy})`
    return { claimId, decision, tradeId: decision === 'MATCHED' ? matches[0].id : undefined, candidateTradeIds: matches.map((m) => m.id) } as const
  })
}

/**
 * Bulk worker: decides every IN_PROGRESS legacy claim older than `olderThanMs`, oldest first. Not scheduled by the
 * server: invoking it is an operational choice, and it can only ever apply the rule above.
 */
export async function reconcileLegacyTradeClaims(opts: { olderThanMs: number; limit?: number; decidedBy: string }): Promise<ReconcileOutcome[]> {
  const cutoff = new Date(Date.now() - opts.olderThanMs)
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM idempotency_keys
    WHERE scope = ${TRADE_CREATE_SCOPE} AND status = 'IN_PROGRESS'::"IdempotencyKeyStatus" AND "createdAt" < ${cutoff}
    ORDER BY "createdAt" ASC
    LIMIT ${opts.limit ?? 100}`
  const outcomes: ReconcileOutcome[] = []
  for (const row of rows) outcomes.push(await reconcileLegacyTradeClaim(row.id, opts.decidedBy))
  return outcomes
}
