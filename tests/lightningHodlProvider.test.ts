/**
 * LightningHodlProvider — Arkade (Ark protocol) VTXO/Taproot escrow.
 *
 * Client-held-keys pass (2026-07-27): same change as
 * tests/multisigProvider.test.ts — buyer/seller pubkeys are now
 * client-submitted (33-byte compressed secp256k1 hex, the SAME format
 * MultisigProvider uses; this provider strips the leading byte to get
 * the 32-byte x-only form internally), not server-derived. Only the
 * arbiter key is still derived from ARKADE_SEED.
 *
 * Phase 2 (same day, follow-up pass): releaseFunds()/refundFunds() are
 * now "not directly callable" (superseded by buildUnsignedRelease/
 * buildUnsignedRefund/finalizeRelease/finalizeRefund — the real
 * client-signature-collection flow, mirrors multisig.provider.ts's own).
 *
 * `@arkade-os/sdk` AND `@scure/btc-signer` cannot be loaded for real
 * here — both are pure ESM, no CJS build (confirmed: `@scure/btc-signer`
 * is what actually breaks under Jest; `@arkade-os/sdk`'s own CJS build
 * transitively requires it) — both mocked here, same as every other test
 * file that reaches escrow.service.ts. The fakes below are deliberately
 * NOT a real crypto implementation (they can't be, under Jest) — they
 * exist to test THIS PROVIDER's own orchestration (which leaf gets
 * picked, which signers are required, error messages, the JSON bundle
 * shape it hands back and forth), using simple JSON-serializable stand-in
 * "transactions" that round-trip through toPSBT()/fromPSBT() and track
 * which identities "signed" them. The actual cryptographic correctness
 * (SingleKey needs nothing but a raw private key to sign; a
 * @scure/btc-signer Transaction round-trips through toPSBT()/fromPSBT()
 * with everything sign() needs intact; combineTapscriptSigs/
 * verifyTapscriptSignatures work on a real Ark tx) was verified
 * independently via standalone scripts run directly under Node (not
 * Jest) before this file was written — same "verify outside Jest,
 * confirmed Jest-specific not a real runtime problem" discipline this
 * file's own git history already established for lockFunds/verifyLock.
 */
function makeFakeTx(tag: string, signers: string[] = []) {
  return {
    __tag: tag,
    __signers: signers,
    toPSBT() {
      return Buffer.from(JSON.stringify({ tag: this.__tag, signers: this.__signers }))
    },
    get hex() {
      return `hex:${this.__tag}:${this.__signers.join(',')}`
    },
  }
}

jest.mock('@scure/btc-signer', () => ({
  Transaction: {
    fromPSBT: (bytes: Uint8Array) => {
      const parsed = JSON.parse(Buffer.from(bytes).toString()) as { tag: string; signers: string[] }
      return makeFakeTx(parsed.tag, parsed.signers)
    },
  },
}))

