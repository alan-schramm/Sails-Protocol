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
    expect(a.address).toBe(b.address)
    expect(a.address).toMatch(/^tb1/) // testnet bech32 (P2WSH) prefix
  })

  it('derives a different address for a different buyer/seller pubkey pair', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    const b = await multisigProvider.getDepositAddress('trade-2', BUYER2_PUBKEY, SELLER2_PUBKEY)
    expect(a.address).not.toBe(b.address)
  })

  it('derives a different address under a different arbiter seed (same buyer/seller pubkeys)', async () => {
    const { multisigProvider: p1 } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const a = await p1.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    const { multisigProvider: p2 } = loadProvider({ MULTISIG_SEED: 'seed-b', TRUSTED_ARBITRATORS: 'arb-1' })
    const b = await p2.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    expect(a.address).not.toBe(b.address)
  })

  // Missão 11 Fase 5.2 §2/§5 — the return now also carries the arbiter
  // commitment (arbiterPubkeyHex/arbiterId) that escrow.service.ts
  // persists as this escrow's immutable cryptographic record.
  it('also returns the arbiterPubkeyHex/arbiterId used to build the script — the exact value that gets persisted', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { arbiterPubkeyHex, arbiterId } = await multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)
    expect(arbiterId).toBe('arb-1')
    expect(arbiterPubkeyHex).toBe(multisigProvider.getArbiterPubkeyHex('arb-1'))
  })

  // §5 — the persisted key must be byte-for-byte the same key actually
  // embedded in the script: reconstruct the P2WSH address from the three
  // raw pubkeys (buyer, seller, and the RETURNED arbiterPubkeyHex) exactly
  // the way a remote wallet would, and confirm it equals what
  // getDepositAddress() itself returned as the deposit address.
  it('the returned arbiterPubkeyHex, combined with buyer/seller pubkeys, reconstructs the SAME address getDepositAddress() returned', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { address, arbiterPubkeyHex } = await multisigProvider.getDepositAddress('trade-1', BUYER_PUBKEY, SELLER_PUBKEY)

    const bitcoin = require('bitcoinjs-lib')
    const ecc = require('tiny-secp256k1')
    bitcoin.initEccLib(ecc)
    const pubkeys = [BUYER_PUBKEY, SELLER_PUBKEY, arbiterPubkeyHex].map((hex) => Buffer.from(hex, 'hex')).sort(Buffer.compare)
    const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network: bitcoin.networks.testnet })
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network: bitcoin.networks.testnet })
    expect(p2wsh.address).toBe(address)
  })
})

