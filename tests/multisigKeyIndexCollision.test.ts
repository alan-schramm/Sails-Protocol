/**
 * #235 R7G — MULTISIG keyIndexFor() collision audit: evidence with the repository's own derivation, the real
 * MultisigProvider and real secp256k1 / BIP32 / BIP143 cryptography (bitcoinjs-lib, tiny-secp256k1). No network.
 *
 * keyIndexFor(role, id) = sha256(`${role}:${id}`)[0..4] % (2^31-1) -> m/0'/0/<index> under MULTISIG_SEED. In
 * production only role 'arbiter' is ever derived (buyer / seller keys are client-submitted), and the index
 * depends on the arbiter's id alone: one arbiter key is reused by every escrow committed to that arbiter, by
 * design. What this file proves:
 *   1. two distinct arbiter ids collide (pairs found with the real function) and resolve to the SAME key;
 *   2. the provider's script-consistency check then accepts the colliding identity - a check, not an authority:
 *      who may execute a disputed disposition is decided by id (assigned arbiter), never by this key;
 *   3. a key shared across escrows (by design or by collision) cannot carry a signature from one escrow to
 *      another, nor from one role to another: BIP143 commits each signature to its own script, outpoint and
 *      amount, and LOCAL_SIGNATURE_VALIDATION_V1 rejects it;
 *   4. a participant cannot put the arbiter key in its own slot (MULTISIG_KEY_DISTINCTNESS_V1).
 */
import { createHash, randomBytes } from 'crypto'
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from 'tiny-secp256k1'
import { BIP32Factory } from 'bip32'
import { ECPairFactory } from 'ecpair'

const bip32 = BIP32Factory(ecc)
const ECPair = ECPairFactory(ecc)
bitcoin.initEccLib(ecc)

const ORIGINAL_ENV = { ...process.env }
// Colliding pairs found with the repository's keyIndexFor() (see the reproduction below).
const X = 'arbiter-25894' // committed into the scripts (TRUSTED_ARBITRATORS[0])
const Y = 'arbiter-31521' // collides with X: same index 781756369
const Z = 'arbiter-0'     // does not collide
const UUID_PAIR = ['67e5060f-7d37-418c-b2df-80d6f469647e', '6e4aba77-886c-4553-bb27-0b82378e0e25'] // index 1478052996
const CROSS_ROLE = ['30f61680-bd29-4e85-ab17-9915e7c9b1eb', '8c8baea4-62ea-45d8-a1af-d279b62cb3ce'] // buyer:a == arbiter:b
const SEED = 'keyindex-collision-audit-seed'

function load() {
  jest.resetModules()
  process.env = { ...ORIGINAL_ENV, MOCK_ESCROW: 'false', MULTISIG_SEED: SEED, TRUSTED_ARBITRATORS: `${X},${Y},${Z}`, MULTISIG_NETWORK: 'testnet' }
  return require('../src/modules/open-settlement/multisig.provider')
}
afterAll(() => { process.env = ORIGINAL_ENV })

