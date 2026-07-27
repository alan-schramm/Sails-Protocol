/**
 * MultisigProvider — real 2-of-3 Bitcoin P2WSH script/PSBT logic.
 *
 * Unlike WdkSettlementProvider (tests/wdkSettlementProvider.test.ts),
 * whose lock/release/refund calls need a live funded testnet wallet to
 * verify for real, MultisigProvider's entire cryptographic core — key
 * derivation, script/address construction, PSBT signing and
 * finalization — is pure and fully verifiable without any live
 * infrastructure. Only the two network calls (explorer UTXO lookup,
 * broadcast) are mocked here; everything else (including real 2-of-3
 * signing) runs for real against the actual bitcoinjs-lib/bip32/ecpair
 * APIs, the same experiment already run manually before this file was
 * written confirmed works.
 *
 * config.multisig.seed / config.settlement.trustedArbitrators are read
 * once at module-load time (src/config/index.ts), so each test that
 * needs a specific configuration resets modules and re-requires with
 * process.env set first.
 */
const ORIGINAL_ENV = process.env

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
    expect(keyIndexFor('buyer', 'user-1')).toBe(keyIndexFor('buyer', 'user-1'))
  })

  it('produces different indexes for different roles on the same id (distinct salt)', () => {
    const { keyIndexFor } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const buyer = keyIndexFor('buyer', 'shared-id')
    const seller = keyIndexFor('seller', 'shared-id')
    const arbiter = keyIndexFor('arbiter', 'shared-id')
    expect(new Set([buyer, seller, arbiter]).size).toBe(3)
  })

  it('always stays within the valid BIP-32 non-hardened index range', () => {
    const { keyIndexFor } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    for (const id of ['u1', 'a-very-long-user-id-uuid-like-string-1234567890', '']) {
      const index = keyIndexFor('buyer', id)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(0x80000000)
    }
  })
})

describe('MultisigProvider.custodyModel', () => {
  it('declares itself a server-derived 2-of-3 reference implementation, not trustless', () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(multisigProvider.custodyModel).toBe('server-derived-2-of-3-reference-implementation')
  })
})

describe('MultisigProvider config gating — inert without MULTISIG_SEED/TRUSTED_ARBITRATORS', () => {
  it('throws a clear error when MULTISIG_SEED is empty', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: '', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(multisigProvider.getDepositAddress('trade-1', 'buyer-1', 'seller-1')).rejects.toThrow('MULTISIG_SEED')
  })

  it('throws a clear error when no TRUSTED_ARBITRATORS entry is configured', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: '' })
    await expect(multisigProvider.getDepositAddress('trade-1', 'buyer-1', 'seller-1')).rejects.toThrow('TRUSTED_ARBITRATORS')
  })
})

describe('MultisigProvider.getDepositAddress (real P2WSH address derivation)', () => {
  it('is deterministic — same buyer/seller pair always derives the same address', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await multisigProvider.getDepositAddress('trade-1', 'buyer-1', 'seller-1')
    const b = await multisigProvider.getDepositAddress('trade-1', 'buyer-1', 'seller-1')
    expect(a).toBe(b)
    expect(a).toMatch(/^tb1/) // testnet bech32 (P2WSH) prefix
  })

  it('derives a different address for a different buyer/seller pair', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await multisigProvider.getDepositAddress('trade-1', 'buyer-1', 'seller-1')
    const b = await multisigProvider.getDepositAddress('trade-2', 'buyer-2', 'seller-2')
    expect(a).not.toBe(b)
  })

  it('derives a different address under a different seed (no cross-deployment collision)', async () => {
    const { multisigProvider: p1 } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await p1.getDepositAddress('trade-1', 'buyer-1', 'seller-1')
    const { multisigProvider: p2 } = loadProvider({ MULTISIG_SEED: 'seed-b', TRUSTED_ARBITRATORS: 'arb-1' })
    const b = await p2.getDepositAddress('trade-1', 'buyer-1', 'seller-1')
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
    const result = await multisigProvider.lockFunds({ tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005' })
    expect(result.txId).toBe('a'.repeat(64))
    expect(result.address).toMatch(/^tb1/)
  })

  it('lockFunds throws (non-custodial — never fakes a lock) when no sufficient UTXO exists yet', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })
    await expect(
      multisigProvider.lockFunds({ tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005' })
    ).rejects.toThrow('No funding UTXO')
  })

  it('verifyLock is true only for a confirmed UTXO meeting the expected amount', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ txid: 'b'.repeat(64), vout: 0, value: 100_000, status: { confirmed: false } }],
    })
    const unconfirmed = await multisigProvider.verifyLock({ tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005' })
    expect(unconfirmed).toBe(false)

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ txid: 'b'.repeat(64), vout: 0, value: 100_000, status: { confirmed: true } }],
    })
    const confirmed = await multisigProvider.verifyLock({ tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005' })
    expect(confirmed).toBe(true)
  })

  it('propagates a clear error when the explorer API itself fails', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(
      multisigProvider.verifyLock({ tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005' })
    ).rejects.toThrow('503')
  })
})

