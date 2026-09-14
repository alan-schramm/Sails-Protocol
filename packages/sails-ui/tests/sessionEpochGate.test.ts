/**
 * Mission 3 R2 (docs/PARTNER_WALLET_INTEGRATION_IDENTITY_CONTINUITY.md
 * §7/§15) — proves `lib/sessionEpochGate.ts`'s real concurrency property
 * directly. `packages/sails-ui` has no UI test runner (TD#62/#63,
 * disclosed, unchanged) — this tests the PURE, React-free gate the same
 * way `escrowErrorClassification.test.ts` already established for this
 * package (see that file's own header for the full "why a pure
 * extraction" reasoning), via the repo ROOT `jest.config.js`'s
 * `testMatch: ['**\/tests/**\/*.test.ts']`. Must be run from the repo
 * root, same as that file — no local ts-jest config under
 * `packages/sails-ui/`.
 *
 * Deliberately does NOT mock away the property being proved: every test
 * below calls the REAL `claimExpiry()`/`activate()`/`deactivate()`
 * methods and asserts on their REAL return values — this is the actual
 * mutual-exclusion mechanism `AuthContext.tsx` runs in production, not a
 * stand-in for it.
 */
import { createSessionEpochGate } from '../src/lib/sessionEpochGate'

describe('createSessionEpochGate() — Mission 3 R2 concurrent session-expiry convergence', () => {
  it('1. active session + one claimExpiry() call → exactly one non-null episode', () => {
    const gate = createSessionEpochGate()
    const epoch = gate.activate()

    const claimed = gate.claimExpiry()

    expect(claimed).toBe(epoch)
    expect(claimed).not.toBeNull()
  })

  it('2. active session + several "concurrent" claimExpiry() calls (simulating multiple requests independently 401ing on the SAME expired token) → exactly ONE call gets the episode, every other gets null', () => {
    const gate = createSessionEpochGate()
    gate.activate()

    // Models N authenticated requests that all shared the same session
    // token and all independently reached the onSessionExpired handler
    // for the SAME underlying expiry — exactly the scenario the mission
    // brief describes ("several requests may independently return 401").
    const results = [gate.claimExpiry(), gate.claimExpiry(), gate.claimExpiry(), gate.claimExpiry(), gate.claimExpiry()]

    const nonNull = results.filter((r) => r !== null)
    expect(nonNull).toHaveLength(1) // exactly one UI reaction, never zero, never more than one
    expect(results.filter((r) => r === null)).toHaveLength(4)
  })

  it('3. after a genuine re-login (activate() again) following a claimed expiry, a SECOND, later expiry is handled normally — a fresh, distinct episode', () => {
    const gate = createSessionEpochGate()
    const firstEpoch = gate.activate()
    expect(gate.claimExpiry()).toBe(firstEpoch) // first session expires, claimed once

    const secondEpoch = gate.activate() // user logs back in
    expect(secondEpoch).not.toBe(firstEpoch) // a genuinely new, distinct episode id
    expect(secondEpoch).toBeGreaterThan(firstEpoch) // strictly increasing, not reused

    const secondClaim = gate.claimExpiry() // the SECOND session later expires too
    expect(secondClaim).toBe(secondEpoch)
  })

  it('4. logout() (deactivate()) followed by a LATE claimExpiry() call from a stale in-flight request does not manufacture a new expiry episode', () => {
    const gate = createSessionEpochGate()
    gate.activate()
    gate.deactivate() // explicit, deliberate logout — the user left on purpose

    // A request that was already in flight when logout() ran, using the
    // now-stale token, finally resolves as a 401 and reaches the handler.
    const lateClaim = gate.claimExpiry()

    expect(lateClaim).toBeNull() // correctly suppressed — this is not a real expiry episode
  })

  it('5. claimExpiry() before any activate() ever ran (never logged in) also returns null, not a spurious episode', () => {
    const gate = createSessionEpochGate()

    expect(gate.claimExpiry()).toBeNull()
  })

  it('epoch ids are real, locally-unique, strictly-increasing integers across repeated activate() cycles — never derived from wall-clock time', () => {
    const gate = createSessionEpochGate()
    const epochs: number[] = []
    for (let i = 0; i < 5; i++) {
      epochs.push(gate.activate())
      gate.deactivate()
    }

    const unique = new Set(epochs)
    expect(unique.size).toBe(epochs.length) // every epoch distinct
    for (let i = 1; i < epochs.length; i++) {
      expect(epochs[i]).toBeGreaterThan(epochs[i - 1]) // strictly increasing
    }
  })
})
