/**
 * MultisigProvider — real 2-of-3 Bitcoin P2WSH script/PSBT logic.
 *
 * Client-held-keys pass (2026-07-27): buyer/seller pubkeys are now
 * client-submitted (33-byte compressed secp256k1 hex, real fixtures
 * generated once via @noble/curves — see the constants below), not
 * server-derived. Only the arbiter key is still derived from
 * MULTISIG_SEED. releaseFunds()/refundFunds() now throw a clear "Phase 2
 * not built" error unconditionally, since this provider no longer holds
 * either counterparty's private key to sign with — see
 * multisig.provider.ts's own header comment for the full disclosure.
 *
 * Unlike WdkSettlementProvider (tests/wdkSettlementProvider.test.ts),
 * whose lock/release/refund calls need a live funded testnet wallet to
 * verify for real, everything testable here (key derivation for the
 * arbiter, script/address construction, UTXO verification) is pure and
 * fully verifiable without any live infrastructure — only the explorer
 * API network call is mocked.
 *
 * config.multisig.seed / config.settlement.trustedArbitrators are read
 * once at module-load time (src/config/index.ts), so each test that
 * needs a specific configuration resets modules and re-requires with
 * process.env set first.
 */
export {} // forces module scope — without this, top-level `const` here and in
// lightningHodlProvider.test.ts (also script-scoped, no imports of its own)
// collide as the SAME global binding under isolatedModules-style checking.

const ORIGINAL_ENV = process.env

// Real, valid 33-byte compressed secp256k1 pubkeys — generated once via
// @noble/curves (deterministic sha256-derived private keys), not random,
// so test failures are reproducible.
const BUYER_PUBKEY = '021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299'
const SELLER_PUBKEY = '038e41e2cb09677fd4bde9f232871533925c4b628c25efdb9d572546293850ddd4'
const BUYER2_PUBKEY = '03a8f0fdc9911d8e33f58b1fced67b769189f2188431515e5171462522cb1be87b'
const SELLER2_PUBKEY = '022704740d198905f841d3c4a82afd828398130d62190d9142761158eb893c9419'

function loadProvider(env: Record<string, string | undefined>) {
  jest.resetModules()
  process.env = { ...ORIGINAL_ENV, MOCK_ESCROW: 'false', ...env }
  return require('../src/modules/open-settlement/multisig.provider')
}

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('keyIndexFor (deterministic per-role-and-id derivation)', () => {
  it('is deterministic — same role+id always derives the same index', () => {
    const { keyIndexFor } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(keyIndexFor('arbiter', 'user-1')).toBe(keyIndexFor('arbiter', 'user-1'))
  })

  it('produces different indexes for different ids (distinct salt)', () => {
    const { keyIndexFor } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(keyIndexFor('arbiter', 'arb-1')).not.toBe(keyIndexFor('arbiter', 'arb-2'))
  })

  it('always stays within the valid BIP-32 non-hardened index range', () => {
    const { keyIndexFor } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    for (const id of ['u1', 'a-very-long-user-id-uuid-like-string-1234567890', '']) {
      const index = keyIndexFor('arbiter', id)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(0x80000000)
    }
  })
})

describe('MultisigProvider.custodyModel', () => {
  it('declares itself client-held-buyer-seller-keys, not server-derived', () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(multisigProvider.custodyModel).toBe('client-held-buyer-seller-keys-server-held-arbiter')
  })
})

describe('MultisigProvider config gating — inert without MULTISIG_SEED/TRUSTED_ARBITRATORS', () => {
  it('throws a clear error when MULTISIG_SEED is empty', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: '', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)).rejects.toThrow('MULTISIG_SEED')
  })

  it('throws a clear error when no TRUSTED_ARBITRATORS entry is configured', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: '' })
    await expect(multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)).rejects.toThrow('TRUSTED_ARBITRATORS')
  })

  it('rejects a malformed (wrong-length) pubkey with a clear error', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(multisigProvider.getDepositAddress('trade-1', '02aabb', SELLER_PUBKEY)).rejects.toThrow('33-byte compressed')
  })
})

describe('MultisigProvider.getDepositAddress (real P2WSH address derivation from submitted pubkeys)', () => {
  it('is deterministic — same buyer/seller pubkeys always derive the same address', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    const b = await multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    expect(a).toBe(b)
    expect(a).toMatch(/^tb1/) // testnet bech32 (P2WSH) prefix
  })

  it('derives a different address for a different buyer/seller pubkey pair', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    const b = await multisigProvider.getDepositAddress('trade-2', BUYER2_PUBKEY, SELLER2_PUBKEY)
    expect(a).not.toBe(b)
  })

  it('derives a different address under a different arbiter seed (same buyer/seller pubkeys)', async () => {
    const { multisigProvider: p1 } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await p1.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    const { multisigProvider: p2 } = loadProvider({ MULTISIG_SEED: 'seed-b', TRUSTED_ARBITRATORS: 'arb-1' })
    const b = await p2.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    expect(a).not.toBe(b)
  })
})

describe('MultisigProvider — lock/verify against a mocked explorer API', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    ;(global as any).fetch = fetchMock
  })

  it('lockFunds finds a sufficient confirmed UTXO and returns its txid', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ txid: 'a'.repeat(64), vout: 0, value: 100_000, status: { confirmed: true } }],
    })
    const result = await multisigProvider.lockFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005' })
    expect(result.txId).toBe('a'.repeat(64))
    expect(result.address).toMatch(/^tb1/)
  })

  it('lockFunds throws (non-custodial — never fakes a lock) when no sufficient UTXO exists yet', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })
    await expect(
      multisigProvider.lockFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005' })
    ).rejects.toThrow('No funding UTXO')
  })

  it('lockFunds throws when no pubkeys have been submitted yet', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.lockFunds({ tradeId: 't1', lockedAmount: '0.0005' })
    ).rejects.toThrow('requires a submitted buyer pubkey')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifyLock is true only for a confirmed UTXO meeting the expected amount', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ txid: 'b'.repeat(64), vout: 0, value: 100_000, status: { confirmed: false } }],
    })
    const unconfirmed = await multisigProvider.verifyLock({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005' })
    expect(unconfirmed).toBe(false)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ txid: 'b'.repeat(64), vout: 0, value: 100_000, status: { confirmed: true } }],
    })
    const confirmed = await multisigProvider.verifyLock({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005' })
    expect(confirmed).toBe(true)
  })

  it('propagates a clear error when the explorer API itself fails', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(
      multisigProvider.verifyLock({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005' })
    ).rejects.toThrow('503')
  })
})

describe('MultisigProvider — releaseFunds()/refundFunds() are Phase-2-not-built (client-signature collection)', () => {
  it('releaseFunds() throws a clear, honest error rather than attempting to sign with a key it no longer holds', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.releaseFunds(
        { tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'PAYMENT_PENDING' },
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      )
    ).rejects.toThrow('Phase 2')
  })

  it('refundFunds() throws the same clear error', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.refundFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'FUNDS_LOCKED' })
    ).rejects.toThrow('Phase 2')
  })
})