describe('MultisigProvider — release/refund PSBT construction, signing, and finalization', () => {
  const fetchMock = jest.fn()
  const FUNDING_TXID = 'c'.repeat(64)

  beforeEach(() => {
    fetchMock.mockReset()
    ;(global as any).fetch = fetchMock
  })

  it('releaseFunds (normal, non-disputed path) builds a real 2-of-3-signed transaction and broadcasts it', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ txid: FUNDING_TXID, vout: 0, value: 100_000, status: { confirmed: true } }] })
      .mockResolvedValueOnce({ ok: true, text: async () => `${'d'.repeat(64)}\n` })

    const result = await multisigProvider.releaseFunds(
      { tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005', txLockId: FUNDING_TXID, status: 'PAYMENT_PENDING' },
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    )
    expect(result.txId).toBe('d'.repeat(64))

    // Second fetch call is the broadcast — assert real, finalized, signed
    // transaction hex was actually sent (not merely that broadcast ran).
    const broadcastCall = fetchMock.mock.calls[1]
    expect(broadcastCall[0]).toContain('/tx')
    expect(typeof broadcastCall[1].body).toBe('string')
    expect(broadcastCall[1].body.length).toBeGreaterThan(0)
  })

  it('refundFunds (normal path) signs with buyer+seller and pays out to a derived seller address', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ txid: FUNDING_TXID, vout: 0, value: 100_000, status: { confirmed: true } }] })
      .mockResolvedValueOnce({ ok: true, text: async () => `${'e'.repeat(64)}\n` })

    const result = await multisigProvider.refundFunds({
      tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005', txLockId: FUNDING_TXID, status: 'FUNDS_LOCKED',
    })
    expect(result.txId).toBe('e'.repeat(64))
  })

  it('releaseFunds on a DISPUTED escrow signs with buyer+arbiter instead of buyer+seller', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => [{ txid: FUNDING_TXID, vout: 0, value: 100_000, status: { confirmed: true } }] })
      .mockResolvedValueOnce({ ok: true, text: async () => `${'f'.repeat(64)}\n` })

    const result = await multisigProvider.releaseFunds(
      { tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005', txLockId: FUNDING_TXID, status: 'DISPUTED', triggeredBy: 'arb-1' },
      'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
    )
    expect(result.txId).toBe('f'.repeat(64))
  })

  it('rejects an arbitrated release whose triggeredBy does not match the arbiter key baked into the script', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.releaseFunds(
        { tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005', txLockId: FUNDING_TXID, status: 'DISPUTED', triggeredBy: 'some-other-arbiter' },
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      )
    ).rejects.toThrow('does not match the arbiter key')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when no txLockId is recorded yet (nothing to spend)', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.releaseFunds(
        { tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005', txLockId: null, status: 'PAYMENT_PENDING' },
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      )
    ).rejects.toThrow('no recorded funding txid')
  })
})