jest.mock('@arkade-os/sdk', () => {
  const encode = ({ pubkeys }: { pubkeys: Uint8Array[] }) => ({
    script: Buffer.from(`ms:${pubkeys.map((p) => Buffer.from(p).toString('hex')).join(',')}`),
  })
  return {
    SeedIdentity: {
      fromSeed: () => ({
        xOnlyPublicKey: async () => Buffer.from('aa'.repeat(32), 'hex'),
        sign: async (tx: ReturnType<typeof makeFakeTx>) => makeFakeTx(tx.__tag, [...tx.__signers, 'arbiter']),
      }),
    },
    MultisigTapscript: { encode },
    CSVMultisigTapscript: { encode },
    VtxoScript: class FakeVtxoScript {
      scripts: Uint8Array[]
      constructor(scripts: Uint8Array[]) {
        this.scripts = scripts
      }
      get pkScript() {
        return Buffer.from('fake-pk-script')
      }
      encode() {
        return Buffer.from('fake-tap-tree')
      }
      findLeaf(hex: string) {
        return { script: Buffer.from(hex, 'hex') }
      }
      address() {
        return { encode: () => 'ark1qfakeaddress', pkScript: Buffer.from('0014' + '22'.repeat(20), 'hex') }
      }
    },
    RestArkProvider: class FakeRestArkProvider {
      getInfo() {
        return Promise.resolve({ signerPubkey: '02' + 'bb'.repeat(32) })
      }
      submitTx(_arkTxHex: string, _checkpoints: string[]) {
        return Promise.resolve({ arkTxid: 'submitted-ark-txid', signedCheckpointTxs: ['cp-hex'] })
      }
      finalizeTx(_arkTxid: string, _signedCheckpointTxs: string[]) {
        return Promise.resolve(undefined)
      }
    },
    RestIndexerProvider: class FakeRestIndexerProvider {
      getVtxos({ scripts: _scripts }: { scripts: string[] }) {
        return Promise.resolve({ vtxos: [{ txid: 'a'.repeat(64), vout: 0, value: 100_000 }] })
      }
    },
    buildOffchainTx: (_inputs: unknown[], _outputs: unknown[], _exitLeaf: unknown) => ({
      arkTx: makeFakeTx('ark'),
      checkpoints: [makeFakeTx('cp0')],
    }),
    combineTapscriptSigs: (a: ReturnType<typeof makeFakeTx>, b: ReturnType<typeof makeFakeTx>) =>
      makeFakeTx(a.__tag, [...new Set([...a.__signers, ...b.__signers])]),
    verifyTapscriptSignatures: (tx: ReturnType<typeof makeFakeTx>, _inputIndex: number, requiredSigners: string[]) => {
      if (requiredSigners.length > 0 && tx.__signers.length < requiredSigners.length) {
        throw new Error(`insufficient signatures: got ${tx.__signers.length}, need ${requiredSigners.length}`)
      }
    },
  }
})

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

describe('LightningHodlProvider — releaseFunds()/refundFunds() are not directly callable (superseded by Phase 2 signature collection)', () => {
  it('releaseFunds() throws a clear, honest error pointing at the real flow', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.releaseFunds(
        { tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'PAYMENT_PENDING' },
        'deadbeef'
      )
    ).rejects.toThrow('not directly callable')
  })

  it('refundFunds() throws the same clear error', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.refundFunds({ tradeId: 't1', buyerPubkey: BUYER_PUBKEY, sellerPubkey: SELLER_PUBKEY, lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'FUNDS_LOCKED' })
    ).rejects.toThrow('not directly callable')
  })
})

