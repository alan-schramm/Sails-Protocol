/**
 * ERC4337CustodyProvider (RFC-020, EVM track) — real userOpHash
 * computation, no mocking. Verifies the pure-computation parts of
 * evm-4337.ts: the UserOperation struct hash and the EIP-712 domain
 * separator/digest, both transcribed from the real, installed
 * @account-abstraction/contracts source (see evm-4337.ts's own header
 * comment for the exact files read).
 *
 * "UserOp replay is blocked" is a real logic test at the level this
 * package can actually exercise without a live EntryPoint: the real
 * userOpHash algorithm treats `nonce` as part of the signed struct, so
 * two UserOperations that differ only in `nonce` hash to different
 * digests — a replayed (same-nonce) UserOperation would need the exact
 * same signature bytes to be accepted twice, and EntryPoint's own real
 * getNonce()/_validateNonce() (not reimplemented here, see evm-4337.ts's
 * header) rejects any UserOp whose nonce isn't the account's next
 * expected one. This test proves the nonce genuinely changes the hash —
 * the property EntryPoint's real replay protection depends on.
 */
import { getUserOpHash, hashUserOp, domainSeparator, ERC4337CustodyProvider } from '../src/custody/evm-4337'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { PackedUserOperation } from '../src/custody/types'

const ZERO_BYTES32 = '0x' + '00'.repeat(32)
const SAFE_ADDRESS = '0x' + '11'.repeat(20)
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' // real, well-known canonical ERC-4337 v0.7 EntryPoint address
const CHAIN_ID = 11155111n // Sepolia

function baseUserOp(overrides: Partial<PackedUserOperation> = {}): PackedUserOperation {
  return {
    sender: SAFE_ADDRESS,
    nonce: 0n,
    initCode: '0x',
    callData: '0x',
    accountGasLimits: ZERO_BYTES32,
    preVerificationGas: 0n,
    gasFees: ZERO_BYTES32,
    paymasterAndData: '0x',
    signature: '0x',
    ...overrides,
  }
}

describe('hashUserOp (UserOperationLib.sol structHash)', () => {
  it('produces a deterministic 32-byte hash for the same UserOperation', () => {
    const op = baseUserOp()
    const h1 = hashUserOp(op)
    const h2 = hashUserOp(op)
    expect(h1.length).toBe(32)
    expect(bytesToHex(h1)).toBe(bytesToHex(h2))
  })

  it('SECURITY (replay): two UserOperations differing only in nonce hash to different digests', () => {
    const op1 = baseUserOp({ nonce: 0n })
    const op2 = baseUserOp({ nonce: 1n })
    expect(bytesToHex(hashUserOp(op1))).not.toBe(bytesToHex(hashUserOp(op2)))
  })

  it('two UserOperations differing only in callData hash to different digests', () => {
    const op1 = baseUserOp({ callData: '0x' })
    const op2 = baseUserOp({ callData: '0xdeadbeef' })
    expect(bytesToHex(hashUserOp(op1))).not.toBe(bytesToHex(hashUserOp(op2)))
  })

  it('two UserOperations differing only in sender hash to different digests', () => {
    const op1 = baseUserOp({ sender: SAFE_ADDRESS })
    const op2 = baseUserOp({ sender: '0x' + '22'.repeat(20) })
    expect(bytesToHex(hashUserOp(op1))).not.toBe(bytesToHex(hashUserOp(op2)))
  })
})

describe('domainSeparator (OpenZeppelin EIP712, DOMAIN_NAME="ERC4337", DOMAIN_VERSION="1")', () => {
  it('produces a deterministic 32-byte value for the same chainId/entryPoint', () => {
    const d1 = domainSeparator(CHAIN_ID, ENTRY_POINT)
    const d2 = domainSeparator(CHAIN_ID, ENTRY_POINT)
    expect(d1.length).toBe(32)
    expect(bytesToHex(d1)).toBe(bytesToHex(d2))
  })

  it('differs across chainId — the same UserOp must not be replayable cross-chain', () => {
    const mainnet = domainSeparator(1n, ENTRY_POINT)
    const sepolia = domainSeparator(11155111n, ENTRY_POINT)
    expect(bytesToHex(mainnet)).not.toBe(bytesToHex(sepolia))
  })

  it('differs across entryPointAddress — the same UserOp must not be replayable against a different EntryPoint deployment', () => {
    const d1 = domainSeparator(CHAIN_ID, ENTRY_POINT)
    const d2 = domainSeparator(CHAIN_ID, '0x' + '99'.repeat(20))
    expect(bytesToHex(d1)).not.toBe(bytesToHex(d2))
  })
})

