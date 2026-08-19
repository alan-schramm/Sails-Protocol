/**
 * @satsails/p2p-trading-sdk — atomic account_index reservation contract
 * (Missão 10, Fase 6-9).
 *
 * account_index is only safe against collision if it is NEVER reused
 * across two escrow keys of the same (role, network, scriptType,
 * derivationVersion). Reservation must therefore be atomic: read the
 * current counter, commit an incremented value, and hand back the OLD
 * value — with no window where two concurrent callers could both read
 * the same current value.
 *
 * This SDK/core layer does NOT and cannot guarantee that atomicity by
 * itself — atomicity depends entirely on whatever storage the reserving
 * process actually holds the counter in (a DB transaction, an OS file
 * lock, an in-process mutex). Claiming an abstract guarantee here that
 * the concrete storage adapter doesn't actually provide would be a false
 * promise: this file only defines the CONTRACT. Any real implementation
 * that cannot itself guarantee atomic read-modify-write MUST fail the
 * call rather than perform an unprotected read/increment/write — never
 * silently degrade to a racy implementation.
 *
 * Explicitly, deliberately out of scope: multiple separate
 * devices/processes sharing the same wallet seed reserving indices
 * concurrently, uncoordinated. That is a hard, general multi-device HD
 * wallet consistency problem, not specific to Sails, and this contract
 * does not attempt to solve it.
 *
 * A reserved index is consumed permanently — there is deliberately no
 * "release"/"unreserve" method on this interface. Even if the escrow the
 * index was reserved for fails to be created, is cancelled, or the
 * process dies before finishing, that index must never be reissued to a
 * different key (CTO instruction, Missão 10 Fase 6-9): the cost of a
 * "burned" index is negligible (the index space is enormous); reuse
 * would reintroduce exactly the collision risk this whole scheme exists
 * to eliminate.
 */
import type { EscrowKeyNetwork, EscrowKeyRole, EscrowScriptType } from './escrow-key-derivation'

export interface EscrowKeyIndexScope {
  role: EscrowKeyRole
  network: EscrowKeyNetwork
  scriptType: EscrowScriptType
  derivationVersion: string
}

export interface EscrowKeyIndexStore {
  /**
   * Atomically reserves and returns the next unused account_index for
   * this exact scope. Must never return the same index twice for the
   * same scope, including under concurrent calls. Implementations that
   * cannot guarantee this MUST throw rather than return a possibly-
   * colliding value.
   */
  reserveNextAccountIndex(scope: EscrowKeyIndexScope): Promise<number>
}

function scopeKey(scope: EscrowKeyIndexScope): string {
  return `${scope.derivationVersion}:${scope.network}:${scope.scriptType}:${scope.role}`
}

/**
 * Reference implementation — correct ONLY for a single JS process/event
 * loop (one tab, one Node process). Its atomicity comes from a real,
 * verifiable property of JS's execution model: the read-modify-write
 * below contains no `await`, so the entire body runs to completion
 * synchronously once invoked, before any other queued microtask
 * (including a second concurrent call to this same method) can run —
 * not an assumption, exercised directly in this SDK's own test suite
 * (T7: concurrent local reservations never collide).
 *
 * NOT safe across multiple separate processes/tabs/devices sharing
 * external storage (a browser tab's own in-memory Map obviously isn't
 * shared with another tab at all) — a wallet integrator needing that
 * must implement EscrowKeyIndexStore against real transactional storage
 * (IndexedDB with a real transaction, a local SQLite file with a lock,
 * etc.) and is responsible for that storage's own atomicity guarantee,
 * per this file's header comment.
 */
export class InMemoryEscrowKeyIndexStore implements EscrowKeyIndexStore {
  private readonly counters = new Map<string, number>()

  async reserveNextAccountIndex(scope: EscrowKeyIndexScope): Promise<number> {
    const key = scopeKey(scope)
    const current = this.counters.get(key) ?? 0
    this.counters.set(key, current + 1)
    return current
  }
}
