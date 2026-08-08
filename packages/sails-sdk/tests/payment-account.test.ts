/**
 * hashPaymentAccount() — pure client-side SHA-256 hashing of
 * payment method + raw identifier. Verifies the output matches
 * an independent computation using the same @noble/hashes library
 * (this package's own dependency, not the server's source tree).
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '../src/encoding'
import { hashPaymentAccount } from '../src/payment-account'

describe('hashPaymentAccount', () => {
  it('produces a byte-identical hash to the independent computation', () => {
    const method = 'PIX'
    const identifier = '12345678901'
    const expected = bytesToHex(sha256(utf8ToBytes(`${method}:${identifier}`)))

    expect(hashPaymentAccount(method, identifier)).toBe(expected)
  })

  it('returns a 64-character hex string (SHA-256 output, no 0x prefix)', () => {
    const result = hashPaymentAccount('PIX', '12345678901')
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces different hashes for different payment methods', () => {
    const pix = hashPaymentAccount('PIX', '12345678901')
    const bank = hashPaymentAccount('BANK', '12345678901')
    expect(pix).not.toBe(bank)
  })

  it('produces different hashes for different identifiers', () => {
    const a = hashPaymentAccount('PIX', '12345678901')
    const b = hashPaymentAccount('PIX', '98765432101')
    expect(a).not.toBe(b)
  })

  it('matches the backend hashAccountIdentifier() format', () => {
    const result = hashPaymentAccount('PIX', '12345678901')
    expect(typeof result).toBe('string')
    expect(result.startsWith('0x')).toBe(false)
    expect(result.length).toBe(64)
  })
})