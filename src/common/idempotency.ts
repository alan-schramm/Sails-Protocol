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
 *
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R2 (2026-09-13) — closes a third
 * real defect R1 did not: R1 correctly separated "create() itself
 * failed" from "create() succeeded but bookkeeping failed," but still
 * assumed **create() throwing at all** meant no durable object exists.
 * That assumption was false for every one of the three protected
 * operations — `createTradeUncached()` persists the `Trade` row, then
 * STILL performs `eventBus.emit()`, up to 3 `intentEngine.transition()`
 * calls, and `negotiationService.open()`, any of which can throw AFTER
 * the Trade already exists; `createOfferUncached()` persists the
 * `Intent` and `Offer` rows before its own `eventBus.emit()`;
 * `submitEvidenceUncached()` durably appends evidence via
 * `prisma.dispute.update()` before its own `eventBus.emit()`. A failure
 * in any of those later steps used to hit `runAndSettle()`'s single
 * `create()` catch block and mark the claim `FAILED` — even though a
 * durable business object already existed — letting a retry create a
 * SECOND `Trade`/`Offer` or double-append evidence. Violated the same
 * governing principle Defect A violated, one level deeper: **a failed
 * call is not proof of no side effect**, and retryability must be
 * derived from durable truth, not from whether the outer function
 * threw.
 *
 * **Fix:** `withIdempotency()` now takes two callbacks instead of one —
 * `persist()` (the ONLY code allowed to perform the durable business
 * write; its own failure is the ONLY legitimate `FAILED`, since nothing
 * durable exists yet) and `postPersist()` (everything that must happen
 * AFTER the durable write — events, intent transitions, negotiation
 * setup — whose failures are real and still propagate to the ORIGINAL
 * caller, but can never regress the idempotency record). `runAndSettle()`
 * now settles the record to `COMPLETED`/`UNKNOWN` (Defect A's own
 * machinery, unchanged) IMMEDIATELY after `persist()` succeeds — BEFORE
 * `postPersist()` ever runs — so the record reflects durable truth no
 * matter what `postPersist()` does next. A retry with the same key,
 * once `persist()` has ever succeeded, always recovers the real object
 * via `recover()`; it never re-runs `persist()` again. This deliberately
 * does NOT retry `postPersist()` on a recovered replay — resuming a
 * partially-failed orchestration (a stuck negotiation channel, an
 * unfired event) is a real, separate, larger question this bounded
 * correction does not solve; see each call site's own comment for the
 * disclosed residual this leaves.
 *
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3 (2026-09-13) — closes a fourth
 * real defect: R2 treated `persist()` as a single, indivisible unit —
 * correct for `createTrade()`/`submitEvidence()` (each has exactly ONE
 * durable write in `persist()`), but NOT for `createOffer()`, whose
 * `persistOffer()` performs TWO independently-durable writes:
 * `intentEngine.create()` (an Intent, durable as soon as it returns),
 * then `prisma.offer.create()` (the Offer). If the SECOND write fails,
 * `persist()` as a whole throws, and `runAndSettle()` marks the claim
 * `FAILED` — even though the FIRST write already durably succeeded. A
 * retry then reclaims `FAILED` and calls `persist()` again, which
 * unconditionally re-runs `intentEngine.create()`, producing a SECOND
 * Intent for the same logical `createOffer` attempt. Same governing
 * principle, one level deeper still: **a failed `persist()` call is not
 * proof that NONE of persist()'s own internal writes durably happened.**
 *
 * **Fix — `PersistCheckpoint`, the smallest mechanism that proves the
 * property without an intentEngine refactor:** `persist()` now receives
 * a `checkpoint` argument. Before attempting a durable write it cannot
 * safely repeat, `persist()` may call `checkpoint.set(ref)` to record
 * that write's own result id on the idempotency row itself — durably,
 * independently of `status` — via the new `checkpointRef` column
 * (`prisma/schema.prisma`). If `persist()` is later retried (via
 * `reclaimFailed()`, same as any other `FAILED` retry), it receives
 * `checkpoint.ref` set to whatever the PRIOR attempt recorded, and can
 * skip straight past the already-durable step instead of blindly
 * re-running it. `checkpoint.ref` is `null` on a genuinely first
 * attempt, and always `null` when no idempotency key was supplied at
 * all (checkpointing requires a row to attach to). This is deliberately
 * generic — `idempotency.ts` itself has no idea what a "checkpoint" IS
 * (an Intent id, or anything else some future multi-write `persist()`
 * needs) — the interpretation lives entirely in the call site
 * (`liquidity.service.ts`'s `persistOffer()`).
 *
 * This does NOT make `intentEngine.create()` itself transactional or
 * resumable internally (its own multi-step CREATED→VALIDATED→COORDINATED
 * pipeline can itself partially fail after its first durable write —
 * a real, narrower, pre-existing gap, unchanged and out of this
 * mission's scope, same as R2 already disclosed). It only guarantees
 * that `persistOffer()`'s OWN two top-level writes cannot each run more
 * than once for the same idempotency key — the Intent `persistOffer()`
 * itself creates is never duplicated by a retry of `createOffer()`.
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
  // CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3 — see this file's own header
  // and `prisma/schema.prisma`'s `checkpointRef` doc comment.
  checkpointRef: string | null
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
  /** CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3 — records an intermediate
   *  durable identity a multi-write persist() has already produced,
   *  independent of `status`. Never overwrites `resultRef`/`status` —
   *  a distinct field for a distinct purpose (see this file's own
   *  header and `IdempotencyRecord.checkpointRef`). */
  setCheckpoint(id: string, checkpointRef: string): Promise<void>
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
    return { id: row.id, requestHash: row.requestHash, status: row.status, resultRef: row.resultRef, checkpointRef: row.checkpointRef }
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

  async setCheckpoint(id: string, checkpointRef: string): Promise<void> {
    await prisma.idempotencyKey.update({ where: { id }, data: { checkpointRef } })
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
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3 — see this file's own header.
 * Passed to every `persist()` call so a `persist()` with more than one
 * independently-durable internal write can record an intermediate
 * result BEFORE attempting the next one, and reuse it on a later retry
 * instead of re-running the already-durable step. `idempotency.ts`
 * itself never interprets `ref`'s contents — it is whatever id the
 * call site's own `persist()` decides is worth checkpointing.
 */
export interface PersistCheckpoint {
  /** Whatever a PRIOR attempt at this same (scope, participantId, key)
   *  already checkpointed via `set()`, or `null` on a genuinely first
   *  attempt — and always `null` when no idempotency key was supplied
   *  at all (there is no row to attach a checkpoint to). */
  ref: string | null
  /** Durably records `ref` on the idempotency row itself, independent of
   *  `status` — survives a subsequent transition to `FAILED` (unlike
   *  `resultRef`, which is only ever set once `persist()` as a whole has
   *  succeeded). A no-op when no idempotency key was supplied. */
  set(ref: string): Promise<void>
}

const noopCheckpoint: PersistCheckpoint = { ref: null, set: async () => {} }

/**
 * Runs `persist()` at most once per (scope, participantId, key). A
 * concurrent or retried call with the SAME key and the SAME
 * `requestPayload` either waits out the race (`IdempotencyKeyConflictError`,
 * 409 — the caller's own job to decide whether to poll/retry) or, once
 * the original attempt has finished, gets the ORIGINAL result back via
 * `recover()` — never a second execution of `persist()`. The SAME key
 * with a DIFFERENT `requestPayload` is treated as a genuine client bug
 * (reusing an idempotency key for a new logical action), rejected with
 * `ValidationError` rather than silently replayed or silently allowed.
 *
 * CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R2 — `persist()` and `postPersist()`
 * are deliberately two separate callbacks, not one. `persist()` must
 * contain ONLY the durable business write (and nothing that can be
 * skipped without leaving a half-created object); its own thrown error
 * is the ONLY thing that marks the claim `FAILED` (see `runAndSettle()`).
 * `postPersist(result)` runs AFTER the claim has already been settled to
 * `COMPLETED`/`UNKNOWN` — its failures propagate unchanged to the
 * ORIGINAL caller of `withIdempotency()` (a real error, not swallowed),
 * but can never regress the idempotency record, and are never re-run on
 * a later replay with the same key (that replay goes straight to
 * `recover()`). Getting this boundary right per call site is the
 * caller's responsibility — see `trade.service.ts`, `liquidity.service.ts`,
 * and `dispute.service.ts` for the three audited boundaries this
 * mission established.
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
  persist: (checkpoint: PersistCheckpoint) => Promise<T>,
  postPersist: (result: T) => Promise<void>,
  recover: (resultId: string) => Promise<T>
): Promise<T> {
  const { scope, participantId, key, requestPayload } = params
  const store = params.store ?? defaultStore

  if (!key) {
    const result = await persist(noopCheckpoint)
    await postPersist(result)
    return result
  }

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

    return runAndSettle(persist, postPersist, store, existing.id, existing.checkpointRef)
  }

  return runAndSettle(persist, postPersist, store, claim.id, null)
}

async function runAndSettle<T extends { id: string }>(
  persist: (checkpoint: PersistCheckpoint) => Promise<T>,
  postPersist: (result: T) => Promise<void>,
  store: IdempotencyKeyStore,
  claimId: string,
  // CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R3 — `null` for a brand-new claim
  // (nothing could have been checkpointed yet); whatever the PRIOR
  // attempt recorded when this is a `FAILED -> IN_PROGRESS` reclaim
  // (`checkpointRef` survives that transition — only `status` changes).
  existingCheckpointRef: string | null
): Promise<T> {
  const checkpoint: PersistCheckpoint = {
    ref: existingCheckpointRef,
    set: (ref: string) => store.setCheckpoint(claimId, ref),
  }

  let result: T
  try {
    result = await persist(checkpoint)
  } catch (err) {
    // persist() itself never produced a durable object — this is the
    // ONLY branch allowed to mark the claim FAILED. Nothing past this
    // point (including postPersist(), which never even runs) may ever
    // do so again for this attempt.
    await store.markFailed(claimId)
    throw err
  }

  // CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R1 (Defect A) — persist() already
  // succeeded; a durable side effect genuinely exists (`result.id`).
  // From here on, this function must return `result` to the caller no
  // matter what happens next — the caller's own request DID durably
  // succeed, full stop. What remains uncertain is only whether the
  // bookkeeping write below itself lands cleanly.
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
        msg: 'Idempotency bookkeeping could not be finalized after a successful persist() — the business action succeeded, but this claim row may be stuck IN_PROGRESS pending manual reconciliation',
        claimId,
        resultId: result.id,
        markCompletedError: finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr),
        markUnknownError: unknownErr instanceof Error ? unknownErr.message : String(unknownErr),
      })
    }
  }

  // CROSS-LAYER-SEMANTIC-CORRECTIVE-1-R2 — the claim is ALREADY settled
  // to COMPLETED/UNKNOWN above, before postPersist() ever runs. A
  // postPersist() failure here is real and propagates unchanged to
  // whichever caller (original or a `create()`-branch reclaim) invoked
  // `runAndSettle()` — but it can never again touch this claim row. A
  // retry with the same key will always take the COMPLETED/UNKNOWN
  // branch in `withIdempotency()` above and call `recover()`, never
  // re-run `persist()` — so a failed postPersist() can never duplicate
  // the durable object. This deliberately does not retry postPersist()
  // itself on that later replay; see this file's header comment for the
  // disclosed residual that leaves.
  await postPersist(result)

  return result
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}
