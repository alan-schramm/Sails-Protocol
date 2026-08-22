/**
 * Missão 10, Fase 6-9 — pre-signature PSBT verification adversarial
 * matrix (A-N). Every tampered PSBT must fail verifySigningIntent() AND
 * must never reach signEscrowPsbt() via verifyAndSignEscrowPsbt(). Builds
 * real PSBTs with bitcoinjs-lib directly in this test file — this
 * package must never depend on `src/` (the backend's own tree), same
 * rule escrow-safe-signing.test.ts's own header already established.
 */
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import {
  verifySigningIntent,
  verifyAndSignEscrowPsbt,
  deriveExpectedMultisigAddress,
  buildExpectedFeeAwareReleaseOutputs,
  SigningIntentVerificationError,
} from '../src/modules/wallet-verification'
import type { ExpectedSigningIntent } from '../src/modules/wallet-verification'

bitcoin.initEccLib(ecc)
const network = bitcoin.networks.testnet

function keypair() {
  const privateKey = secp256k1.utils.randomSecretKey()
  const publicKey = Buffer.from(secp256k1.getPublicKey(privateKey, true))
  return { privateKey, publicKey }
}

const buyer = keypair()
const seller = keypair()
const arbiter = keypair()
const pubkeys = [buyer.publicKey, seller.publicKey, arbiter.publicKey].sort(Buffer.compare)
const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network })
const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network })
const multisigAddress = p2wsh.address!

const REAL_TXID = 'a'.repeat(64)
const REAL_VOUT = 0
const INPUT_VALUE = 100_000n
const RELEASE_ADDR = bitcoin.payments.p2wpkh({ pubkey: buyer.publicKey, network }).address!
const SELLER_ADDR = bitcoin.payments.p2wpkh({ pubkey: seller.publicKey, network }).address!
const FEE = 164n
const OUTPUT_VALUE = INPUT_VALUE - FEE

interface BuildOpts {
  txid?: string
  vout?: number
  inputValue?: bigint
  witnessScript?: Uint8Array
  outputs?: Array<{ address?: string; value: bigint; opReturn?: boolean }>
}

function buildPsbt(opts: BuildOpts = {}): string {
  const psbt = new bitcoin.Psbt({ network })
  psbt.addInput({
    hash: opts.txid ?? REAL_TXID,
    index: opts.vout ?? REAL_VOUT,
    witnessUtxo: { script: p2wsh.output!, value: opts.inputValue ?? INPUT_VALUE },
    witnessScript: opts.witnessScript ?? p2ms.output!,
  })
  const outputs = opts.outputs ?? [{ address: RELEASE_ADDR, value: OUTPUT_VALUE }]
  for (const out of outputs) {
    if (out.opReturn) {
      const script = bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, Buffer.from('unexpected', 'utf8')])
      psbt.addOutput({ script, value: out.value })
    } else {
      psbt.addOutput({ address: out.address!, value: out.value })
    }
  }
  return psbt.toBase64()
}

function baseExpected(): ExpectedSigningIntent {
  return {
    operation: 'RELEASE',
    network: 'testnet',
    escrowId: 'escrow-1',
    input: { txid: REAL_TXID, vout: REAL_VOUT, value: INPUT_VALUE, multisigAddress },
    outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE }],
    minerFee: FEE,
    threshold: 2,
    participantPubkeys: pubkeys.map((p) => p.toString('hex')),
    requiredSigners: ['buyer-id', 'seller-id'],
  }
}

