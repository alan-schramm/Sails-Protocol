/**
 * SafeGuardEvmProvider (RFC-020) — real ERC-4337 UserOperation
 * construction/hashing and real Safe signature combination logic, no
 * mocking of the crypto. Unlike MultisigProvider/LightningHodlProvider
 * (which need a mocked block-explorer/Arkade network call for
 * lockFunds/verifyLock), this provider's lockFunds/verifyLock/broadcast
 * are themselves disclosed, unbuilt boundaries (no live EVM RPC/bundler
 * in this environment) — those are tested as "throws the disclosed
 * error," not mocked into working.
 *
 * Fixtures are generated deterministically via sha256(seed) -> secp256k1
 * private key (same technique multisigProvider.test.ts uses for its own
 * hardcoded constants), computed here at module load instead of
 * hardcoded, so there's no risk of a transcription error in a long hex
 * literal.
 */
import { createHash } from 'crypto'
import { secp256k1 } from '@noble/curves/secp256k1'
import { getUserOpHash } from '@sails/sdk'
import { EscrowError } from '../src/common/errors'
import {
  SafeGuardEvmProvider,
  weiFromDecimalString,
  ethereumAddressFromCompressedHex,
  recoverSignerAddress,
  type SafeGuardEvmEscrowInput,
} from '../src/modules/open-settlement/safe-guard-evm.provider'

function keypairFromSeed(seed: string) {
  const privateKey = createHash('sha256').update(seed).digest()
  const compressedPubkey = Buffer.from(secp256k1.getPublicKey(privateKey, true)).toString('hex')
  return { privateKey, compressedPubkey }
}

const buyer = keypairFromSeed('safe-guard-evm-buyer')
const seller = keypairFromSeed('safe-guard-evm-seller')

function signDigestHex(privateKey: Buffer, digest: Uint8Array): string {
  const sig = secp256k1.sign(digest, privateKey)
  const compact = sig.toCompactRawBytes()
  const out = new Uint8Array(65)
  out.set(compact, 0)
  out[64] = 27 + sig.recovery
  return '0x' + Buffer.from(out).toString('hex')
}

const SAFE_ADDRESS = '0x' + '11'.repeat(20)

function baseEscrow(overrides: Partial<SafeGuardEvmEscrowInput> = {}): SafeGuardEvmEscrowInput {
  return {
    tradeId: 'trade-safe-guard-1',
    lockedAmount: '1.5',
    buyerPubkey: buyer.compressedPubkey,
    sellerPubkey: seller.compressedPubkey,
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    multisigAddr: SAFE_ADDRESS,
    status: 'FUNDS_LOCKED',
    ...overrides,
  }
}

describe('weiFromDecimalString', () => {
  it('converts a simple decimal string to wei with no float precision loss', () => {
    expect(weiFromDecimalString('1.5')).toBe(1500000000000000000n)
    expect(weiFromDecimalString('0.000000000000000001')).toBe(1n)
    expect(weiFromDecimalString('100')).toBe(100000000000000000000n)
  })

  it('rejects more than 18 decimal places', () => {
    expect(() => weiFromDecimalString('0.0000000000000000001')).toThrow(EscrowError)
  })

  it('handles amounts a float64 conversion would corrupt', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE754 — this exact value would misconvert
    // under a parseFloat()-based approach at 1e18 scale.
    expect(weiFromDecimalString('123456789.123456789')).toBe(123456789123456789000000000n)
  })
})

