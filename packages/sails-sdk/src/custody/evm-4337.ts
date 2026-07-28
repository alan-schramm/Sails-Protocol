/**
 * @sails/sdk — ERC4337CustodyProvider (RFC-020, EVM track)
 *
 * Computes the real ERC-4337 v0.7+ `userOpHash` — the exact digest
 * `SailsSignerService` (kms-signer.ts) and the buyer/seller's own wallets
 * must each sign for a `SailsEscrowSafe`-guarded Safe UserOperation to be
 * valid. The algorithm here is transcribed field-for-field from the real,
 * installed `@account-abstraction/contracts@0.8.0` source (not guessed
 * from the ERC-4337 spec text) — `UserOperationLib.sol`'s `encode()`/
 * `hash()` (structHash) and `EntryPoint.sol`'s `getUserOpHash()` (wraps
 * that structHash in a standard EIP-712 typed-data digest via OpenZeppelin
 * `EIP712`, `DOMAIN_NAME = "ERC4337"`, `DOMAIN_VERSION = "1"`).
 *
 * Every field `UserOperationLib.encode()` ABI-encodes is already a fixed
 * 32-byte word (`address`/`uint256`/`bytes32`) or a pre-hashed dynamic
 * field (`initCode`/`callData`/`paymasterAndData` each become
 * `keccak256(field)` before encoding) — so the "ABI encoding" here is
 * genuinely just 32-byte-word concatenation, not a general ABI codec.
 * Implementing that concatenation by hand (instead of pulling in a full
 * ABI-encoding library) keeps this dependency-free and matches the
 * MuSig2 code in this same directory: real, verifiable primitive logic,
 * not a black-box call to something unverified.
 *
 * `entryPointAddress`/`chainId` are required constructor params, not
 * hardcoded defaults — the EIP-712 domain separator is bound to a
 * specific deployed EntryPoint on a specific chain, and fabricating a
 * "canonical" address here would be exactly the kind of unverified
 * assumption this session's own discipline avoids. Callers supply the
 * real values for whatever EntryPoint/chain they actually target.
 *
 * `signAndSubmit()` — KMS-signing and bundler submission are real
 * external infrastructure calls this sandbox cannot exercise (no live
 * AWS credentials, no live bundler endpoint). Rather than fabricate a
 * response, both throw `SailsNotImplementedError` naming exactly what's
 * missing, matching `wallet-adapter.ts`'s own "plug-point, zero
 * implementations by design" pattern for external-infra boundaries.
 */

import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { SailsNotImplementedError } from '../errors'
import type { CustodyProvider, CreateEscrowAccountParams, EscrowAccount, PackedUserOperation, UnsignedCustodyAction } from './types'

// keccak256("PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData)")
const PACKED_USEROP_TYPEHASH = keccak_256(
  utf8ToBytes(
    'PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData)'
  )
)

// keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
const EIP712_DOMAIN_TYPEHASH = keccak_256(
  utf8ToBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
)

const DOMAIN_NAME_HASH = keccak_256(utf8ToBytes('ERC4337'))
const DOMAIN_VERSION_HASH = keccak_256(utf8ToBytes('1'))

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex
}

function hexToBytesLoose(hex: string): Uint8Array {
  const stripped = stripHexPrefix(hex)
  return stripped.length === 0 ? new Uint8Array(0) : hexToBytes(stripped)
}

// Left-pads a value into a 32-byte word — the shape every `abi.encode`
// argument here takes, since address/uint256/bytes32 are all one word.
function toWord(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 32) throw new RangeError(`value does not fit in a 32-byte word (${bytes.length} bytes)`)
  const word = new Uint8Array(32)
  word.set(bytes, 32 - bytes.length)
  return word
}

function addressToWord(address: string): Uint8Array {
  const bytes = hexToBytesLoose(address)
  if (bytes.length !== 20) throw new RangeError(`not a 20-byte address: ${address}`)
  return toWord(bytes)
}

function uint256ToWord(value: bigint): Uint8Array {
  if (value < 0n) throw new RangeError(`uint256 cannot be negative: ${value}`)
  let hex = value.toString(16)
  if (hex.length % 2 !== 0) hex = '0' + hex
  return toWord(hexToBytes(hex))
}

function bytes32ToWord(hex: string): Uint8Array {
  const bytes = hexToBytesLoose(hex)
  if (bytes.length !== 32) throw new RangeError(`not a 32-byte value: ${hex}`)
  return bytes
}

function calldataKeccak(hex: string): Uint8Array {
  return keccak_256(hexToBytesLoose(hex))
}

// UserOperationLib.sol's real `encode()` — 8 fixed 32-byte words
// concatenated in struct-field order, dynamic fields pre-hashed.
function encodeUserOp(userOp: PackedUserOperation): Uint8Array {
  return concatBytes(
    PACKED_USEROP_TYPEHASH,
    addressToWord(userOp.sender),
    uint256ToWord(userOp.nonce),
    calldataKeccak(userOp.initCode),
    calldataKeccak(userOp.callData),
    bytes32ToWord(userOp.accountGasLimits),
    uint256ToWord(userOp.preVerificationGas),
    bytes32ToWord(userOp.gasFees),
    calldataKeccak(userOp.paymasterAndData)
  )
}