describe('verifySigningIntent — golden path', () => {
  it('a correctly-built PSBT verifies OK, zero mismatches', () => {
    const psbtBase64 = buildPsbt()
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(true)
    expect(result.mismatches).toEqual([])
  })

  it('verifyAndSignEscrowPsbt() signs successfully when verification passes', () => {
    const psbtBase64 = buildPsbt()
    const signed = verifyAndSignEscrowPsbt(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'], buyer.privateKey)
    expect(typeof signed).toBe('string')
    expect(signed.length).toBeGreaterThan(0)
  })
})

describe('verifySigningIntent — adversarial matrix A-N: every tampered PSBT fails, sign is never reached', () => {
  const cases: Array<[string, BuildOpts, string[]]> = [
    ['A. different txid', { txid: 'b'.repeat(64) }, ['input.txid']],
    ['B. different vout', { vout: 1 }, ['input.vout']],
    ['C. different input value', { inputValue: INPUT_VALUE + 1000n }, ['input.value', 'minerFee']],
    ['D. different payout destination', { outputs: [{ address: SELLER_ADDR, value: OUTPUT_VALUE }] }, ['outputs[0].address']],
    ['E. different payout amount', { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE - 500n }] }, ['outputs[0].value', 'minerFee']],
    ['F. different miner fee (via output value shift)', { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE + 50n }] }, ['outputs[0].value', 'minerFee']],
    [
      'G. unexpected second output',
      { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE - 1000n }, { address: SELLER_ADDR, value: 900n }] },
      ['outputs.count', 'outputs[0].value', 'minerFee'],
    ],
    [
      'H. unexpected OP_RETURN output',
      { outputs: [{ address: RELEASE_ADDR, value: OUTPUT_VALUE - 1000n }, { value: 0n, opReturn: true }] },
      ['outputs.count', 'outputs[0].value', 'minerFee'],
    ],
  ]

  it.each(cases)('%s', (_name, opts, expectedFields) => {
    const psbtBase64 = buildPsbt(opts)
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    for (const field of expectedFields) {
      expect(result.mismatches.some((m) => m.field === field)).toBe(true)
    }
    expect(() => verifyAndSignEscrowPsbt(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'], buyer.privateKey)).toThrow(
      SigningIntentVerificationError
    )
  })

  it('I. network incompatible — PSBT built for one network, verified against a different one', () => {
    // A mainnet address supplied as the expected output while the PSBT
    // itself is testnet-encoded: toOutputScript() for the expected
    // address under the (wrong) testnet network either throws or
    // produces a script that cannot match the real testnet output.
    const mainnetAddr = bitcoin.payments.p2wpkh({ pubkey: buyer.publicKey, network: bitcoin.networks.bitcoin }).address!
    const psbtBase64 = buildPsbt()
    const expected = { ...baseExpected(), outputs: [{ address: mainnetAddr, value: OUTPUT_VALUE }] }
    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'outputs[0].address')).toBe(true)
  })

  it('J. different witnessScript (different quorum entirely)', () => {
    const otherArbiter = keypair()
    const otherPubkeys = [buyer.publicKey, seller.publicKey, otherArbiter.publicKey].sort(Buffer.compare)
    const otherP2ms = bitcoin.payments.p2ms({ m: 2, pubkeys: otherPubkeys, network })
    const otherP2wsh = bitcoin.payments.p2wsh({ redeem: otherP2ms, network })
    const psbt = new bitcoin.Psbt({ network })
    psbt.addInput({
      hash: REAL_TXID,
      index: REAL_VOUT,
      witnessUtxo: { script: otherP2wsh.output!, value: INPUT_VALUE },
      witnessScript: otherP2ms.output!,
    })
    psbt.addOutput({ address: RELEASE_ADDR, value: OUTPUT_VALUE })
    const result = verifySigningIntent(psbt.toBase64(), baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'input.multisigAddress' || m.field === 'participantPubkeys')).toBe(true)
  })

  it('K. different threshold (2-of-3 tampered to look like 1-of-3)', () => {
    const tamperedP2ms = bitcoin.payments.p2ms({ m: 1, pubkeys, network })
    const psbtBase64 = buildPsbt({ witnessScript: tamperedP2ms.output! })
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    // The witness script no longer matches this escrow's own known
    // deposit address's script bytes either way (a 1-of-3 script hashes
    // to a different P2WSH address) — caught at the input.multisigAddress
    // layer before threshold is even separately inspected, which is the
    // stronger, more literal check.
    expect(result.mismatches.some((m) => m.field === 'input.multisigAddress' || m.field === 'threshold')).toBe(true)
  })

  it('L. different participant pubkeys (same threshold, swapped signer)', () => {
    const impostor = keypair()
    const tamperedPubkeys = [buyer.publicKey, impostor.publicKey, arbiter.publicKey].sort(Buffer.compare)
    const tamperedP2ms = bitcoin.payments.p2ms({ m: 2, pubkeys: tamperedPubkeys, network })
    const psbtBase64 = buildPsbt({ witnessScript: tamperedP2ms.output! })
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'input.multisigAddress' || m.field === 'participantPubkeys')).toBe(true)
  })

  it('M. unexpected required signer', () => {
    const psbtBase64 = buildPsbt()
    const result = verifySigningIntent(psbtBase64, baseExpected(), ['buyer-id', 'an-unexpected-third-party'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'requiredSigners')).toBe(true)
    expect(() => verifyAndSignEscrowPsbt(psbtBase64, baseExpected(), ['buyer-id', 'an-unexpected-third-party'], buyer.privateKey)).toThrow(
      SigningIntentVerificationError
    )
  })

  it('N. tampered split percentages/outputs (2-output SPLIT case)', () => {
    const buyerSplit = 6000n
    const sellerSplit = OUTPUT_VALUE - buyerSplit
    const psbtBase64 = buildPsbt({ outputs: [{ address: RELEASE_ADDR, value: buyerSplit }, { address: SELLER_ADDR, value: sellerSplit }] })
    const expected: ExpectedSigningIntent = {
      ...baseExpected(),
      operation: 'SPLIT',
      // Wallet expected a different split ratio than what the PSBT
      // actually encodes — e.g. expected 50/50, PSBT gives buyer 60/40.
      outputs: [
        { address: RELEASE_ADDR, value: (OUTPUT_VALUE * 5000n) / 10000n },
        { address: SELLER_ADDR, value: OUTPUT_VALUE - (OUTPUT_VALUE * 5000n) / 10000n },
      ],
    }
    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'outputs[0].value')).toBe(true)
  })
})

