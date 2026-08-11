/**
 * Cross-package hash consistency — RFC-021 D5.
 *
 * The whole payment-account privacy scheme depends on @satsails/p2p-trading-sdk's
 * client-side hashPaymentAccount() and the backend's
 * PaymentAccountService.hashAccountIdentifier() producing byte-identical
 * SHA-256 output for the same (paymentMethod, rawIdentifier) pair — the
 * server never sees the raw identifier, only whichever hash the SDK
 * already computed, so if the two algorithms ever drift, real accounts
 * silently fail to match. No mocks: both real implementations, run
 * side-by-side against the same inputs.
 */
export {} // same forced-module reasoning used throughout this suite

import { hashPaymentAccount } from '../packages/sails-sdk/src/payment-account'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PaymentAccountService } = require('../src/modules/open-settlement/payment-account.service')

describe('SDK hashPaymentAccount() vs backend hashAccountIdentifier() (RFC-021 D5)', () => {
  const backend = new PaymentAccountService()

  it('produce byte-identical output for a real PIX identifier', () => {
    const sdkHash = hashPaymentAccount('PIX', 'alan@example.com')
    const backendHash = backend.hashAccountIdentifier('PIX', 'alan@example.com')
    expect(sdkHash).toBe(backendHash)
  })

  it('stay identical across payment methods and identifier shapes', () => {
    const cases: Array<[string, string]> = [
      ['PIX', '12345678900'],
      ['TED', '12345678900'],
      ['SEPA', 'DE89370400440532013000'],
      ['ZELLE', 'yuri@example.com'],
      ['REVOLUT', '+55 11 99999-8888'],
    ]
    for (const [method, identifier] of cases) {
      expect(hashPaymentAccount(method, identifier)).toBe(backend.hashAccountIdentifier(method, identifier))
    }
  })

  it('both sides produce a real 64-hex-char SHA-256 digest, not a stub/placeholder', () => {
    const hash = hashPaymentAccount('PIX', 'test-key')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(backend.hashAccountIdentifier('PIX', 'test-key'))
  })
})