describe('MULTISIG keyIndexFor() — collisions are real', () => {
  it('two arbiter ids (config-style and uuid), and a buyer/arbiter pair, map to the same index', () => {
    const { keyIndexFor } = load()
    expect(keyIndexFor('arbiter', X)).toBe(781756369)
    expect(keyIndexFor('arbiter', Y)).toBe(781756369)
    expect(keyIndexFor('arbiter', Z)).not.toBe(781756369)
    expect(keyIndexFor('arbiter', UUID_PAIR[0])).toBe(keyIndexFor('arbiter', UUID_PAIR[1]))
    expect(keyIndexFor('buyer', CROSS_ROLE[0])).toBe(keyIndexFor('arbiter', CROSS_ROLE[1]))
  })

  it('a collision is the same private key: the provider derives one pubkey, and the BIP32 path holds one secret', () => {
    const { keyIndexFor, multisigProvider } = load()
    const [kx, ky] = [multisigProvider.getArbiterPubkeyHex(X), multisigProvider.getArbiterPubkeyHex(Y)]
    expect(kx).toBe(ky)
    expect(multisigProvider.getArbiterPubkeyHex(Z)).not.toBe(kx)
    // the provider's own derivation, replicated byte for byte: same seed, same path, same secret
    const master = bip32.fromSeed(createHash('sha256').update(SEED).digest(), bitcoin.networks.testnet)
    const [nx, ny] = [master.derivePath(`m/0'/0/${keyIndexFor('arbiter', X)}`), master.derivePath(`m/0'/0/${keyIndexFor('arbiter', Y)}`)]
    expect(Buffer.from(nx.publicKey).toString('hex')).toBe(kx)
    expect(Buffer.from(nx.privateKey!).equals(Buffer.from(ny.privateKey!))).toBe(true)
  })

  it('production derives the arbiter role only; buyer / seller keyIndexFor() exists only in the demo', () => {
    const { readdirSync, readFileSync, statSync } = require('fs')
    const { join } = require('path')
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f: string) => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : [])
    const root = join(__dirname, '..')
    const calls = [...files(join(root, 'src')), ...files(join(root, 'scripts'))].flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/keyIndexFor\(\s*([^,]+),/g)].map((m: RegExpMatchArray) => `${f.slice(root.length + 1).replace(/\\/g, '/')}:${m[1].trim()}`))
    expect(calls.filter((c) => !c.includes(": 'buyer' | 'seller' | 'arbiter'") && !c.endsWith(':role'))).toEqual(["src/modules/open-settlement/multisig.provider.ts:'arbiter'"])
  })
})