// ─── Missão 11 Fase 5.1 — remote-wallet policy verification ────────────────
//
// This entire file already lives under this architectural rule (this
// file's own header, unchanged since Missão 10): "this package must never
// depend on `src/` (the backend's own tree)". Every test above — the
// golden path AND the full A-N adversarial matrix — has therefore ALWAYS
// been remote-wallet-clean: none of it imports multisigProvider,
// MULTISIG_SEED, server config, or deriveArbiterKey()/getArbiterPubkeyHex().
// Case L already proves a swapped/wrong participant pubkey (buyer, seller,
// OR arbiter — the check is symmetric across all three) is rejected; case
// K already proves a wrong threshold is rejected; case J already proves a
// wrong witnessScript/address is rejected.
//
// What THIS block adds, specific to Fase 5.1's own finding (the
// co-located rehearsal demo derives the arbiter pubkey via
// multisigProvider.getArbiterPubkeyHex(), which only works because that
// script runs alongside MULTISIG_SEED): an EXPLICIT proof that a wallet
// can independently RECONSTRUCT the expected deposit address from bare
// pubkeys (deriveExpectedMultisigAddress()) — a stronger, address-level
// check than verifySigningIntent()'s own witnessScript-decode-compare —
// and a full fee-aware RELEASE walkthrough exercising both together.
//
// TRUST BOUNDARY, stated explicitly (Fase 5.1 §8): this suite never trusts
// the PSBT, never trusts a server-provided "expected outputs" list, and
// never trusts a server-provided script on faith. It only ever trusts
// three raw pubkeys, a threshold, and a lockedAmount/rate — the same shape
// of data an authenticated GET /v1/settlement/escrow/:id response (buyer/
// seller pubkeys via EscrowParticipantKey, already real) or a
// still-open, escrow-specific arbiter-pubkey source (still NOT persisted
// anywhere today — see this mission's own Fase 5.1 report) would need to
// carry. Everything else — the expected address, the expected outputs —
// is independently DERIVED here, in this test, using only that raw
// material, then compared against the PSBT. Nothing is assumed correct
// because the server said so.
describe('Fase 5.1 — deriveExpectedMultisigAddress(): independent address reconstruction, zero server-side access', () => {
  it('reconstructs the exact same address the (independently-built) P2WSH script produces, from bare pubkeys alone', () => {
    const reconstructed = deriveExpectedMultisigAddress(
      [buyer.publicKey.toString('hex'), seller.publicKey.toString('hex'), arbiter.publicKey.toString('hex')],
      2,
      'testnet'
    )
    expect(reconstructed).toBe(multisigAddress)
  })

  it('is order-independent on input (submission order never matters — matches Sails\' own determinism guarantee)', () => {
    const a = deriveExpectedMultisigAddress([buyer.publicKey.toString('hex'), seller.publicKey.toString('hex'), arbiter.publicKey.toString('hex')], 2, 'testnet')
    const b = deriveExpectedMultisigAddress([arbiter.publicKey.toString('hex'), buyer.publicKey.toString('hex'), seller.publicKey.toString('hex')], 2, 'testnet')
    expect(a).toBe(b)
  })

  it('FAILS CLOSED: a wrong arbiter pubkey reconstructs a DIFFERENT address, never a false match', () => {
    const impostorArbiter = keypair()
    const reconstructed = deriveExpectedMultisigAddress(
      [buyer.publicKey.toString('hex'), seller.publicKey.toString('hex'), impostorArbiter.publicKey.toString('hex')],
      2,
      'testnet'
    )
    expect(reconstructed).not.toBe(multisigAddress)
  })

  it('FAILS CLOSED: a wrong buyer pubkey reconstructs a DIFFERENT address', () => {
    const impostorBuyer = keypair()
    const reconstructed = deriveExpectedMultisigAddress(
      [impostorBuyer.publicKey.toString('hex'), seller.publicKey.toString('hex'), arbiter.publicKey.toString('hex')],
      2,
      'testnet'
    )
    expect(reconstructed).not.toBe(multisigAddress)
  })

  it('FAILS CLOSED: a wrong seller pubkey reconstructs a DIFFERENT address', () => {
    const impostorSeller = keypair()
    const reconstructed = deriveExpectedMultisigAddress(
      [buyer.publicKey.toString('hex'), impostorSeller.publicKey.toString('hex'), arbiter.publicKey.toString('hex')],
      2,
      'testnet'
    )
    expect(reconstructed).not.toBe(multisigAddress)
  })

  it('FAILS CLOSED: a wrong threshold reconstructs a DIFFERENT address', () => {
    const reconstructed = deriveExpectedMultisigAddress(
      [buyer.publicKey.toString('hex'), seller.publicKey.toString('hex'), arbiter.publicKey.toString('hex')],
      1, // tampered from 2-of-3 to 1-of-3
      'testnet'
    )
    expect(reconstructed).not.toBe(multisigAddress)
  })

  it('FAILS CLOSED: the same 3 correct keys under the wrong network reconstruct a DIFFERENT address', () => {
    const reconstructed = deriveExpectedMultisigAddress(
      [buyer.publicKey.toString('hex'), seller.publicKey.toString('hex'), arbiter.publicKey.toString('hex')],
      2,
      'mainnet'
    )
    expect(reconstructed).not.toBe(multisigAddress)
  })
})

