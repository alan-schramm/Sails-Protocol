/**
 * LightningHodlProvider — Arkade (Ark protocol) VTXO/Taproot escrow.
 *
 * Client-held-keys pass (2026-07-27): same change as
 * tests/multisigProvider.test.ts — buyer/seller pubkeys are now
 * client-submitted (33-byte compressed secp256k1 hex, the SAME format
 * MultisigProvider uses; this provider strips the leading byte to get
 * the 32-byte x-only form internally), not server-derived. Only the
 * arbiter key is still derived from ARKADE_SEED. releaseFunds()/
 * refundFunds() now throw a clear "Phase 2 not built" error
 * unconditionally — see lightning-hodl.provider.ts's own header comment.
 *
 * `@arkade-os/sdk` cannot be loaded for real here — its CJS build
 * transitively requires `@scure/btc-signer`, pure ESM, no CJS build —
 * mocked here for that reason, same as every other test file that
 * reaches escrow.service.ts. The real cryptography (key derivation,
 * VtxoScript construction, a live ASP call) was verified independently
 * via a standalone script outside Jest before this provider was written.
 */
jest.mock('@arkade-os/sdk', () => ({
  SeedIdentity: { fromSeed: jest.fn() },
  MultisigTapscript: { encode: jest.fn() },
  CSVMultisigTapscript: { encode: jest.fn() },
  VtxoScript: class FakeVtxoScript {},
  RestArkProvider: class FakeRestArkProvider {
    getInfo() {
      return Promise.reject(new Error('FakeRestArkProvider.getInfo should not be reached by these tests'))
    }
  },
  RestIndexerProvider: class FakeRestIndexerProvider {},
}))

const ORIGINAL_ENV = process.env

// Same real, valid 33-byte compressed secp256k1 pubkeys as
// tests/multisigProvider.test.ts (one client key genuinely serves both
// providers — verified experimentally, see lightning-hodl.provider.ts's
// own header comment).
const BUYER_PUBKEY = '021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299'
const SELLER_PUBKEY = '038e41e2cb09677fd4bde9f232871533925c4b628c25efdb9d572546293850ddd4'

function loadProvider(env: Record<string, string | undefined>) {
  jest.resetModules()
  process.env = { ...ORIGINAL_ENV, MOCK_ESCROW: 'false', ...env }
  return require('../src/modules/open-settlement/lightning-hodl.provider')
}

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('seedFor (deterministic per-role-and-id derivation, pure — no SDK dependency)', () => {
  it('is deterministic — same role+id always derives the same seed', () => {
    const { seedFor } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(Buffer.from(seedFor('arbiter', 'arb-1')).toString('hex')).toBe(Buffer.from(seedFor('arbiter', 'arb-1')).toString('hex'))
  })

  it('produces different seeds for different ids', () => {
    const { seedFor } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(Buffer.from(seedFor('arbiter', 'arb-1')).toString('hex')).not.toBe(Buffer.from(seedFor('arbiter', 'arb-2')).toString('hex'))
  })

  it('produces a real 64-byte seed (SeedIdentity.fromSeed\'s expected input shape)', () => {
    const { seedFor } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(seedFor('arbiter', 'arb-1').length).toBe(64)
  })
})

describe('LightningHodlProvider.custodyModel', () => {
  it('declares itself client-held-buyer-seller-keys, not server-derived', () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(lightningHodlProvider.custodyModel).toBe('client-held-buyer-seller-keys-server-held-arbiter')
  })
})

describe('LightningHodlProvider config gating — inert without ARKADE_SEED/TRUSTED_ARBITRATORS', () => {
  it('throws a clear error when ARKADE_SEED is empty', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: '', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(lightningHodlProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)).rejects.toThrow('ARKADE_SEED')
  })

  it('throws a clear error when no TRUSTED_ARBITRATORS entry is configured', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: '' })
    await expect(lightningHodlProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)).rejects.toThrow('TRUSTED_ARBITRATORS')
  })

  it('requires a submitted buyer/seller pubkey — escrow.service.ts must pass EscrowParticipantKey through', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.lockFunds({ tradeId: 't1', lockedAmount: '0.0005' })
    ).rejects.toThrow('requires a submitted buyer pubkey')
  })

  it('rejects a malformed (wrong-length) pubkey with a clear error', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(lightningHodlProvider.getDepositAddress('trade-1', '02aabb', SELLER_PUBKEY)).rejects.toThrow('33-byte compressed')
  })
})

describe('LightningHodlProvider — releaseFunds()/refundFunds() are Phase-2-not-built (client-signature collection)', () => {
  it('releaseFunds() throws a clear, honest error without any network call', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const sdk = require('@arkade-os/sdk')
    const getInfo = jest.spyOn(sdk.RestArkProvider.prototype, 'getInfo')

    await expect(
      lightningHodlProvider.releaseFunds(
        { tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'PAYMENT_PENDING' },
        'deadbeef'
      )
    ).rejects.toThrow('Phase 2')
    expect(getInfo).not.toHaveBeenCalled()
  })

  it('refundFunds() throws the same clear error', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.refundFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'FUNDS_LOCKED' })
    ).rejects.toThrow('Phase 2')
  })
})
