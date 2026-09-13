/**
 * PRE-M3-REALITY-GATE-1-R1 (2026-09-13) — closes the missing automated
 * evidence for P3-F03/P3-F04 (Pre-M3 Reality Gate, same date).
 *
 * That mission fixed a real bug: `useEscrowKey.ts`'s bare
 * `catch { return null }` and `Trade.tsx`'s `ignoreExceptWrongPassphrase`
 * catch-all both used to treat EVERY error — a 401, a 403, a network
 * failure, a timeout, a 500, or a genuine 404 — as silent "nothing to
 * do." The fix was verified by code-reading only; the only automated
 * test added at the time (`packages/sails-sdk/tests/modules.test.ts`)
 * proves the SDK now *sends* the auth header, not that the UI's
 * failure-classification logic actually keeps absence, failure, and
 * unknown-but-real errors distinct.
 *
 * `packages/sails-ui` has no test runner configured at all (pre-existing,
 * disclosed TD#62/#63) — installing one (Vitest/RTL/jsdom) just to prove
 * this one property would be disproportionate. Instead this file tests
 * the two PURE classification functions extracted to
 * `packages/sails-ui/src/lib/escrowErrorClassification.ts` directly, via
 * the repo ROOT `jest.config.js`'s `testMatch: ['**\/tests/**\/*.test.ts']`
 * — the exact same "any plain-TS file under **\/tests/" seam
 * `packages/sails-sdk/tests/modules.test.ts` already runs through, with
 * zero new dependencies and no React/DOM involved. Must be run from the
 * repo root (`npx jest packages/sails-ui/tests/escrowErrorClassification.test.ts --runInBand`
 * from inside `packages/sails-ui/` fails — no local ts-jest config
 * there), same as the SDK's own test file.
 *
 * Deliberately uses the REAL SDK error classes (`@satsails/p2p-trading-sdk`,
 * mapped by the root jest config straight to `packages/sails-sdk/src/index.ts`)
 * and the REAL `WrongPassphraseError` — nothing here is mocked. Per the
 * mission brief: "Do not mock away the failure classification being
 * claimed."
 */
import {
  SailsAuthError,
  SailsForbiddenError,
  SailsNotFoundError,
  SailsInternalError,
  SailsRateLimitError,
  SailsTransportError,
} from '@satsails/p2p-trading-sdk'
import { WrongPassphraseError } from '../src/lib/errors'
import {
  classifyPendingTransactionError,
  classifySigningWatchError,
} from '../src/lib/escrowErrorClassification'

describe('classifyPendingTransactionError() — useEscrowKey.ts P3-F03 seam', () => {
  it('classifies a genuine SailsNotFoundError (no pending round in flight) as absence', () => {
    const err = new SailsNotFoundError('No pending transaction for this escrow')
    expect(classifyPendingTransactionError(err)).toBe('absence')
  })

  it('classifies a SailsAuthError (expired session) as propagate, NOT absence', () => {
    const err = new SailsAuthError('Session expired')
    expect(classifyPendingTransactionError(err)).toBe('propagate')
  })

  it('classifies a SailsForbiddenError (wrong actor) as propagate, NOT absence', () => {
    const err = new SailsForbiddenError('Not a party to this escrow')
    expect(classifyPendingTransactionError(err)).toBe('propagate')
  })

  it('classifies a network failure (SailsTransportError) as propagate, NOT absence', () => {
    const err = new SailsTransportError('Failed to fetch: network error')
    expect(classifyPendingTransactionError(err)).toBe('propagate')
  })

  it('classifies a request timeout (SailsTransportError, same type transport.ts throws) as propagate, NOT absence', () => {
    const err = new SailsTransportError('Request timed out after 15000ms: GET /v1/settlement/escrow/escrow-1/pending-transaction')
    expect(classifyPendingTransactionError(err)).toBe('propagate')
  })

  it('classifies a server 5xx (SailsInternalError) as propagate, NOT absence', () => {
    const err = new SailsInternalError('Internal server error')
    expect(classifyPendingTransactionError(err)).toBe('propagate')
  })

  it('classifies a rate limit (SailsRateLimitError) as propagate, NOT absence', () => {
    const err = new SailsRateLimitError('Too many requests')
    expect(classifyPendingTransactionError(err)).toBe('propagate')
  })

  it('classifies an unrecognized/unexpected error as propagate, NOT absence', () => {
    expect(classifyPendingTransactionError(new Error('something truly unexpected'))).toBe('propagate')
    expect(classifyPendingTransactionError('a thrown string, not even an Error')).toBe('propagate')
    expect(classifyPendingTransactionError(undefined)).toBe('propagate')
  })
})

describe('classifySigningWatchError() — Trade.tsx P3-F04 seam (ignoreExceptWrongPassphrase)', () => {
  it('classifies WrongPassphraseError distinctly from every other outcome', () => {
    const err = new WrongPassphraseError('Não foi possível desbloquear sua chave de escrow — senha incorreta.')
    expect(classifySigningWatchError(err)).toBe('wrong-passphrase')
  })

  it('classifies SailsAuthError as session-expired, NOT wrong-passphrase, NOT silently discarded', () => {
    const err = new SailsAuthError('Session expired')
    expect(classifySigningWatchError(err)).toBe('session-expired')
  })

  it('classifies SailsForbiddenError as forbidden, NOT wrong-passphrase, NOT silently discarded', () => {
    const err = new SailsForbiddenError('Not a required signer for this escrow')
    expect(classifySigningWatchError(err)).toBe('forbidden')
  })

  it('classifies a network failure (SailsTransportError) as unknown — visible, not silently discarded', () => {
    const err = new SailsTransportError('Failed to fetch: network error')
    expect(classifySigningWatchError(err)).toBe('unknown')
  })

  it('classifies a request timeout (SailsTransportError) as unknown — visible, not silently discarded', () => {
    const err = new SailsTransportError('Request timed out after 15000ms: POST /v1/settlement/escrow/escrow-1/transaction-signature')
    expect(classifySigningWatchError(err)).toBe('unknown')
  })

  it('classifies a server 5xx (SailsInternalError) as unknown — visible, not silently discarded', () => {
    const err = new SailsInternalError('Internal server error')
    expect(classifySigningWatchError(err)).toBe('unknown')
  })

  it('classifies a genuinely unexpected error as unknown — visible, not silently discarded', () => {
    expect(classifySigningWatchError(new Error('something truly unexpected'))).toBe('unknown')
    expect(classifySigningWatchError('a thrown string, not even an Error')).toBe('unknown')
    expect(classifySigningWatchError(undefined)).toBe('unknown')
  })

  // Defense-in-depth: a genuine SailsNotFoundError should already have
  // been filtered out upstream by classifyPendingTransactionError()
  // before ignoreExceptWrongPassphrase() is ever invoked (see
  // useEscrowKey.ts — the `.catch(ignoreExceptWrongPassphrase)` call
  // sites in Trade.tsx only ever receive whatever
  // signAndSubmitPendingTransactionIfNeeded()/submitEscrowKeyIfNeeded()
  // actually throw, and those already return null for absence rather
  // than throwing). If one ever reached here anyway, it must still not
  // be silently swallowed — 'unknown' still produces a visible toast.
  it('classifies a SailsNotFoundError reaching this seam (should not normally happen) as unknown, not silent', () => {
    const err = new SailsNotFoundError('No pending transaction for this escrow')
    expect(classifySigningWatchError(err)).toBe('unknown')
  })
})