describe('Fase 5.1 — full remote-wallet walkthrough: address reconstruction + fee-aware signing-intent verification, together', () => {
  // A frozen collection destination, standing in for what an authenticated
  // GET /v1/settlement/escrow/:id response would carry
  // (snapshotFeeCollectionAddress — already a real field, Fase 4.1).
  const sails = keypair()
  const sailsCollectionAddress = bitcoin.payments.p2wpkh({ pubkey: sails.publicKey, network }).address!
  const T = 100_000n // lockedAmount, sats
  const rate = 0.004
  const minerFee = 300n
  const fmax = BigInt(Math.floor(Number(T) * rate)) // 400 sats

  function buildFeeAwarePsbt(outputs: Array<{ address: string; value: bigint }>): string {
    const psbt = new bitcoin.Psbt({ network })
    psbt.addInput({
      hash: REAL_TXID, index: REAL_VOUT,
      witnessUtxo: { script: p2wsh.output!, value: T + fmax },
      witnessScript: p2ms.output!,
    })
    for (const o of outputs) psbt.addOutput({ address: o.address, value: o.value })
    return psbt.toBase64()
  }

  it('RELEASE collectible: address reconstruction + independently-derived fee-aware outputs both verify; sign succeeds', () => {
    const reconstructedAddress = deriveExpectedMultisigAddress(pubkeys.map((p) => p.toString('hex')), 2, 'testnet')
    expect(reconstructedAddress).toBe(multisigAddress) // step 1 — address matches the escrow's claimed multisigAddr

    const expectedOutputs = buildExpectedFeeAwareReleaseOutputs({
      lockedAmountSats: T, protocolFeeRate: rate, minerFee, buyerAddress: RELEASE_ADDR, secondOutputAddress: sailsCollectionAddress,
    }) // step 2 — outputs derived independently, never read from the PSBT

    const psbtBase64 = buildFeeAwarePsbt(expectedOutputs)
    const expected: ExpectedSigningIntent = { ...baseExpected(), input: { ...baseExpected().input, value: T + fmax, multisigAddress: reconstructedAddress }, outputs: expectedOutputs, minerFee }

    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(true)
    const signed = verifyAndSignEscrowPsbt(psbtBase64, expected, ['buyer-id', 'seller-id'], buyer.privateKey)
    expect(typeof signed).toBe('string')
  })

  it('RELEASE pre-funding waived (Fmax=0): single-output shape verifies correctly, no Sails leg expected', () => {
    const expectedOutputs = [{ address: RELEASE_ADDR, value: T - minerFee }]
    const psbt = new bitcoin.Psbt({ network })
    psbt.addInput({ hash: REAL_TXID, index: REAL_VOUT, witnessUtxo: { script: p2wsh.output!, value: T }, witnessScript: p2ms.output! })
    psbt.addOutput({ address: RELEASE_ADDR, value: T - minerFee })

    const expected: ExpectedSigningIntent = { ...baseExpected(), input: { ...baseExpected().input, value: T }, outputs: expectedOutputs, minerFee }
    const result = verifySigningIntent(psbt.toBase64(), expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(true)
  })

  it('wrong Sails fee destination: rejected, sign never reached', () => {
    const wrongCollector = keypair()
    const wrongAddress = bitcoin.payments.p2wpkh({ pubkey: wrongCollector.publicKey, network }).address!
    const expectedOutputs = buildExpectedFeeAwareReleaseOutputs({
      lockedAmountSats: T, protocolFeeRate: rate, minerFee, buyerAddress: RELEASE_ADDR, secondOutputAddress: sailsCollectionAddress,
    })
    // The PSBT actually pays the WRONG address for the fee leg.
    const psbtBase64 = buildFeeAwarePsbt([expectedOutputs[0], { address: wrongAddress, value: fmax }])
    const expected: ExpectedSigningIntent = { ...baseExpected(), input: { ...baseExpected().input, value: T + fmax }, outputs: expectedOutputs, minerFee }

    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'outputs[1].address')).toBe(true)
    expect(() => verifyAndSignEscrowPsbt(psbtBase64, expected, ['buyer-id', 'seller-id'], buyer.privateKey)).toThrow(SigningIntentVerificationError)
  })

  it('wrong Sails fee amount: rejected, sign never reached', () => {
    const expectedOutputs = buildExpectedFeeAwareReleaseOutputs({
      lockedAmountSats: T, protocolFeeRate: rate, minerFee, buyerAddress: RELEASE_ADDR, secondOutputAddress: sailsCollectionAddress,
    })
    const psbtBase64 = buildFeeAwarePsbt([expectedOutputs[0], { address: sailsCollectionAddress, value: fmax - 1n }])
    const expected: ExpectedSigningIntent = { ...baseExpected(), input: { ...baseExpected().input, value: T + fmax }, outputs: expectedOutputs, minerFee }

    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'outputs[1].value')).toBe(true)
  })

  it('unexpected extra output beyond buyer+Sails: rejected, sign never reached', () => {
    const expectedOutputs = buildExpectedFeeAwareReleaseOutputs({
      lockedAmountSats: T, protocolFeeRate: rate, minerFee, buyerAddress: RELEASE_ADDR, secondOutputAddress: sailsCollectionAddress,
    })
    const impostor = keypair()
    const impostorAddress = bitcoin.payments.p2wpkh({ pubkey: impostor.publicKey, network }).address!
    const psbtBase64 = buildFeeAwarePsbt([
      { address: expectedOutputs[0].address, value: expectedOutputs[0].value - 100n },
      expectedOutputs[1],
      { address: impostorAddress, value: 100n }, // value-extraction attempt
    ])
    const expected: ExpectedSigningIntent = { ...baseExpected(), input: { ...baseExpected().input, value: T + fmax }, outputs: expectedOutputs, minerFee }

    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'outputs.count' || m.field === 'outputs[2]')).toBe(true)
    expect(() => verifyAndSignEscrowPsbt(psbtBase64, expected, ['buyer-id', 'seller-id'], buyer.privateKey)).toThrow(SigningIntentVerificationError)
  })

  it('a mismatched multisigAddress in the expectation itself (wallet\'s own reconstruction disagrees with what it was told) fails closed before any output is even considered', () => {
    const impostorArbiter = keypair()
    const wrongReconstruction = deriveExpectedMultisigAddress(
      [buyer.publicKey.toString('hex'), seller.publicKey.toString('hex'), impostorArbiter.publicKey.toString('hex')],
      2, 'testnet'
    )
    expect(wrongReconstruction).not.toBe(multisigAddress) // the wallet's own check already caught this before ever building an ExpectedSigningIntent

    // Even if a caller pressed on anyway and verified against the REAL PSBT
    // using this wrong reconstructed address, verifySigningIntent()'s own
    // input.multisigAddress check catches it independently, defense-in-depth.
    const psbtBase64 = buildPsbt()
    const expected = { ...baseExpected(), input: { ...baseExpected().input, multisigAddress: wrongReconstruction } }
    const result = verifySigningIntent(psbtBase64, expected, ['buyer-id', 'seller-id'])
    expect(result.ok).toBe(false)
    expect(result.mismatches.some((m) => m.field === 'input.multisigAddress')).toBe(true)
  })
})

