/**
 * Mission 3 R2 (docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md
 * §7/§15) — the ONLY authoritative "is there an active session, and
 * which one" truth `AuthContext.tsx`'s `onSessionExpired` handler
 * consults. Extracted as a pure, React-free module specifically so the
 * mutual-exclusion property it provides can be unit-tested directly —
 * `packages/sails-ui` has no UI test runner (TD#62/#63, disclosed,
 * unchanged) — the exact same extraction reasoning
 * `lib/escrowErrorClassification.ts`'s own header already documents.
 *
 * Defect this closes: the original guard read a React ref
 * (`userRef.current`) that was synchronized only by a `useEffect` —
 * which runs AFTER React commits, not synchronously with the state
 * update that triggered it. Multiple authenticated requests can
 * legitimately share one session token; if that session expires,
 * several of them can independently 401 and each cause the SDK's
 * `onSessionExpired` to fire (correctly — see that hook's own doc
 * comment: it fires per QUALIFYING REQUEST, not once globally). Every
 * one of those callbacks could arrive before React ever ran the effect
 * that would have synced the ref — so each one observed the SAME stale
 * "there is an active session" truth and each treated ONE underlying
 * expiry as a NEW episode: duplicate toasts, duplicate navigations,
 * return-path churn. Governing property this closes: "many failed
 * requests may observe one expired session — they must converge on one
 * session-expiry episode" ("request failure multiplicity ≠ session-
 * expiry multiplicity").
 *
 * Fix: `activate()`/`deactivate()` are called synchronously by
 * `login()`/`logout()`, at the exact point they change session state —
 * never inside a `useEffect`. `claimExpiry()` is the atomic
 * check-then-clear a concurrent `onSessionExpired` callback uses: the
 * FIRST call sees the active epoch and clears it in the SAME synchronous
 * step (no `await` between the read and the write) — by ordinary JS
 * run-to-completion semantics, no other invocation, however "concurrent"
 * from the SDK/network's perspective, can ever also observe that same
 * epoch as active again. Every subsequent call for the SAME episode sees
 * `null` and correctly no-ops. This is the identical "insert-as-lock /
 * atomic compare-and-swap" idiom this codebase's own backend already
 * uses pervasively (`IdempotencyKey.claim()`, `reclaimFailed()`,
 * `escrow-lifecycle.ts`'s `claimEscrowTransition()`) — applied here to a
 * client-side, single-threaded-JS equivalent of the same property.
 *
 * The returned epoch is a real, locally-unique, strictly-increasing
 * integer — deliberately NOT a wall-clock timestamp. An earlier version
 * of this mechanism used `Date.now()` and called it a "monotonic
 * marker," which is imprecise: wall-clock milliseconds are neither
 * guaranteed unique (two calls in the same millisecond collide) nor
 * strictly monotonic (a clock adjustment can move it backward). Nothing
 * here needs wall-clock time at all — only "is this a NEW episode,"
 * which a plain incrementing counter answers exactly and cheaply.
 */
export interface SessionEpochGate {
  /** Call when a NEW session becomes active (a successful login).
   *  Returns that session's own epoch id — always greater than any
   *  epoch previously returned by this same gate instance. */
  activate(): number
  /** Call when a session ends deliberately (an explicit logout). Any
   *  LATER `claimExpiry()` call — e.g. from a stale in-flight request's
   *  401 arriving after logout already ran — correctly returns `null`,
   *  never manufacturing a spurious expiry episode for a session the
   *  user already left on purpose. */
  deactivate(): void
  /** Atomically claims the currently-active epoch, if any. Returns the
   *  claimed epoch, or `null` when there is no active session right now
   *  — never logged in yet, already logged out, or this exact episode
   *  was already claimed by an earlier concurrent call. Synchronous by
   *  construction (no `await` anywhere in this method) — that is the
   *  entire correctness mechanism. */
  claimExpiry(): number | null
}

export function createSessionEpochGate(): SessionEpochGate {
  let currentEpoch: number | null = null
  let nextEpoch = 0

  return {
    activate() {
      nextEpoch += 1
      currentEpoch = nextEpoch
      return currentEpoch
    },
    deactivate() {
      currentEpoch = null
    },
    claimExpiry() {
      const epoch = currentEpoch
      if (epoch === null) return null
      currentEpoch = null
      return epoch
    },
  }
}