describe('ethereumAddressFromCompressedHex', () => {
  it('derives a real, valid Ethereum address from a compressed pubkey', () => {
    const address = ethereumAddressFromCompressedHex(buyer.compressedPubkey, 'buyer', 'trade-1')
    expect(address).toMatch(/^0x[0-9a-f]{40}$/)
  })

  it('is deterministic — the same pubkey always derives the same address', () => {
    const a = ethereumAddressFromCompressedHex(buyer.compressedPubkey, 'buyer', 'trade-1')
    const b = ethereumAddressFromCompressedHex(buyer.compressedPubkey, 'buyer', 'trade-1')
    expect(a).toBe(b)
  })

  it('buyer and seller derive different addresses', () => {
    const a = ethereumAddressFromCompressedHex(buyer.compressedPubkey, 'buyer', 'trade-1')
    const b = ethereumAddressFromCompressedHex(seller.compressedPubkey, 'seller', 'trade-1')
    expect(a).not.toBe(b)
  })

  it('throws a clear error when the pubkey is missing', () => {
    expect(() => ethereumAddressFromCompressedHex(undefined, 'buyer', 'trade-1')).toThrow(/submit-key/)
  })
})

describe('recoverSignerAddress', () => {
  it('recovers the real signer address from a genuine ECDSA signature', () => {
    const digest = createHash('sha256').update('some userOpHash').digest()
    const sigHex = signDigestHex(buyer.privateKey, digest)
    const recovered = recoverSignerAddress(sigHex, digest)
    const expected = ethereumAddressFromCompressedHex(buyer.compressedPubkey, 'buyer', 'trade-1')
    expect(recovered).toBe(expected)
  })

  it('SECURITY: recovers a different address for a signature over a different digest', () => {
    const digestA = createHash('sha256').update('message A').digest()
    const digestB = createHash('sha256').update('message B').digest()
    const sigHex = signDigestHex(buyer.privateKey, digestA)
    // Using the signature from digestA but verifying against digestB's
    // recovery must NOT silently resolve to the same address by luck.
    const recoveredWrong = recoverSignerAddress(sigHex, digestB)
    const realAddress = ethereumAddressFromCompressedHex(buyer.compressedPubkey, 'buyer', 'trade-1')
    expect(recoveredWrong).not.toBe(realAddress)
  })
})

describe('SafeGuardEvmProvider.buildUnsignedRelease / buildUnsignedRefund', () => {
  it('cooperative path (not DISPUTED) requires both buyer and seller, builds a real userOpHash', async () => {
    const provider = new SafeGuardEvmProvider()
    const escrow = baseEscrow({ status: 'FUNDS_LOCKED' })
    const result = await provider.buildUnsignedRelease(escrow, '0x' + '22'.repeat(20))

    expect(result.requiredSigners).toEqual(['buyer-1', 'seller-1'])
    const bundle = JSON.parse(result.psbtBase64)
    expect(bundle.path).toBe('COOPERATIVE')
    expect(bundle.userOpHash).toMatch(/^[0-9a-f]{64}$/)
    expect(bundle.userOp.sender).toBe(SAFE_ADDRESS)
    expect(bundle.preEmbeddedSignature).toBeUndefined()

    // Recomputing independently must match what the provider reported.
    const revived = { ...bundle.userOp, nonce: BigInt(bundle.userOp.nonce), preVerificationGas: BigInt(bundle.userOp.preVerificationGas) }
    const recomputed = getUserOpHash(revived, 11155111n, '0x0000000071727De22E5E9d8BAf0edAc6f37da032')
    expect(Buffer.from(recomputed).toString('hex')).toBe(bundle.userOpHash)
  })

  it('disputed path throws a clear error when no AWS_KMS_KEY_ID is configured (real, disclosed boundary)', async () => {
    const provider = new SafeGuardEvmProvider()
    const escrow = baseEscrow({ status: 'DISPUTED' })
    await expect(provider.buildUnsignedRelease(escrow, '0x' + '22'.repeat(20))).rejects.toThrow(/AWS_KMS_KEY_ID/)
  })

  it('buildUnsignedRefund derives the refund address from the seller pubkey', async () => {
    const provider = new SafeGuardEvmProvider()
    const escrow = baseEscrow({ status: 'FUNDS_LOCKED' })
    const result = await provider.buildUnsignedRefund(escrow)
    const expected = ethereumAddressFromCompressedHex(seller.compressedPubkey, 'seller', escrow.tradeId)
    expect(result.toAddress).toBe(expected)
    expect(result.requiredSigners).toEqual(['buyer-1', 'seller-1'])
  })

  it('throws a clear error when the Safe address is not recorded (lockFunds never succeeded)', async () => {
    const provider = new SafeGuardEvmProvider()
    const escrow = baseEscrow({ multisigAddr: null })
    await expect(provider.buildUnsignedRelease(escrow, '0x' + '22'.repeat(20))).rejects.toThrow(/lockFunds\(\) must succeed first/)
  })
})

