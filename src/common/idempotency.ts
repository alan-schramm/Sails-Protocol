/**
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1 (item 37, 2026-09-13) — closes
 * `docs/BACKLOG.md` item 37 ("Trade/Offer/Evidence Creation
 * Idempotency"), registered by `docs/CROSS_LAYER_SEMANTIC_CONTRACT_AUDIT.md`'s
 * CSC-B01/CSC-B02: `createTrade()`, `createOffer()`, and
 * `submitEvidence()` had no idempotency mechanism at all — a network
 * retry of the identical logical request could create a second `Trade`/
 * `Offer` row or double-append dispute evidence.
 *
 * Deliberately a client-supplied idempotency key, not an accidental
 * DB-uniqueness constraint on business fields (e.g. `(offerId,
 * counterpartyId)` for trade creation) — the audit's own investigation
 * found that composite-business-key uniqueness would incorrectly reject
 * a genuinely new, separate trade the same buyer legitimately intends
 * against the same still-`ACTIVE` offer later (`Offer.status` never
 * transitions away from `ACTIVE` just because one trade was created
 * against it). Only a caller-supplied key can express "this specific
 * attempt," independent of what the request happens to contain.
 *
 * Deliberately opt-in (a caller who never supplies a key gets today's
 * exact, unchanged behavior) — this preserves full backward
 * compatibility for existing callers. **Honestly bounded, not
 * universal**: the idempotency guarantee below applies ONLY when a
 * caller actually supplies a key — a caller that omits one gets no
 * protection at all, same as before this mission ever existed. See
 * `withIdempotency()`'s own doc comment for the recommended strategy
 * question this raises, explicitly left as a registered, undecided
 * Product question, not resolved here.
 *
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R1 (2026-09-13) — closes two real
 * correctness defects a CTO review found in the original version:
 *
 * **Defect A — a successful `create()` could be relabeled FAILED.** The
 * original `runAndSettle()` ran `create()` and `store.markCompleted()`
 * inside the SAME try block, so a `create()` success followed by a
 * `markCompleted()` failure (a real, plausible transient DB error) hit
 * the SAME catch clause as a genuine `create()` failure — marking the
 * claim `FAILED` even though a durable side effect already existed, and
 * letting a future retry call `create()` again. This violated this
 * codebase's own governing principle (`docs/ENGINEERING_GOVERNANCE.md`
 * §16.17): **a failed call is not proof of no side effect.** Fixed by
 * splitting `create()`'s own failure domain from the bookkeeping
 * write's — see `runAndSettle()` and the new `UNKNOWN` status below.
 *
 * **Defect B — `FAILED → retry` was a plain read-then-write, not an
 * atomic claim.** The original code let ANY caller who observed
 * `status === 'FAILED'` proceed straight to `runAndSettle()` with no
 * compare-and-swap — two concurrent retries could both observe `FAILED`
 * and both execute `create()`. Fixed with `reclaimFailed()`, a real,
 * conditional `UPDATE ... WHERE status = 'FAILED'` (the exact same
 * "conditional `updateMany` + row-count check" idiom
 * `escrow-lifecycle.ts`'s `claimEscrowTransition()` already uses for
 * `Escrow.status`) — correct across concurrent requests on the SAME
 * application instance and across multiple application instances alike,
 * since the atomicity is Postgres's own, not an in-process lock.
 *
 * The store interface below is injected specifically so the real
 * concurrency-arbitration LOGIC (races, replays, reused keys, the two
 * defects above) can be proven directly, against a real, behaviorally-
 * faithful in-memory implementation that genuinely enforces the same
 * atomicity Postgres provides, without needing a live Postgres
 * connection in this environment (`tests/idempotency.test.ts`) — per
 * this mission's own "do not mock the property being proved" rule. The
 * production store (`PrismaIdempotencyKeyStore` below) is a thin,
 * directly-inspectable wrapper over real, atomic Prisma operations —
 * not a second, competing idempotency mechanism.
 */
import { createHash } from 'node:crypto'
import { prisma } from './database'
import { childLogger } from './logger'
import { ValidationError, IdempotencyKeyConflictError } from './errors'

const log = childLogger('idempotency')

// CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R1 — `UNKNOWN` is the fourth state
// closing Defect A. See this file's header and `prisma/schema.prisma`'s
// own `IdempotencyKeyStatus` comment for the full state-machine
// semantics; both must stay in sync if this ever changes again.
export type IdempotencyKeyStatus = 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN' | 'FAILED'

export interface IdempotencyRecord {
  id: string
  requestHash: string
  status: IdempotencyKeyStatus
  resultRef: string | null
}

/**
 * The minimal, real operations `withIdempotency()` needs — never a
 * generic repository, only the exact moves this mechanism performs:
 * claim (atomic, fails if already claimed), read (to resolve a claim
 * conflict), settle (mark the outcome once known), and reclaim (the
 * atomic `FAILED -> IN_PROGRESS` compare-and-swap Defect B requires).
 */
export interface IdempotencyKeyStore {
  /** Atomically claims (scope, participantId, key). Throws a P2002-shaped
   *  error (`{ code: 'P2002' }`) if it's already claimed — never returns
   *  a "did I win" boolean, so a caller can't accidentally race on the
   *  read-then-write it's supposed to prevent. */
  claim(scope: string, participantId: string, key: string, requestHash: string): Promise<{ id: string }>
  find(scope: string, participantId: string, key: string): Promise<IdempotencyRecord | null>
  markCompleted(id: string, resultRef: string): Promise<void>
  /** Best-effort — the create() side effect already durably exists by
   *  the time this is called; a failure here must never become a
   *  FAILED/retryable state. See `runAndSettle()`. */
  markUnknown(id: string, resultRef: string): Promise<void>
  markFailed(id: string): Promise<void>
  /** Atomic compare-and-swap: `FAILED -> IN_PROGRESS`. Returns `true`
   *  only for the caller that actually won the transition (a real
   *  conditional UPDATE's row count, never a plain read-then-write) —
   *  correct across concurrent requests on one instance AND across
   *  multiple application instances, since the atomicity is the
   *  database's own. */
  reclaimFailed(id: string): Promise<boolean>
}

export class PrismaIdempotencyKeyStore implements IdempotencyKeyStore {
  async claim(scope: string, participantId: string, key: string, requestHash: string) {
    return prisma.idempotencyKey.create({
      data: { scope, participantId, key, requestHash, status: 'IN_PROGRESS' },
      select: { id: true },
    })
  }

  async find(scope: string, participantId: string, key: string): Promise<IdempotencyRecord | null> {
    const row = await prisma.idempotencyKey.findUnique({
      where: { scope_participantId_key: { scope, participantId, key } },
    })
    if (!row) return null
    return { id: row.id, requestHash: row.requestHash, status: row.status, resultRef: row.resultRef }
  }

  async markCompleted(id: string, resultRef: string): Promise<void> {
    await prisma.idempotencyKey.update({ where: { id }, data: { status: 'COMPLETED', resultRef, completedAt: new Date() } })
  }

  async markUnknown(id: string, resultRef: string): Promise<void> {
    await prisma.idempotencyKey.update({ where: { id }, data: { status: 'UNKNOWN', resultRef } })
  }

  async markFailed(id: string): Promise<void> {
    await prisma.idempotencyKey.update({ where: { id }, data: { status: 'FAILED' } })
  }

  async reclaimFailed(id: string): Promise<boolean> {
    // Same "conditional updateMany, check the row count" idiom as
    // escrow-lifecycle.ts's claimEscrowTransition() — the WHERE clause
    // is the entire correctness mechanism: Postgres only ever lets one
    // concurrent UPDATE actually match and modify this row while its
    // status is still 'FAILED', regardless of how many application
    // instances issue the same statement at the same instant.
    const result = await prisma.idempotencyKey.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'IN_PROGRESS' },
    })
    return result.count === 1
  }
}

const defaultStore = new PrismaIdempotencyKeyStore()

/** Real, non-cryptographic-purpose hash — only used to detect "this key
 *  was reused for a materially different request," never as a security
 *  boundary. Stable key ordering via JSON.stringify's own deterministic
 *  behavior for the plain, flat objects every call site here passes. */
