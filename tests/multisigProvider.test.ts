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

describe('MultisigProvider — releaseFunds()/refundFunds() are not directly callable (superseded by Phase 2 signature collection)', () => {
  it('releaseFunds() throws a clear, honest error pointing at the real flow', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.releaseFunds(
        { tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'PAYMENT_PENDING' },
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      )
    ).rejects.toThrow('not directly callable')
  })

  it('refundFunds() throws the same clear error', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.refundFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'FUNDS_LOCKED' })
    ).rejects.toThrow('not directly callable')
  })
})

// Phase 2 (2026-07-27) — real signature-collection flow: buildUnsignedRelease/
// buildUnsignedRefund build a real PSBT against a mocked explorer UTXO;
// finalizeRelease/finalizeRefund combine real independently-signed copies
// and broadcast. Needs actual private keys (not just the pubkey fixtures
// above) to produce real signatures — a separate deterministic keypair
// derived directly via tiny-secp256k1/ecpair (already real deps at the
// repo root, same libraries multisig.provider.ts itself uses), mirroring
// the psbt-combine-experiment.js verification done before this file was
// written.
describe('MultisigProvider — Phase 2 signature collection (buildUnsignedRelease/buildUnsignedRefund/finalizeRelease/finalizeRefund)', () => {
  const ecc = require('tiny-secp256k1')
  const bitcoin = require('bitcoinjs-lib')
  const { ECPairFactory } = require('ecpair')
  const crypto = require('crypto')
  bitcoin.initEccLib(ecc)
  const ECPair = ECPairFactory(ecc)
  const network = bitcoin.networks.testnet

  const buyerKey = ECPair.fromPrivateKey(crypto.createHash('sha256').update('phase2-buyer').digest(), { network })
  const sellerKey = ECPair.fromPrivateKey(crypto.createHash('sha256').update('phase2-seller').digest(), { network })
  const buyerPubkeyHex = Buffer.from(buyerKey.publicKey).toString('hex')
  const sellerPubkeyHex = Buffer.from(sellerKey.publicKey).toString('hex')
  const REFUND_ADDRESS_UNUSED = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    ;(global as any).fetch = fetchMock
  })

  // Real fee estimation (2026-08-02) — every buildUnsigned*() call now
  // does two fetches, in order: the UTXO lookup, then the real
  // mempool.space fee-rate lookup (multisig.provider.ts's own
  // fetchFeeRateSatsPerVByte()). Default rate (10 sat/vB) is a plausible
  // real-world value that doesn't matter for tests that don't assert
  // exact output amounts; pass an explicit rate for those that do.
  function mockUtxoFetch(txid: string, value: number, feeRateSatsPerVByte = 10) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ txid, vout: 0, value, status: { confirmed: true } }],
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ halfHourFee: feeRateSatsPerVByte }),
    })
  }

  // Real fee estimation (2026-08-02) — closes this provider's own former
  // "a real deployment would query the explorer's fee-estimate endpoint"
  // placeholder now that a real deployment is exactly what's happening.
  describe('real fee estimation (mempool.space /v1/fees/recommended)', () => {
    it('uses the real fee rate to compute a non-flat fee — a higher rate produces a smaller spendable value from the same UTXO', async () => {
      const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })

      const txidLow = 'b1'.repeat(32)
      mockUtxoFetch(txidLow, 100_000, 2)
      const lowRate = await multisigProvider.buildUnsignedRelease(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txidLow, status: 'PAYMENT_PENDING' },
        REFUND_ADDRESS_UNUSED
      )
      const txidHigh = 'b2'.repeat(32)
      mockUtxoFetch(txidHigh, 100_000, 50)
      const highRate = await multisigProvider.buildUnsignedRelease(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txidHigh, status: 'PAYMENT_PENDING' },
        REFUND_ADDRESS_UNUSED
      )

      const outputValue = (psbtBase64: string) => bitcoin.Psbt.fromBase64(psbtBase64, { network }).txOutputs[0].value
      expect(outputValue(highRate.psbtBase64)).toBeLessThan(outputValue(lowRate.psbtBase64))
    })

    it('throws a clear error rather than guessing a fee when the fee-estimate endpoint is unreachable', async () => {
      const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
      const txid = 'c1'.repeat(32)
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ txid, vout: 0, value: 100_000, status: { confirmed: true } }] })
      fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'))

      await expect(
        multisigProvider.buildUnsignedRelease(
          { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'PAYMENT_PENDING' },
          REFUND_ADDRESS_UNUSED
        )
      ).rejects.toThrow(/refusing to guess a fee/)
    })

    it('throws a clear error rather than guessing a fee when the endpoint returns no usable rate', async () => {
      const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
      const txid = 'c2'.repeat(32)
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ txid, vout: 0, value: 100_000, status: { confirmed: true } }] })
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      await expect(
        multisigProvider.buildUnsignedRelease(
          { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'PAYMENT_PENDING' },
          REFUND_ADDRESS_UNUSED
        )
      ).rejects.toThrow(/no usable rate/)
    })
  })

  it('buildUnsignedRelease returns a fully unsigned PSBT requiring both buyer and seller on the normal path', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const txid = 'd'.repeat(64)
    mockUtxoFetch(txid, 100_000)
    const { psbtBase64, requiredSigners } = await multisigProvider.buildUnsignedRelease(
      { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'PAYMENT_PENDING' },
      REFUND_ADDRESS_UNUSED
    )
    expect(requiredSigners).toEqual(['buyer-1', 'seller-1'])
    expect(typeof psbtBase64).toBe('string')
    // Fully unsigned — neither party's signature is embedded yet.
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    expect(() => psbt.finalizeAllInputs()).toThrow()
  })

  it('end-to-end: two independently-signed copies combine and finalize to a real broadcast txid', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const txid = 'e'.repeat(64)
    mockUtxoFetch(txid, 100_000)
    const { psbtBase64, requiredSigners } = await multisigProvider.buildUnsignedRelease(
      { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'PAYMENT_PENDING' },
      REFUND_ADDRESS_UNUSED
    )
    expect(requiredSigners).toEqual(['buyer-1', 'seller-1'])

    // Buyer and seller each independently load the SAME unsigned PSBT and
    // sign their own copy, without seeing the other's signature.
    const buyerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    buyerCopy.signInput(0, buyerKey)
    const sellerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    sellerCopy.signInput(0, sellerKey)

    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => 'f'.repeat(64) })
    const result = await multisigProvider.finalizeRelease({ tradeId: 't1' }, psbtBase64, [buyerCopy.toBase64(), sellerCopy.toBase64()])
    expect(result.txId).toBe('f'.repeat(64))
  })

  it('finalizeRelease fails to combine/finalize with only one of two required signatures', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const txid = '1'.repeat(64)
    mockUtxoFetch(txid, 100_000)
    const { psbtBase64 } = await multisigProvider.buildUnsignedRelease(
      { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'PAYMENT_PENDING' },
      REFUND_ADDRESS_UNUSED
    )
    const buyerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    buyerCopy.signInput(0, buyerKey)

    await expect(
      multisigProvider.finalizeRelease({ tradeId: 't1' }, psbtBase64, [buyerCopy.toBase64()])
    ).rejects.toThrow('failed to combine/finalize')
  })

  it('disputed release: arbiter pre-signs immediately, only the buyer remains a required client signer', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const txid = '2'.repeat(64)
    mockUtxoFetch(txid, 100_000)
    const { psbtBase64, requiredSigners } = await multisigProvider.buildUnsignedRelease(
      { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'DISPUTED', triggeredBy: 'arb-1' },
      REFUND_ADDRESS_UNUSED
    )
    expect(requiredSigners).toEqual(['buyer-1'])

    // The returned "unsigned" PSBT already carries the arbiter's own
    // signature — only the buyer needs to add theirs.
    const buyerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    buyerCopy.signInput(0, buyerKey)

    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '3'.repeat(64) })
    const result = await multisigProvider.finalizeRelease({ tradeId: 't1' }, psbtBase64, [buyerCopy.toBase64()])
    expect(result.txId).toBe('3'.repeat(64))
  })

  it('disputed release rejects a mismatched dispute arbiter before ever building a PSBT', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.buildUnsignedRelease(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: 'x'.repeat(64), status: 'DISPUTED', triggeredBy: 'not-the-arbiter' },
        REFUND_ADDRESS_UNUSED
      )
    ).rejects.toThrow('does not match')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('buildUnsignedRelease throws when the escrow has no recorded funding txid yet', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      multisigProvider.buildUnsignedRelease(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', status: 'PAYMENT_PENDING' },
        REFUND_ADDRESS_UNUSED
      )
    ).rejects.toThrow('no recorded funding txid')
  })

  it('buildUnsignedRefund derives a real P2WPKH refund address from the seller pubkey and requires seller+buyer on the normal path', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const txid = '4'.repeat(64)
    mockUtxoFetch(txid, 100_000)
    const { psbtBase64, requiredSigners, toAddress } = await multisigProvider.buildUnsignedRefund({
      tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'FUNDS_LOCKED',
    })
    expect(toAddress).toMatch(/^tb1/)
    expect(requiredSigners).toEqual(['seller-1', 'buyer-1'])
    expect(typeof psbtBase64).toBe('string')
  })

  it('end-to-end refund: two independently-signed copies combine and finalize', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const txid = '5'.repeat(64)
    mockUtxoFetch(txid, 100_000)
    const { psbtBase64, requiredSigners } = await multisigProvider.buildUnsignedRefund({
      tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'FUNDS_LOCKED',
    })
    expect(requiredSigners).toEqual(['seller-1', 'buyer-1'])

    const sellerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    sellerCopy.signInput(0, sellerKey)
    const buyerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    buyerCopy.signInput(0, buyerKey)

    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '6'.repeat(64) })
    const result = await multisigProvider.finalizeRefund({ tradeId: 't1' }, psbtBase64, [sellerCopy.toBase64(), buyerCopy.toBase64()])
    expect(result.txId).toBe('6'.repeat(64))
  })

  it('disputed refund: arbiter pre-signs immediately, only the seller remains a required client signer', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const txid = '7'.repeat(64)
    mockUtxoFetch(txid, 100_000)
    const { psbtBase64, requiredSigners } = await multisigProvider.buildUnsignedRefund({
      tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'DISPUTED', triggeredBy: 'arb-1',
    })
    expect(requiredSigners).toEqual(['seller-1'])

    const sellerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
    sellerCopy.signInput(0, sellerKey)

    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '8'.repeat(64) })
    const result = await multisigProvider.finalizeRefund({ tradeId: 't1' }, psbtBase64, [sellerCopy.toBase64()])
    expect(result.txId).toBe('8'.repeat(64))
  })

  // RFC-021 D9 (2026-08-02) — real 2-output PSBT construction. Always the
  // disputed shape (SPLIT is only ever reached via a dispute ruling) — the
  // arbiter pre-signs, and only ONE more required signer (the buyer, by
  // convention — mirrors buildUnsignedRelease()'s own arbiter+buyer
  // disputed pairing). Real constraint found writing these tests, not a
  // design choice: this is still a 2-of-3 script, so a third independent
  // signature (e.g. also collecting the seller's) would exceed the
  // threshold and fail to finalize ("Too many signatures") — see
  // multisig.provider.ts's buildUnsignedSplit() own comment.
  describe('buildUnsignedSplit/finalizeSplit', () => {
    it('builds a 2-output PSBT — buyer/seller shares sum exactly to the fee-adjusted UTXO value, split per buyerBps', async () => {
      const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
      const txid = '9'.repeat(64)
      // 1 sat/vB keeps the expected fee a clean, exact number: 11 + 110 +
      // 43*2 (2 outputs) = 207 vBytes * 1 = 207 sats — matches multisig.
      // provider.ts's own estimateFeeSats() formula exactly.
      mockUtxoFetch(txid, 100_000, 1)
      const { psbtBase64, requiredSigners } = await multisigProvider.buildUnsignedSplit(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'DISPUTED', triggeredBy: 'arb-1' },
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        bitcoin.payments.p2wpkh({ pubkey: sellerKey.publicKey, network }).address,
        6000
      )
      expect(requiredSigners).toEqual(['buyer-1'])

      const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network })
      const spendableValue = 100_000 - 207 // fee-adjusted, real estimateFeeSats(1, 2)
      expect(psbt.txOutputs).toHaveLength(2)
      expect(psbt.txOutputs[0].value).toBe(BigInt(Math.floor(spendableValue * 0.6)))
      expect(psbt.txOutputs[1].value).toBe(BigInt(spendableValue) - psbt.txOutputs[0].value)
      expect(psbt.txOutputs[0].value + psbt.txOutputs[1].value).toBe(BigInt(spendableValue))

      // Already pre-signed by the arbiter — the buyer's signature alone
      // (2 of 3 total) is enough to finalize.
      const buyerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
      buyerCopy.signInput(0, buyerKey)
      expect(() => buyerCopy.finalizeAllInputs()).not.toThrow()
    })

    it('end-to-end: the buyer signature combines with the arbiter pre-signature and broadcasts to a real txid', async () => {
      const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
      const txid = 'aa'.repeat(32)
      mockUtxoFetch(txid, 100_000)
      const { psbtBase64, requiredSigners } = await multisigProvider.buildUnsignedSplit(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'DISPUTED', triggeredBy: 'arb-1' },
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        bitcoin.payments.p2wpkh({ pubkey: sellerKey.publicKey, network }).address,
        3000
      )
      expect(requiredSigners).toEqual(['buyer-1'])

      const buyerCopy = bitcoin.Psbt.fromBase64(psbtBase64, { network })
      buyerCopy.signInput(0, buyerKey)

      fetchMock.mockResolvedValueOnce({ ok: true, text: async () => 'bb'.repeat(32) })
      const result = await multisigProvider.finalizeSplit({ tradeId: 't1' }, psbtBase64, [buyerCopy.toBase64()])
      expect(result.txId).toBe('bb'.repeat(32))
    })

    it('finalizeSplit fails to combine/finalize with only the arbiter pre-signature and no client signature at all', async () => {
      const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
      const txid = 'cc'.repeat(32)
      mockUtxoFetch(txid, 100_000)
      const { psbtBase64 } = await multisigProvider.buildUnsignedSplit(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: txid, status: 'DISPUTED', triggeredBy: 'arb-1' },
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        bitcoin.payments.p2wpkh({ pubkey: sellerKey.publicKey, network }).address,
        5000
      )

      await expect(
        multisigProvider.finalizeSplit({ tradeId: 't1' }, psbtBase64, [])
      ).rejects.toThrow('failed to combine/finalize')
    })
  })
})