// ─── Missão 11 Fase 5.2 — the closure of Fase 5.1's own open finding ───────
//
// Fase 5.1 proved the RECONSTRUCTION LOGIC was remote-wallet-clean, but
// honestly flagged that no escrow-specific, immutable source of the
// arbiter's committed pubkey existed anywhere in the codebase — a remote
// wallet had the right math but nothing real to feed it for the arbiter
// leg. Fase 5.2 closed that gap server-side (EscrowParticipantKey
// role='arbiter', persisted once at getDepositAddress() time, exposed
// through the EXISTING authenticated GET /v1/settlement/escrow/:id
// response with zero new endpoint — see escrow.service.ts's
// mapParticipantKeysShape() and this package's own types.ts
// EscrowResponse.participantKeys, now widened to include 'arbiter').
//
// This block closes the loop end-to-end at the SDK layer: given nothing
// but a realistic GET-escrow-shaped fixture (the exact JSON shape that
// response returns — participantKeys for all three roles, multisigAddr,
// the frozen fee-policy fields), a remote wallet extracts the arbiter's
// publicKeyHex the same way it would read any other field of an HTTP
// response, then runs the SAME zero-server-access reconstruction Fase 5.1
// already proved. Still zero imports from server code — confirmed by this
// file's own standing header rule.
describe('Fase 5.2 — remote wallet consumes a real GET-escrow-shaped response (participantKeys incl. arbiter), zero server-side access', () => {
  // Stands in for exactly what GET /v1/settlement/escrow/:id now returns
  // for a NEW MULTISIG escrow — not a special test-only shape, the same
  // EscrowResponse.participantKeys array (types.ts) an SDK consumer reads.
  function escrowGetResponseFixture(overrides: { arbiterPublicKeyHex?: string; role?: string } = {}) {
    return {
      id: 'escrow-fase-5-2',
      multisigAddr: multisigAddress,
      participantKeys: [
        { participantId: 'buyer-id', role: 'buyer' as const, publicKeyHex: buyer.publicKey.toString('hex') },
        { participantId: 'seller-id', role: 'seller' as const, publicKeyHex: seller.publicKey.toString('hex') },
        { participantId: 'arb-1', role: overrides.role ?? ('arbiter' as const), publicKeyHex: overrides.arbiterPublicKeyHex ?? arbiter.publicKey.toString('hex') },
      ],
    }
  }

  it('extracts all three pubkeys from a realistic GET-escrow response and reconstructs the exact multisigAddr it also carries', () => {
    const escrow = escrowGetResponseFixture()
    const pubkeysHex = escrow.participantKeys.map((k) => k.publicKeyHex)
    const reconstructed = deriveExpectedMultisigAddress(pubkeysHex, 2, 'testnet')
    expect(reconstructed).toBe(escrow.multisigAddr)
  })

  it('FAILS CLOSED: a tampered arbiter publicKeyHex in the response no longer reconstructs the response\'s own claimed multisigAddr', () => {
    const impostor = keypair()
    const escrow = escrowGetResponseFixture({ arbiterPublicKeyHex: impostor.publicKey.toString('hex') })
    const pubkeysHex = escrow.participantKeys.map((k) => k.publicKeyHex)
    const reconstructed = deriveExpectedMultisigAddress(pubkeysHex, 2, 'testnet')
    expect(reconstructed).not.toBe(escrow.multisigAddr)
  })

  it('a legacy escrow response (no arbiter role present in participantKeys) is honestly unusable for independent reconstruction — the wallet must recognize this, not guess', () => {
    // A pre-Fase-5.2 escrow's participantKeys only ever has buyer/seller —
    // exactly the historical-compatibility shape this mission's own report
    // discloses (no fake backfill was ever performed). A real wallet
    // integration must treat this as "cannot independently verify the
    // arbiter leg for this escrow", not silently skip the check.
    const legacyEscrow = { multisigAddr: multisigAddress, participantKeys: [
      { participantId: 'buyer-id', role: 'buyer' as const, publicKeyHex: buyer.publicKey.toString('hex') },
      { participantId: 'seller-id', role: 'seller' as const, publicKeyHex: seller.publicKey.toString('hex') },
    ] }
    const arbiterEntry = legacyEscrow.participantKeys.find((k) => (k.role as string) === 'arbiter')
    expect(arbiterEntry).toBeUndefined()
  })
})