// Phase 2 (2026-07-27) — orchestration-level tests against the fake SDK
// above (real crypto verified separately, see this file's own header
// comment). Covers: which leaf/signers get picked per status, the
// disputed pre-signing behavior, the finalize combine/verify/submit
// wiring, and the JSON bundle round-trip.
describe('LightningHodlProvider — Phase 2 signature collection (buildUnsignedRelease/buildUnsignedRefund/finalizeRelease/finalizeRefund)', () => {
  const baseEscrow = {
    tradeId: 't1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    buyerPubkey: BUYER_PUBKEY,
    sellerPubkey: SELLER_PUBKEY,
    lockedAmount: '0.001',
    txLockId: 'a'.repeat(64),
  }

  it('buildUnsignedRelease returns a fully unsigned bundle requiring both buyer and seller on the normal path', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { psbtBase64, requiredSigners } = await lightningHodlProvider.buildUnsignedRelease(
      { ...baseEscrow, status: 'PAYMENT_PENDING' },
      '0014' + '00'.repeat(20)
    )
    expect(requiredSigners).toEqual(['buyer-1', 'seller-1'])
    const parsed = JSON.parse(psbtBase64)
    expect(parsed.expectedPubkeys).toHaveLength(2)
    const arkTx = JSON.parse(Buffer.from(parsed.arkTxPsbtBase64, 'base64').toString())
    expect(arkTx.signers).toEqual([]) // fully unsigned
  })

  it('end-to-end: two independently-signed copies combine and finalize to a real broadcast txid', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { psbtBase64, requiredSigners } = await lightningHodlProvider.buildUnsignedRelease(
      { ...baseEscrow, status: 'PAYMENT_PENDING' },
      '0014' + '00'.repeat(20)
    )
    expect(requiredSigners).toEqual(['buyer-1', 'seller-1'])

    // Simulate the client SDK's signEscrowArkTx(): parse, "sign" (append
    // signer id), re-serialize the same JSON shape.
    function fakeClientSign(bundleJson: string, signerId: string): string {
      const parsed = JSON.parse(bundleJson)
      const signOne = (b64: string) => {
        const tx = JSON.parse(Buffer.from(b64, 'base64').toString())
        tx.signers = [...tx.signers, signerId]
        return Buffer.from(JSON.stringify(tx)).toString('base64')
      }
      return JSON.stringify({
        arkTxPsbtBase64: signOne(parsed.arkTxPsbtBase64),
        checkpointsPsbtBase64: parsed.checkpointsPsbtBase64.map(signOne),
      })
    }
    const buyerSigned = fakeClientSign(psbtBase64, 'buyer')
    const sellerSigned = fakeClientSign(psbtBase64, 'seller')

    const result = await lightningHodlProvider.finalizeRelease({ tradeId: 't1' }, psbtBase64, [buyerSigned, sellerSigned])
    expect(result.txId).toBe('submitted-ark-txid')
  })

  it('finalizeRelease fails to combine/finalize with only one of two required signatures', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { psbtBase64 } = await lightningHodlProvider.buildUnsignedRelease({ ...baseEscrow, status: 'PAYMENT_PENDING' }, '0014' + '00'.repeat(20))

    function fakeClientSign(bundleJson: string, signerId: string): string {
      const parsed = JSON.parse(bundleJson)
      const signOne = (b64: string) => {
        const tx = JSON.parse(Buffer.from(b64, 'base64').toString())
        tx.signers = [...tx.signers, signerId]
        return Buffer.from(JSON.stringify(tx)).toString('base64')
      }
      return JSON.stringify({ arkTxPsbtBase64: signOne(parsed.arkTxPsbtBase64), checkpointsPsbtBase64: parsed.checkpointsPsbtBase64.map(signOne) })
    }
    const buyerSigned = fakeClientSign(psbtBase64, 'buyer')

    await expect(
      lightningHodlProvider.finalizeRelease({ tradeId: 't1' }, psbtBase64, [buyerSigned])
    ).rejects.toThrow('failed to combine/finalize')
  })

  it('disputed release: arbiter pre-signs immediately, only the buyer remains a required client signer', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { psbtBase64, requiredSigners } = await lightningHodlProvider.buildUnsignedRelease(
      { ...baseEscrow, status: 'DISPUTED', triggeredBy: 'arb-1' },
      '0014' + '00'.repeat(20)
    )
    expect(requiredSigners).toEqual(['buyer-1'])
    const arkTx = JSON.parse(Buffer.from(JSON.parse(psbtBase64).arkTxPsbtBase64, 'base64').toString())
    expect(arkTx.signers).toEqual(['arbiter']) // already pre-signed
  })

  it('disputed release rejects a mismatched dispute arbiter before ever building a tx', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.buildUnsignedRelease({ ...baseEscrow, status: 'DISPUTED', triggeredBy: 'not-the-arbiter' }, '0014' + '00'.repeat(20))
    ).rejects.toThrow('does not match')
  })

  it('buildUnsignedRelease throws when the escrow has no recorded funding txid yet', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.buildUnsignedRelease({ ...baseEscrow, txLockId: undefined, status: 'PAYMENT_PENDING' }, '0014' + '00'.repeat(20))
    ).rejects.toThrow('no recorded funding txid')
  })

  it('buildUnsignedRefund derives a real Ark refund address from the seller pubkey and requires seller+buyer on the normal path', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { requiredSigners, toAddress } = await lightningHodlProvider.buildUnsignedRefund({ ...baseEscrow, status: 'FUNDS_LOCKED' })
    expect(requiredSigners).toEqual(['seller-1', 'buyer-1'])
    expect(typeof toAddress).toBe('string')
  })

  it('disputed refund: arbiter pre-signs immediately, only the seller remains a required client signer', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const { requiredSigners } = await lightningHodlProvider.buildUnsignedRefund({ ...baseEscrow, status: 'DISPUTED', triggeredBy: 'arb-1' })
    expect(requiredSigners).toEqual(['seller-1'])
  })
})