// Missão 11 Fase 5.2 §6/§9 — server-side historical-stability proof: once
// an escrow's arbiterPubkey is persisted (simulating what escrow.service.ts
// does at getDepositAddress() time), does a LATER live-config change
// (TRUSTED_ARBITRATORS reordered/replaced, or MULTISIG_SEED rotated) get
// silently trusted, or does the escrow's own persisted commitment win and
// fail the operation closed? A legacy escrow (no persisted commitment) is
// exercised the same way for direct comparison — it must behave exactly as
// it always has (oblivious to any of this), proving the compatibility path
// is untouched.
describe('MultisigProvider — Missão 11 Fase 5.2 arbiter-commitment drift detection (assertArbiterMatchesScript)', () => {
  const ecc = require('tiny-secp256k1')
  const bitcoin = require('bitcoinjs-lib')
  const { ECPairFactory } = require('ecpair')
  const crypto = require('crypto')
  bitcoin.initEccLib(ecc)
  const ECPair = ECPairFactory(ecc)
  const network = bitcoin.networks.testnet
  const buyerKey = ECPair.fromPrivateKey(crypto.createHash('sha256').update('fase52-buyer').digest(), { network })
  const sellerKey = ECPair.fromPrivateKey(crypto.createHash('sha256').update('fase52-seller').digest(), { network })
  const buyerPubkeyHex = Buffer.from(buyerKey.publicKey).toString('hex')
  const sellerPubkeyHex = Buffer.from(sellerKey.publicKey).toString('hex')
  const REFUND_ADDRESS_UNUSED = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

  it('no drift: a persisted commitment matching the current live arbiter allows a disputed release to proceed', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { arbiterPubkeyHex } = await multisigProvider.getDepositAddress('trade-1', buyerPubkeyHex, sellerPubkeyHex)

    const fetchMock = jest.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ txid: 'aa'.repeat(32), vout: 0, value: 100_000, status: { confirmed: true } }] })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ halfHourFee: 5 }) })
    ;(global as any).fetch = fetchMock

    const { requiredSigners } = await multisigProvider.buildUnsignedRelease(
      { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, arbiterPubkey: arbiterPubkeyHex, lockedAmount: '0.001', txLockId: 'aa'.repeat(32), status: 'DISPUTED', triggeredBy: 'arb-1' },
      REFUND_ADDRESS_UNUSED
    )
    expect(requiredSigners).toEqual(['buyer-1'])
  })

  it('TRUSTED_ARBITRATORS changed after creation (same seed): the persisted commitment no longer matches the new live arbiter — fails closed, never silently trusts today\'s config', async () => {
    const { multisigProvider: creationTimeProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { arbiterPubkeyHex: persistedCommitment } = await creationTimeProvider.getDepositAddress('trade-1', buyerPubkeyHex, sellerPubkeyHex)

    // Config drift: arb-1 -> arb-2, same seed. A real deployment would
    // reach this new provider instance on the next request/process.
    const { multisigProvider: driftedProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-2' })

    await expect(
      driftedProvider.buildUnsignedRelease(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, arbiterPubkey: persistedCommitment, lockedAmount: '0.001', txLockId: 'bb'.repeat(32), status: 'DISPUTED', triggeredBy: 'arb-2' },
        REFUND_ADDRESS_UNUSED
      )
    ).rejects.toThrow('does not match the arbiter public key committed')
  })

  it('MULTISIG_SEED rotated after creation (same arbiter id): the persisted commitment no longer matches the new live key — fails closed', async () => {
    const { multisigProvider: creationTimeProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { arbiterPubkeyHex: persistedCommitment } = await creationTimeProvider.getDepositAddress('trade-1', buyerPubkeyHex, sellerPubkeyHex)

    // Config drift: the master seed itself rotated, same arbiter identity.
    const { multisigProvider: driftedProvider } = loadProvider({ MULTISIG_SEED: 'seed-ROTATED', TRUSTED_ARBITRATORS: 'arb-1' })

    await expect(
      driftedProvider.buildUnsignedRefund(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, arbiterPubkey: persistedCommitment, lockedAmount: '0.001', txLockId: 'cc'.repeat(32), status: 'DISPUTED', triggeredBy: 'arb-1' }
      )
    ).rejects.toThrow('does not match the arbiter public key committed')
  })

  it('legacy escrow (no persisted arbiterPubkey) is completely unaffected by the same config drift — compatibility path preserved byte-for-byte', async () => {
    // Same drift as the TRUSTED_ARBITRATORS test above, but this escrow
    // fixture has no arbiterPubkey field at all (exactly what every
    // pre-Fase-5.2 escrow looks like) — the new check never fires, and the
    // pre-existing identity-string check (triggeredBy === defaultArbiterId())
    // is satisfied since triggeredBy correctly names TODAY's single arbiter.
    const { multisigProvider: driftedProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-2' })
    const fetchMock = jest.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ txid: 'dd'.repeat(32), vout: 0, value: 100_000, status: { confirmed: true } }] })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ halfHourFee: 5 }) })
    ;(global as any).fetch = fetchMock

    const { requiredSigners } = await driftedProvider.buildUnsignedRelease(
      { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, lockedAmount: '0.001', txLockId: 'dd'.repeat(32), status: 'DISPUTED', triggeredBy: 'arb-2' },
      REFUND_ADDRESS_UNUSED
    )
    expect(requiredSigners).toEqual(['buyer-1'])
  })

  // Missão 11 Fase 7.3.1 §B — real P0 fix proof: triggeredBy is now
  // checked cryptographically against the PERSISTED commitment, never
  // against live config's defaultArbiterId(). Before this fix, this exact
  // scenario incorrectly THREW (triggeredBy 'arb-1' !== live scriptArbiter
  // 'arb-2') even though 'arb-1' is the only identity that can ever
  // validly sign this specific escrow's script — a real dispute stuck
  // forever the moment an operator ever rotated TRUSTED_ARBITRATORS.
  it('config rotation cannot rewrite historical authority: the ORIGINAL committed arbiter can still execute a ruling after TRUSTED_ARBITRATORS rotates away from them', async () => {
    const { multisigProvider: creationTimeProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { arbiterPubkeyHex: persistedCommitment } = await creationTimeProvider.getDepositAddress('trade-1', buyerPubkeyHex, sellerPubkeyHex)

    // dispute.service.ts's raiseDispute()/appeal() (Fase 7.3.1 §B) always
    // assign the escrow's own persisted committed identity as arbiterId —
    // never assign()'s independent, live-config-driven pick — so
    // triggeredBy here is still 'arb-1' even though the deployment's
    // TRUSTED_ARBITRATORS has since rotated to a different arbiter.
    const { multisigProvider: driftedProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-2' })

    const fetchMock = jest.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ txid: 'ee'.repeat(32), vout: 0, value: 100_000, status: { confirmed: true } }] })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ halfHourFee: 5 }) })
    ;(global as any).fetch = fetchMock

    const { requiredSigners } = await driftedProvider.buildUnsignedRelease(
      { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, arbiterPubkey: persistedCommitment, lockedAmount: '0.001', txLockId: 'ee'.repeat(32), status: 'DISPUTED', triggeredBy: 'arb-1' },
      REFUND_ADDRESS_UNUSED
    )
    expect(requiredSigners).toEqual(['buyer-1'])
  })

  // Missão 11 Fase 7.3.1 §B — defense in depth: even a genuinely
  // configured, "authorized" trusted arbiter (present in
  // TRUSTED_ARBITRATORS) is still rejected if it isn't the SPECIFIC
  // identity actually baked into this escrow's script — proves a
  // multi-arbiter trusted-list configuration can never produce an
  // unexecutable ruling that reaches this far (dispute.service.ts's own
  // Fase 7.3.1 §B fix should never let this be reached in practice; this
  // is the structural backstop for a caller that bypasses it).
  it('multi-arbiter configuration cannot create an unexecutable ruling: a real but non-committed trusted arbiter is still rejected', async () => {
    const { multisigProvider: creationTimeProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1,arb-2' })
    const { arbiterPubkeyHex: persistedCommitment } = await creationTimeProvider.getDepositAddress('trade-1', buyerPubkeyHex, sellerPubkeyHex)

    await expect(
      creationTimeProvider.buildUnsignedRefund(
        { tradeId: 't1', buyerId: 'buyer-1', sellerId: 'seller-1', buyerPubkey: buyerPubkeyHex, sellerPubkey: sellerPubkeyHex, arbiterPubkey: persistedCommitment, lockedAmount: '0.001', txLockId: 'ff'.repeat(32), status: 'DISPUTED', triggeredBy: 'arb-2' }
      )
    ).rejects.toThrow('does not match the arbiter public key committed')
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
    // Missão 11 Fase 8.1 LB-02 — lockFunds() now re-verifies confirmation
    // DEPTH (not just the listing's own confirmed boolean) via two more
    // real explorer calls: fetchTransactionConfirmationStatus (this
    // UTXO's own block height) then fetchChainTipHeight. required
    // defaults to 1 here (MULTISIG_NETWORK unset -> testnet), so a single
    // confirmation (tip == block height) is exactly sufficient.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ confirmed: true, block_height: 100 }) })
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '100' })
    const result = await multisigProvider.lockFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005' })
    expect(result.txId).toBe('a'.repeat(64))
    expect(result.address).toMatch(/^tb1/)
  })

  it('lockFunds throws when the funding UTXO exists but has not yet reached the required confirmation depth', async () => {
    const { multisigProvider } = loadProvider({ MULTISIG_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1', MULTISIG_FUNDING_REQUIRED_CONFIRMATIONS: '3' })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ txid: 'a'.repeat(64), vout: 0, value: 100_000, status: { confirmed: true } }],
    })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ confirmed: true, block_height: 100 }) })
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '101' }) // only 2 confirmations, 3 required
    await expect(
      multisigProvider.lockFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005' })
    ).rejects.toThrow(/has 2 of the required 3 confirmation/)
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
    // Missão 11 Fase 8.1 LB-02 — verifyLock() now also re-verifies real
    // confirmation depth once the listing itself reports confirmed:true
    // (same two extra explorer calls as lockFunds() above).
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ confirmed: true, block_height: 200 }) })
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '200' })
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