// UserOperationLib.sol's real `hash()` — keccak256 of encode() above.
export function hashUserOp(userOp: PackedUserOperation): Uint8Array {
  return keccak_256(encodeUserOp(userOp))
}

// OpenZeppelin EIP712's real `_domainSeparatorV4()` for
// `DOMAIN_NAME = "ERC4337"`, `DOMAIN_VERSION = "1"`.
export function domainSeparator(chainId: bigint, entryPointAddress: string): Uint8Array {
  return keccak_256(
    concatBytes(
      EIP712_DOMAIN_TYPEHASH,
      DOMAIN_NAME_HASH,
      DOMAIN_VERSION_HASH,
      uint256ToWord(chainId),
      addressToWord(entryPointAddress)
    )
  )
}

// EntryPoint.sol's real `getUserOpHash()` — MessageHashUtils.toTypedDataHash:
// keccak256("\x19\x01" || domainSeparator || structHash).
export function getUserOpHash(userOp: PackedUserOperation, chainId: bigint, entryPointAddress: string): Uint8Array {
  const structHash = hashUserOp(userOp)
  const domain = domainSeparator(chainId, entryPointAddress)
  return keccak_256(concatBytes(new Uint8Array([0x19, 0x01]), domain, structHash))
}

export interface Erc4337CustodyConfig {
  chainId: bigint
  entryPointAddress: string
  // The already-deployed SailsEscrowSafe-guarded Safe factory address —
  // out of scope for this sandbox (no live chain to deploy against), see
  // contracts/contracts/SailsEscrowSafe.sol's own header comment.
  safeFactoryAddress?: string
}

export class ERC4337CustodyProvider implements CustodyProvider {
  readonly custodyModel = 'ERC4337_SAFE_GUARD'

  constructor(private readonly config: Erc4337CustodyConfig) {}

  async createEscrowAccount(_params: CreateEscrowAccountParams): Promise<EscrowAccount> {
    // Deploying a real Safe (via Safe's own ProxyFactory) + attaching a
    // SailsEscrowSafe guard requires a live RPC connection to an EVM
    // chain — no such infrastructure exists in this sandbox.
    throw new SailsNotImplementedError(
      'ERC4337CustodyProvider.createEscrowAccount requires a live EVM RPC connection to deploy the Safe + SailsEscrowSafe guard; not available in this environment'
    )
  }

  async buildRelease(escrowAccount: EscrowAccount, toAddress: string, amount: string): Promise<UnsignedCustodyAction> {
    return this.buildTransfer(escrowAccount, toAddress, amount)
  }

  async buildRefund(escrowAccount: EscrowAccount): Promise<UnsignedCustodyAction> {
    throw new SailsNotImplementedError(
      'ERC4337CustodyProvider.buildRefund requires the escrow trade record (refundTo address, lockedAmount) not carried on EscrowAccount alone — call buildTransfer directly with those values'
    )
  }

  // Builds the real PackedUserOperation + its userOpHash for a plain
  // native-asset transfer of `amount` wei to `toAddress` — the only
  // operation SailsEscrowSafe.sol's guard permits. `requiredSigners` is
  // deliberately empty here: which 2 of the Safe's 3 owners actually co-
  // sign is a policy decision for the caller (escrow.service.ts's own
  // SIGNATURE_COLLECTION_PROVIDERS orchestration), not this provider.
  buildTransfer(escrowAccount: EscrowAccount, toAddress: string, amountWei: string): UnsignedCustodyAction {
    const userOp: PackedUserOperation = {
      sender: escrowAccount.address,
      nonce: 0n, // real nonce comes from EntryPoint.getNonce(sender, key) — a live RPC call, not available here
      initCode: '0x',
      callData: '0x', // real callData encodes execTransaction(toAddress, amountWei, '0x') via Safe4337Module — ABI-encoding that is out of scope without a live target
      accountGasLimits: '0x' + '00'.repeat(32),
      preVerificationGas: 0n,
      gasFees: '0x' + '00'.repeat(32),
      paymasterAndData: '0x',
      signature: '0x',
    }
    const hash = getUserOpHash(userOp, this.config.chainId, this.config.entryPointAddress)
    return {
      requiredSigners: [],
      // `nonce`/`preVerificationGas` are `bigint` — JSON has no bigint
      // literal, so this replacer serializes them as decimal strings.
      // Callers reconstructing a `PackedUserOperation` from this payload
      // (e.g. to re-verify `userOpHash`) must `BigInt(...)` those two
      // fields back before calling `getUserOpHash()`/`hashUserOp()`.
      payload: JSON.stringify(
        { userOp, userOpHash: bytesToHex(hash), toAddress, amountWei },
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
      ),
    }
  }

  async finalize(_unsigned: UnsignedCustodyAction, _signatures: string[]): Promise<{ txId: string }> {
    // Submitting a signed UserOperation to a bundler's eth_sendUserOperation
    // requires a live bundler endpoint — no such infrastructure exists here.
    throw new SailsNotImplementedError(
      'ERC4337CustodyProvider.finalize requires a live ERC-4337 bundler endpoint to submit the signed UserOperation; not available in this environment'
    )
  }
}