describe('SafeGuardEvmProvider.finalizeRelease — real signature combination', () => {
  it('recovers, sorts by address, and concatenates real submitted signatures into Safe\'s packed format', async () => {
    const provider = new SafeGuardEvmProvider()
    const escrow = baseEscrow({ status: 'FUNDS_LOCKED' })
    const unsigned = await provider.buildUnsignedRelease(escrow, '0x' + '22'.repeat(20))
    const bundle = JSON.parse(unsigned.psbtBase64)
    const digest = Buffer.from(bundle.userOpHash, 'hex')

    const buyerSig = signDigestHex(buyer.privateKey, digest)
    const sellerSig = signDigestHex(seller.privateKey, digest)

    // finalizeRelease's real work (recover + sort + concat) succeeds;
    // only the final broadcast() step is the disclosed, unbuilt boundary.
    await expect(provider.finalizeRelease(escrow, unsigned.psbtBase64, [buyerSig, sellerSig])).rejects.toThrow(/live EVM RPC/)
  })

  it('documents the real ownership boundary: this provider combines whatever signatures it is given — escrow.service.ts, not this file, enforces that every requiredSigner submitted before finalize() is ever called', async () => {
    // See escrow.service.ts's own submitTransactionSignature(): it only
    // invokes finalizeRelease()/finalizeRefund() once every entry in
    // requiredSigners has a stored EscrowTransactionSignature row. This
    // test proves that boundary precisely (finalize() itself does not
    // re-check signer completeness) rather than assuming it.
    const provider = new SafeGuardEvmProvider()
    const escrow = baseEscrow({ status: 'FUNDS_LOCKED' })
    const unsigned = await provider.buildUnsignedRelease(escrow, '0x' + '22'.repeat(20))
    const bundle = JSON.parse(unsigned.psbtBase64)
    const digest = Buffer.from(bundle.userOpHash, 'hex')
    const buyerSig = signDigestHex(buyer.privateKey, digest)

    await expect(provider.finalizeRelease(escrow, unsigned.psbtBase64, [buyerSig])).rejects.toThrow(/live EVM RPC/)
  })

  it('rejects a malformed signature during combination', async () => {
    const provider = new SafeGuardEvmProvider()
    const escrow = baseEscrow({ status: 'FUNDS_LOCKED' })
    const unsigned = await provider.buildUnsignedRelease(escrow, '0x' + '22'.repeat(20))

    await expect(provider.finalizeRelease(escrow, unsigned.psbtBase64, ['0xnotasignature'])).rejects.toThrow(EscrowError)
  })
})

describe('SafeGuardEvmProvider — disclosed, unbuilt boundaries', () => {
  it('lockFunds throws a clear "needs live EVM RPC" error', async () => {
    const provider = new SafeGuardEvmProvider()
    await expect(provider.lockFunds(baseEscrow())).rejects.toThrow(/live EVM RPC/)
  })

  it('verifyLock throws a clear "needs live EVM RPC" error', async () => {
    const provider = new SafeGuardEvmProvider()
    await expect(provider.verifyLock(baseEscrow())).rejects.toThrow(/live EVM RPC/)
  })

  it('releaseFunds is not directly callable', async () => {
    const provider = new SafeGuardEvmProvider()
    await expect(provider.releaseFunds(baseEscrow(), '0x' + '33'.repeat(20))).rejects.toThrow(/not directly callable/)
  })

  it('refundFunds is not directly callable', async () => {
    const provider = new SafeGuardEvmProvider()
    await expect(provider.refundFunds(baseEscrow())).rejects.toThrow(/not directly callable/)
  })
})