export function hashIdempotentPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export interface WithIdempotencyParams {
  scope: string
  participantId: string
  /** `undefined` — no idempotency requested; proceeds exactly as before.
   *  **This is an honestly bounded opt-in, not a universal guarantee**:
   *  a caller that omits this gets zero protection, identical to the
   *  endpoint's behavior before this mechanism existed. */
  key: string | undefined
  requestPayload: unknown
  store?: IdempotencyKeyStore
}

/**
 * Runs `create()` at most once per (scope, participantId, key). A
 * concurrent or retried call with the SAME key and the SAME
 * `requestPayload` either waits out the race (`IdempotencyKeyConflictError`,
 * 409 — the caller's own job to decide whether to poll/retry) or, once
 * the original attempt has finished, gets the ORIGINAL result back via
 * `recover()` — never a second execution of `create()`. The SAME key
 * with a DIFFERENT `requestPayload` is treated as a genuine client bug
 * (reusing an idempotency key for a new logical action), rejected with
 * `ValidationError` rather than silently replayed or silently allowed.
 *
 * `create()`'s own thrown errors propagate unchanged (this never turns
 * a real failure into a false idempotent success) — the claim row is
 * marked `FAILED` only when `create()` itself never produced a durable
 * result (see `runAndSettle()` for the `UNKNOWN` case this is no longer
 * conflated with), so a genuine retry with the same key after a real
 * failure is allowed to try again, not permanently blocked — but ONLY
 * via `reclaimFailed()`'s atomic compare-and-swap, never a bare
 * "I saw FAILED, so I'll just run it."
 *
 * **Opt-in boundary, stated plainly for whoever next has to decide this
 * Product question (not decided here):** today, an idempotency key is
 * optional at every layer (route schema, SDK method, UI call site).
 * This keeps the change fully backward-compatible, but means a caller
 * who doesn't know to pass one — a raw API integrator who never reads
 * this file, or a future SDK version that forgets to — gets no
 * protection at all, silently. Candidate bounded strategies, in
 * increasing order of how much they change today's contract: (1) keep
 * opt-in for compatibility, document the boundary loudly (this comment,
 * `docs/API_STABLE.md`, `docs/API_REFERENCE.md`) — the status quo as of
 * this correction; (2) have the SDK generate a key by default when the
 * caller doesn't supply one (protects every SDK-mediated caller
 * automatically, still leaves raw API integrators unprotected unless
 * they opt in themselves); (3) make the key mandatory in a future,
 * explicitly-versioned breaking contract once real usage data justifies
 * it. This function does not choose between them — that is a Product/
 * API-contract decision, not an implementation detail to decide
 * silently inside a bounded corrective mission.
 */