describe('what a collision changes — and what it cannot', () => {
  // A 2-of-3 P2WSH escrow exactly as the provider builds it: sorted keys, P2MS(2) inside P2WSH.
  function escrow(arbiter: Buffer, network = bitcoin.networks.testnet) {
    const buyer = ECPair.makeRandom({ network }), seller = ECPair.makeRandom({ network })
    const pubkeys = [Buffer.from(buyer.publicKey), Buffer.from(seller.publicKey), arbiter].sort(Buffer.compare)
    const p2wsh = bitcoin.payments.p2wsh({ redeem: bitcoin.payments.p2ms({ m: 2, pubkeys, network }), network })
    return { buyer, seller, p2wsh, address: p2wsh.address! }
  }
  function round(e: ReturnType<typeof escrow>, sats = 100_000) {
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet })
    psbt.addInput({ hash: randomBytes(32), index: 0, witnessUtxo: { script: e.p2wsh.output!, value: BigInt(sats) as any }, witnessScript: e.p2wsh.redeem!.output! })
    psbt.addOutput({ address: escrow(Buffer.from(ECPair.makeRandom().publicKey)).address, value: BigInt(sats - 1_000) as any })
    return psbt
  }
  const signerOf = (node: { publicKey: Uint8Array; privateKey?: Uint8Array }) => ({ publicKey: Buffer.from(node.publicKey), sign: (h: Buffer) => Buffer.from(ecc.sign(h, node.privateKey!)) })

  it('the script-consistency check accepts a colliding arbiter id (Y on X\'s escrow) and refuses a non-colliding one (Z)', () => {
    const { multisigProvider } = load()
    const K = multisigProvider.getArbiterPubkeyHex(X)
    // the server signs with the arbiter key only on the DISPUTED path, which is where this check runs
    const check = (triggeredBy: string) => () => (multisigProvider as any).assertArbiterMatchesScript({ tradeId: 't-1', lockedAmount: '0.001', status: 'DISPUTED', arbiterPubkey: K, triggeredBy })
    expect(check(X)).not.toThrow()
    expect(check(Y)).not.toThrow() // the collision: this check cannot tell X and Y apart
    expect(check(Z)).toThrow(/does not match the arbiter public key committed/)
  })

  it('K6/K8: a signature by the shared arbiter key on escrow A is not valid on escrow B — locally or by script semantics', () => {
    const { multisigProvider } = load()
    const master = bip32.fromSeed(createHash('sha256').update(SEED).digest(), bitcoin.networks.testnet)
    const K = master.derivePath(`m/0'/0/781756369`) // X's key == Y's key
    const [A, B] = [escrow(Buffer.from(K.publicKey)), escrow(Buffer.from(K.publicKey))]
    const [ra, rb] = [round(A), round(B)]
    const signedA = bitcoin.Psbt.fromBase64(ra.toBase64(), { network: bitcoin.networks.testnet })
    signedA.signInput(0, signerOf(K))
    expect(signedA.validateSignaturesOfInput(0, (p, h, s) => ecc.verify(h, p, s), Buffer.from(K.publicKey))).toBe(true)
    const valid = (e: ReturnType<typeof escrow>) => ({ tradeId: 't', lockedAmount: '0.001', multisigAddr: e.address })
    // the genuine signature passes LOCAL_SIGNATURE_VALIDATION_V1 on its own escrow
    expect(() => multisigProvider.validatePartialSignature(valid(A), ra.toBase64(), signedA.toBase64(), Buffer.from(K.publicKey).toString('hex'))).not.toThrow()
    // transplanted onto escrow B's round
    const forgedB = bitcoin.Psbt.fromBase64(rb.toBase64(), { network: bitcoin.networks.testnet })
    forgedB.updateInput(0, { partialSig: signedA.data.inputs[0].partialSig })
    expect(() => multisigProvider.validatePartialSignature(valid(B), rb.toBase64(), forgedB.toBase64(), Buffer.from(K.publicKey).toString('hex'))).toThrow(/not a valid signature by your key over this transaction/)
    expect(forgedB.validateSignaturesOfInput(0, (p, h, s) => ecc.verify(h, p, s), Buffer.from(K.publicKey))).toBe(false) // BIP143: script, outpoint, amount
    // and A's own round cannot be redirected to B's funding surface
    expect(() => multisigProvider.validatePartialSignature(valid(B), ra.toBase64(), signedA.toBase64(), Buffer.from(K.publicKey).toString('hex'))).toThrow(/authority check/)
  })

  it('K7: the arbiter\'s signature presented as a participant\'s is refused', () => {
    const { multisigProvider } = load()
    const master = bip32.fromSeed(createHash('sha256').update(SEED).digest(), bitcoin.networks.testnet)
    const K = master.derivePath(`m/0'/0/781756369`)
    const A = escrow(Buffer.from(K.publicKey))
    const r = round(A)
    const signed = bitcoin.Psbt.fromBase64(r.toBase64(), { network: bitcoin.networks.testnet })
    signed.signInput(0, signerOf(K))
    expect(() => multisigProvider.validatePartialSignature({ tradeId: 't', lockedAmount: '0.001', multisigAddr: A.address }, r.toBase64(), signed.toBase64(), Buffer.from(A.buyer.publicKey).toString('hex')))
      .toThrow(/carries a signature for a key other than yours|carries no signature for your key/)
  })

  it('K3: a participant cannot submit the (public) arbiter key as its own — the 2-of-3 keys stay distinct', () => {
    const { multisigProvider, assertDistinctMultisigKeys } = load()
    const K = Buffer.from(multisigProvider.getArbiterPubkeyHex(Y), 'hex') // Y's key, i.e. X's
    expect(() => assertDistinctMultisigKeys('t', { buyer: K, seller: Buffer.from(ECPair.makeRandom().publicKey), arbiter: Buffer.from(multisigProvider.getArbiterPubkeyHex(X), 'hex') }))
      .toThrow(/buyer and arbiter public keys are the same key/)
  })
})
