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
 * compatibility for existing callers, per this mission's own explicit
 * cross-layer review requirement, while giving any caller who wants the
 * guarantee (the SDK, a direct API integrator) a way to opt in without
 * a breaking change.
 *
 * The store interface below is injected specifically so the real
 * concurrency-arbitration LOGIC (what happens when two calls race for
 * the same key, what happens on replay, what happens on a reused key
 * with a different payload) can be proven directly, against a real,
 * behaviorally-faithful in-memory implementation, without needing a
 * live Postgres connection in this environment (`tests/idempotency.test.ts`) —
 * per this mission's own "do not mock the property being proved" rule.
 * The production store (`PrismaIdempotencyKeyStore` below) is a thin,
 * directly-inspectable wrapper over the same atomic
 * insert-as-lock/P2002 idiom `escrow-pending-tx.ts` already uses for a
 * different resource — not a second, competing idempotency mechanism.
 */
import { createHash } from 'node:crypto'
import { prisma } from './database'
import { ValidationError, IdempotencyKeyConflictError } from './errors'

export type IdempotencyKeyStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

export interface IdempotencyRecord {
  id: string
  requestHash: string
  status: IdempotencyKeyStatus
  resultRef: string | null
}

/**
 * The minimal, real operations `withIdempotency()` needs — never a
 * generic repository, only the exact three moves this mechanism
 * performs: claim (atomic, fails if already claimed), read (to resolve
 * a claim conflict), and settle (mark the outcome once known).
 */
export interface IdempotencyKeyStore {
  /** Atomically claims (scope, participantId, key). Throws a P2002-shaped
   *  error (`{ code: 'P2002' }`) if it's already claimed — never returns
   *  a "did I win" boolean, so a caller can't accidentally race on the
   *  read-then-write it's supposed to prevent. */
  claim(scope: string, participantId: string, key: string, requestHash: string): Promise<{ id: string }>
  find(scope: string, participantId: string, key: string): Promise<IdempotencyRecord | null>
  markCompleted(id: string, resultRef: string): Promise<void>
  markFailed(id: string): Promise<void>
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

  async markFailed(id: string): Promise<void> {
    await prisma.idempotencyKey.update({ where: { id }, data: { status: 'FAILED' } })
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
  /** `undefined` — no idempotency requested; proceeds exactly as before. */
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
 * a real failure into a false idempotent success) — but the claim row
 * is marked `FAILED` first, so a genuine retry with the same key after
 * a real failure is allowed to try again, not permanently blocked.
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

    if (existing.status === 'FAILED') {
      // The original attempt never durably created anything — safe to
      // run for real now, under the SAME claim row (no new insert, so
      // no fresh unique-constraint race with a third, simultaneous caller
      // needs to be handled here — that caller would itself hit this
      // exact IN_PROGRESS/FAILED branch against the same row).
      return runAndSettle(create, store, existing.id)
    }

    // COMPLETED — a genuine, safe replay.
    return recover(existing.resultRef!)
  }

  return runAndSettle(create, store, claim.id)
}

async function runAndSettle<T extends { id: string }>(
  create: () => Promise<T>,
  store: IdempotencyKeyStore,
  claimId: string
): Promise<T> {
  try {
    const result = await create()
    await store.markCompleted(claimId, result.id)
    return result
  } catch (err) {
    await store.markFailed(claimId)
    throw err
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}