export async function withIdempotency<T extends { id: string }>(
  params: WithIdempotencyParams,
  create: () => Promise<T>,
  recover: (resultId: string) => Promise<T>
): Promise<T> {
  const { scope, participantId, key, requestPayload } = params
  const store = params.store ?? defaultStore

  if (!key) return create()

  const requestHash = hashIdempotentPayload(requestPayload)

  let claim: { id: string }
  try {
    claim = await store.claim(scope, participantId, key, requestHash)
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err

    const existing = await store.find(scope, participantId, key)
    if (!existing) throw err // Row deleted between the failed claim and this lookup — genuinely unexpected; surface the original error rather than guess.

    if (existing.requestHash !== requestHash) {
      throw new ValidationError(
        `Idempotency key '${key}' was already used for a different request. ` +
        'Reusing an idempotency key for a new logical action is not allowed — use a new key for a new request.'
      )
    }

    if (existing.status === 'IN_PROGRESS') {
      throw new IdempotencyKeyConflictError(
        `A request with idempotency key '${key}' is already being processed — wait for it to finish before retrying.`
      )
    }

    if (existing.status === 'COMPLETED' || existing.status === 'UNKNOWN') {
      // CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R1 (Defect A) — UNKNOWN is
      // deliberately handled identically to COMPLETED here: create()
      // already succeeded and resultRef is already known (see
      // runAndSettle() — resultRef is only ever set alongside one of
      // these two statuses, never FAILED/IN_PROGRESS). The only thing
      // "unknown" was whether this bookkeeping row itself finished
      // writing cleanly, never whether the business action happened —
      // so recovering the real result is correct, not a guess.
      return recover(existing.resultRef!)
    }

    // existing.status === 'FAILED' — CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R1
    // (Defect B): reclaim atomically. A plain "I observed FAILED, so
    // I'll run it" here is exactly the bug this mission's own CTO review
    // found — two concurrent retries could both observe FAILED and both
    // execute create(). reclaimFailed() is a real, database-level
    // compare-and-swap; only the caller whose UPDATE actually matched a
    // still-FAILED row gets to proceed.
    const reclaimed = await store.reclaimFailed(existing.id)
    if (!reclaimed) {
      // Someone else won the reclaim in the time between our find() and
      // our reclaimFailed() call — a real, if narrow, race window. Never
      // assume what they'll produce; re-check and react to whatever is
      // actually true now, same discipline as every other branch here.
      const afterReclaim = await store.find(scope, participantId, key)
      if (afterReclaim && (afterReclaim.status === 'COMPLETED' || afterReclaim.status === 'UNKNOWN')) {
        return recover(afterReclaim.resultRef!)
      }
      // Still IN_PROGRESS (the winner hasn't finished yet) or FAILED
      // again (the winner's own attempt already failed a second time) —
      // either way, THIS caller does not get to execute create() right
      // now. Bounded, not an internal retry loop: the caller's own next
      // retry (the same real-world "user clicks the button again"
      // surface every other conflict case here relies on) will resolve
      // it, exactly like the IN_PROGRESS conflict case above.
      throw new IdempotencyKeyConflictError(
        `A request with idempotency key '${key}' is already being retried by another request — wait and try again.`
      )
    }

    return runAndSettle(create, store, existing.id)
  }

  return runAndSettle(create, store, claim.id)
}

async function runAndSettle<T extends { id: string }>(
  create: () => Promise<T>,
  store: IdempotencyKeyStore,
  claimId: string
): Promise<T> {
  let result: T
  try {
    result = await create()
  } catch (err) {
    // create() itself never produced a durable object — this is the
    // ONLY branch allowed to mark the claim FAILED. Nothing past this
    // point may ever do so again for this attempt.
    await store.markFailed(claimId)
    throw err
  }

  // CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R1 (Defect A) — create() already
  // succeeded; a durable side effect genuinely exists (`result.id`).
  // From here on, this function must return `result` to the caller no
  // matter what happens next — the caller's own request DID succeed,
  // full stop. What remains uncertain is only whether the bookkeeping
  // write below itself lands cleanly.
  try {
    await store.markCompleted(claimId, result.id)
  } catch (finalizeErr) {
    // The business action succeeded; only recording that fact failed.
    // Never call markFailed() here — that would be the exact defect
    // this mission exists to close. Best-effort fallback: a smaller,
    // separately-named write that only needs to persist the one fact a
    // future caller actually needs (resultRef) to recover safely.
    try {
      await store.markUnknown(claimId, result.id)
    } catch (unknownErr) {
      // Both writes failed — genuinely exceptional (e.g. the database
      // itself is unreachable). The claim row is left exactly as it
      // was (still IN_PROGRESS, since neither UPDATE committed), which
      // is still SAFE, not silently wrong: a future caller with the
      // same key sees IN_PROGRESS and gets IdempotencyKeyConflictError
      // (blocks a duplicate) rather than a false COMPLETED or a false
      // FAILED. This does mean the claim can get durably stuck pending
      // manual/scheduled reconciliation — a real, disclosed residual
      // (see this file's own header), not a silent one. Logged loudly
      // since this is genuinely exceptional and operator-actionable;
      // never rethrown, since the caller's own result is real and
      // already in hand.
      log.error({
        msg: 'Idempotency bookkeeping could not be finalized after a successful create() — the business action succeeded, but this claim row may be stuck IN_PROGRESS pending manual reconciliation',
        claimId,
        resultId: result.id,
        markCompletedError: finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr),
        markUnknownError: unknownErr instanceof Error ? unknownErr.message : String(unknownErr),
      })
    }
  }

  return result
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}