describe('getUserOpHash (EntryPoint.sol getUserOpHash — full EIP-712 digest)', () => {
  it('is deterministic and 32 bytes', () => {
    const op = baseUserOp()
    const h1 = getUserOpHash(op, CHAIN_ID, ENTRY_POINT)
    const h2 = getUserOpHash(op, CHAIN_ID, ENTRY_POINT)
    expect(h1.length).toBe(32)
    expect(bytesToHex(h1)).toBe(bytesToHex(h2))
  })

  it('differs from the bare structHash — the domain separator genuinely changes the digest', () => {
    const op = baseUserOp()
    const structHash = hashUserOp(op)
    const fullHash = getUserOpHash(op, CHAIN_ID, ENTRY_POINT)
    expect(bytesToHex(fullHash)).not.toBe(bytesToHex(structHash))
  })

  it('SECURITY (replay): the same UserOp on a different chain produces a different userOpHash', () => {
    const op = baseUserOp()
    const sepolia = getUserOpHash(op, 11155111n, ENTRY_POINT)
    const mainnet = getUserOpHash(op, 1n, ENTRY_POINT)
    expect(bytesToHex(sepolia)).not.toBe(bytesToHex(mainnet))
  })
})

describe('ERC4337CustodyProvider', () => {
  it('buildTransfer constructs a real PackedUserOperation and computes its real userOpHash', () => {
    const provider = new ERC4337CustodyProvider({ chainId: CHAIN_ID, entryPointAddress: ENTRY_POINT })
    const account = { address: SAFE_ADDRESS, custodyModel: 'ERC4337_SAFE_GUARD' }
    const unsigned = provider.buildTransfer(account, '0x' + '33'.repeat(20), '1000000000000000000')

    const payload = JSON.parse(unsigned.payload)
    expect(payload.userOp.sender).toBe(SAFE_ADDRESS)
    expect(payload.userOpHash).toMatch(/^[0-9a-f]{64}$/)

    // Recomputing independently from the payload's own userOp must match
    // the hash the provider reports — no discrepancy between what's
    // signed and what's reported. `nonce`/`preVerificationGas` come back
    // from JSON as decimal strings (bigint has no JSON literal); convert
    // before re-hashing, per buildTransfer()'s own documented contract.
    const revivedUserOp: PackedUserOperation = {
      ...payload.userOp,
      nonce: BigInt(payload.userOp.nonce),
      preVerificationGas: BigInt(payload.userOp.preVerificationGas),
    }
    const recomputed = getUserOpHash(revivedUserOp, CHAIN_ID, ENTRY_POINT)
    expect(bytesToHex(recomputed)).toBe(payload.userOpHash)
  })

  it('createEscrowAccount is a disclosed, unbuilt boundary — requires a live EVM RPC connection not available here', async () => {
    const provider = new ERC4337CustodyProvider({ chainId: CHAIN_ID, entryPointAddress: ENTRY_POINT })
    await expect(
      provider.createEscrowAccount({ tradeId: 't', buyerPubkey: '', sellerPubkey: '', arbiterPubkey: '', lockedAmount: '0' })
    ).rejects.toThrow(/live EVM RPC connection/)
  })

  it('finalize() is a disclosed, unbuilt boundary — requires a live ERC-4337 bundler endpoint not available here', async () => {
    const provider = new ERC4337CustodyProvider({ chainId: CHAIN_ID, entryPointAddress: ENTRY_POINT })
    await expect(provider.finalize({ requiredSigners: [], payload: '{}' }, [])).rejects.toThrow(/live ERC-4337 bundler/)
  })
})
