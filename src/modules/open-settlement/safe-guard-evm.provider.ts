/**
 * Sails OpenSettlement — SAFE_GUARD_EVM (Safe Transaction Guard + ERC-4337) SettlementProvider
 *
 * RFC-020's real, wired-in (but not-yet-deployable) EVM custody path —
 * fulfills RFC-019 Phase 2. Same custody-model shape MULTISIG/
 * LIGHTNING_HODL already use: buyer and seller each hold their own key
 * client-side (`@sails/sdk`'s `generateEscrowKeypair()` — the SAME
 * compressed secp256k1 keypair already submitted via
 * `POST /v1/settlement/escrow/:id/submit-key`/`EscrowParticipantKey`,
 * reused as-is rather than inventing a second key-submission mechanism);
 * the one server-held key is the arbiter co-signer, and it lives in AWS
 * KMS (`SailsSignerService`, imported from `@sails/sdk` rather than
 * duplicated here — the userOpHash a co-signer signs must be
 * byte-identical on both client and server, so sharing the real,
 * already-tested implementation is safer than a second hand-written copy
 * that could silently drift).
 *
 * What's real here: constructing a real `PackedUserOperation` and its
 * real `userOpHash` (`@sails/sdk`'s `getUserOpHash()`, transcribed from
 * the actual installed `EntryPoint.sol`/`UserOperationLib.sol` source —
 * see `evm-4337.ts`'s own header); recovering each submitted ECDSA
 * signature's real signer address and combining them into Safe's real,
 * documented ascending-address-sorted packed-signature format
 * (`checkNSignatures()` in `Safe.sol`, read directly before this was
 * written). What is NOT real, and throws a clearly-named `EscrowError`
 * rather than fabricate a result: deploying/verifying a Safe on-chain
 * (`lockFunds()`/`verifyLock()` — needs a live EVM RPC), pre-signing as
 * the KMS arbiter on the disputed path (`SailsSignerService.signDigest()`
 * — needs real AWS credentials, none configured here), and actually
 * broadcasting a finalized UserOperation (`broadcast()` — needs a live
 * ERC-4337 bundler endpoint). Same disclosed-boundary discipline
 * `multisig.provider.ts`/`lightning-hodl.provider.ts` already established
 * for their own real-but-unexercised-against-live-funds gaps.
 *
 * `lockedAmount` is a Decimal string (RFC-009) — converted to wei via
 * exact string/BigInt math (`weiFromDecimalString` below), deliberately
 * NOT `multisig.provider.ts`'s own `Math.round(parseFloat(x) * 1e8)`
 * pattern: satoshi-scale (1e8) float conversion is an accepted existing
 * precedent for realistic trade sizes, but wei-scale (1e18) is a real,
 * much larger precision-loss risk RFC-009 exists specifically to avoid.
 *
 * Testnet-target only (Sepolia default). `AWS_KMS_KEY_ID` empty by
 * default — same "surface a clear config error, don't refuse to boot"
 * pattern as `MULTISIG_SEED`/`WDK_SEED_PHRASE`. The cooperative
 * (buyer+seller, no arbiter) release/refund path needs no AWS access at
 * all — only the disputed path touches KMS.
 */
import { getUserOpHash, SailsSignerService, ethereumAddressFromUncompressedPubkey, type PackedUserOperation } from '@sails/sdk'
// This file resolves @noble/curves from the ROOT node_modules (v1.2.0,
// real dual CJS/ESM, hoisted there with no version conflict) — a
// DIFFERENT resolution than packages/sails-sdk's own files get (forced
// to v2.x there by @arkade-os/sdk's transitive tree, see jest.config.js's
// own header comment). Confirmed via a real `node -e` probe against
// this exact install before writing this file, not assumed from the SDK
// code: v1.x uses `ProjectivePoint`/`Signature.fromCompact`/
// `.toRawBytes()`/`.recovery`, not v2.x's `Point`/`Signature.fromBytes`/
// `.toBytes()`/`.addRecoveryBit()` return shape.
import { secp256k1 } from '@noble/curves/secp256k1'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import type { SettlementProvider } from './escrow.service'

const ZERO_BYTES32 = '0x' + '00'.repeat(32)

export type SafeGuardEvmEscrowInput = {
  tradeId: string
  lockedAmount: string
  buyerPubkey?: string   // hex, 33-byte compressed secp256k1 — from EscrowParticipantKey, same as MULTISIG
  sellerPubkey?: string  // hex, 33-byte compressed secp256k1
  buyerId?: string
  sellerId?: string
  multisigAddr?: string | null // reused generic column — the deployed Safe's address, once real deployment exists
  status?: string
  triggeredBy?: string
}

// Exact string/BigInt decimal-to-wei conversion — no floats, no
// precision loss, per this file's own header comment.
export function weiFromDecimalString(decimal: string): bigint {
  const negative = decimal.startsWith('-')
  const unsigned = negative ? decimal.slice(1) : decimal
  const [intPart, fracPart = ''] = unsigned.split('.')
  if (fracPart.length > 18) {
    throw new EscrowError(`SAFE_GUARD_EVM provider: lockedAmount '${decimal}' has more than 18 decimal places — cannot represent as wei without precision loss`)
  }
  const paddedFrac = fracPart.padEnd(18, '0')
  const wei = BigInt(intPart || '0') * 10n ** 18n + BigInt(paddedFrac || '0')
  return negative ? -wei : wei
}

// Decompresses a client-submitted 33-byte compressed pubkey and derives
// its real Ethereum address — the same real point-decompression +
// keccak256 derivation `@sails/sdk`'s `ethereumAddressFromUncompressedPubkey()`
// already implements and tests, reused rather than duplicated.
export function ethereumAddressFromCompressedHex(hex: string | undefined, role: 'buyer' | 'seller', tradeId: string): string {
  if (!hex) {
    throw new EscrowError(
      `SAFE_GUARD_EVM provider requires a submitted ${role} pubkey for trade ${tradeId} — call POST /v1/settlement/escrow/:id/submit-key first (see EscrowParticipantKey)`
    )
  }
  const compressed = hexToBytes(hex)
  if (compressed.length !== 33) {
    throw new EscrowError(`SAFE_GUARD_EVM provider: ${role} pubkey for trade ${tradeId} must be a 33-byte compressed secp256k1 key, got ${compressed.length} bytes`)
  }
  const uncompressed = secp256k1.ProjectivePoint.fromHex(compressed).toRawBytes(false)
  return ethereumAddressFromUncompressedPubkey(uncompressed)
}

// Recovers a submitted 65-byte (r||s||v) Ethereum signature's real
// signer address against a known digest — the inverse of
// `@sails/sdk`'s `toEthereumSignature()`, needed here to sort submitted
// signatures into Safe's real ascending-address order before combining.
export function recoverSignerAddress(signatureHex: string, digest: Uint8Array): string {
  let sig: Uint8Array
  try {
    sig = hexToBytes(signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex)
  } catch (err) {
    throw new EscrowError(`SAFE_GUARD_EVM provider: '${signatureHex}' is not valid hex: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (sig.length !== 65) throw new EscrowError(`SAFE_GUARD_EVM provider: expected a 65-byte (r,s,v) signature, got ${sig.length} bytes`)
  const v = sig[64]
  if (v !== 27 && v !== 28) throw new EscrowError(`SAFE_GUARD_EVM provider: signature's recovery byte must be 27 or 28, got ${v}`)
  let recovered: Uint8Array
  try {
    recovered = secp256k1.Signature.fromCompact(sig.slice(0, 64))
      .addRecoveryBit(v - 27)
      .recoverPublicKey(digest)
      .toRawBytes(false)
  } catch (err) {
    throw new EscrowError(`SAFE_GUARD_EVM provider: failed to recover a signer address from the submitted signature: ${err instanceof Error ? err.message : String(err)}`)
  }
  return ethereumAddressFromUncompressedPubkey(recovered)
}

interface SerializedUserOp extends Omit<PackedUserOperation, 'nonce' | 'preVerificationGas'> {
  nonce: string
  preVerificationGas: string
}

interface SafeGuardBundle {
  path: 'COOPERATIVE' | 'DISPUTED_RELEASE' | 'DISPUTED_REFUND'
  userOp: SerializedUserOp
  userOpHash: string // hex, no 0x prefix
  toAddress: string
  preEmbeddedSignature?: { address: string; signatureHex: string } // arbiter's, disputed path only
}

function serializeUserOp(userOp: PackedUserOperation): SerializedUserOp {
  return { ...userOp, nonce: userOp.nonce.toString(), preVerificationGas: userOp.preVerificationGas.toString() }
}

function deserializeUserOp(serialized: SerializedUserOp): PackedUserOperation {
  return { ...serialized, nonce: BigInt(serialized.nonce), preVerificationGas: BigInt(serialized.preVerificationGas) }
}

export class SafeGuardEvmProvider implements SettlementProvider {
  name = 'SAFE_GUARD_EVM'
  readonly custodyModel = 'client-held-buyer-seller-keys-server-held-kms-arbiter' as const

  private signerService(): SailsSignerService {
    if (!config.safeGuardEvm.kmsKeyId) {
      throw new EscrowError(
        'SAFE_GUARD_EVM provider requires AWS_KMS_KEY_ID configured (.env.example) — refusing to attempt arbiter co-signing without a real KMS key'
      )
    }
    return new SailsSignerService({ region: config.safeGuardEvm.kmsRegion, keyId: config.safeGuardEvm.kmsKeyId })
  }

  private requireSafeAddress(escrow: SafeGuardEvmEscrowInput): string {
    if (!escrow.multisigAddr) {
      throw new EscrowError(
        `SAFE_GUARD_EVM provider: no deployed Safe address recorded for trade ${escrow.tradeId} — lockFunds() must succeed first, ` +
        'which requires live EVM RPC infrastructure this environment does not have.'
      )
    }
    return escrow.multisigAddr
  }

  private buildUserOp(escrow: SafeGuardEvmEscrowInput, toAddress: string): PackedUserOperation {
    return {
      sender: this.requireSafeAddress(escrow),
      // Real nonce comes from EntryPoint.getNonce(sender, key) — a live
      // RPC call, not available here. Same disclosed gap
      // evm-4337.ts's own buildTransfer() already has.
      nonce: 0n,
      initCode: '0x',
      // Real callData encodes Safe4337Module's execTransaction(toAddress,
      // amountWei, '0x') — needs the live target Safe's module address to
      // ABI-encode correctly, out of scope without a live deployment.
      callData: '0x',
      accountGasLimits: ZERO_BYTES32,
      preVerificationGas: 0n,
      gasFees: ZERO_BYTES32,
      paymasterAndData: '0x',
      signature: '0x',
    }
  }

  private async buildBundle(
    escrow: SafeGuardEvmEscrowInput,
    toAddress: string,
    disputedPath: 'DISPUTED_RELEASE' | 'DISPUTED_REFUND'
  ): Promise<{ psbtBase64: string; requiredSigners: string[] }> {
    const userOp = this.buildUserOp(escrow, toAddress)
    const hash = getUserOpHash(userOp, config.safeGuardEvm.chainId, config.safeGuardEvm.entryPointAddress)
    const bundle: SafeGuardBundle = {
      path: escrow.status === 'DISPUTED' ? disputedPath : 'COOPERATIVE',
      userOp: serializeUserOp(userOp),
      userOpHash: bytesToHex(hash),
      toAddress,
    }

    if (escrow.status === 'DISPUTED') {
      const signer = this.signerService()
      const [signatureHex, address] = await Promise.all([
        signer.signDigest(hash).then(bytesToHex),
        signer.getAddress(),
      ])
      bundle.preEmbeddedSignature = { address, signatureHex }
      const requiredId = disputedPath === 'DISPUTED_RELEASE' ? escrow.buyerId : escrow.sellerId
      if (!requiredId) {
        throw new EscrowError(`SAFE_GUARD_EVM provider: missing ${disputedPath === 'DISPUTED_RELEASE' ? 'buyerId' : 'sellerId'} for disputed ${disputedPath.toLowerCase()} of trade ${escrow.tradeId}`)
      }
      return { psbtBase64: JSON.stringify(bundle), requiredSigners: [requiredId] }
    }

    if (!escrow.buyerId || !escrow.sellerId) {
      throw new EscrowError(`SAFE_GUARD_EVM provider: missing buyerId/sellerId for cooperative release/refund of trade ${escrow.tradeId}`)
    }
    return { psbtBase64: JSON.stringify(bundle), requiredSigners: [escrow.buyerId, escrow.sellerId] }
  }

  // Cooperative path: both buyer+seller required, arbiter never touched.
  // Disputed path: KMS arbiter pre-signs now (favoring the RELEASE
  // ruling), only the buyer is a real pending client signature.
  async buildUnsignedRelease(escrow: SafeGuardEvmEscrowInput, toAddress: string): Promise<{ psbtBase64: string; requiredSigners: string[] }> {
    return this.buildBundle(escrow, toAddress, 'DISPUTED_RELEASE')
  }

  // Mirror of buildUnsignedRelease(), refund-to-seller. Refund address =
  // the seller's own client-submitted-pubkey-derived Ethereum address —
  // same reference-stand-in gap dispute.service.ts's own comment already
  // flags for WDK's releaseToAddress, and the exact EVM analog of
  // MULTISIG's p2wpkh(sellerPubkey) refund address.
  async buildUnsignedRefund(escrow: SafeGuardEvmEscrowInput): Promise<{ psbtBase64: string; requiredSigners: string[]; toAddress: string }> {
    const toAddress = ethereumAddressFromCompressedHex(escrow.sellerPubkey, 'seller', escrow.tradeId)
    const result = await this.buildBundle(escrow, toAddress, 'DISPUTED_REFUND')
    return { ...result, toAddress }
  }

  // Real, tested logic: recovers each submitted signature's real signer
  // address, adds the pre-embedded arbiter one if present, sorts
  // ascending by address (Safe's real, documented checkNSignatures()
  // requirement — verified by reading Safe.sol directly before this was
  // written), and concatenates into Safe's real packed-signature format
  // (65 bytes per signer, no padding/separators). What happens after —
  // actually submitting this to a bundler — needs live infrastructure
  // this environment doesn't have.
  private async finalizeBundle(escrow: SafeGuardEvmEscrowInput, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }> {
    let bundle: SafeGuardBundle
    try {
      bundle = JSON.parse(unsignedPsbtBase64)
    } catch (err) {
      throw new EscrowError(`SAFE_GUARD_EVM provider: failed to parse the stored bundle for trade ${escrow.tradeId}: ${err instanceof Error ? err.message : String(err)}`)
    }
    const digest = hexToBytes(bundle.userOpHash)

    const signatures: { address: string; signatureHex: string }[] = []
    if (bundle.preEmbeddedSignature) signatures.push(bundle.preEmbeddedSignature)
    for (const signatureHex of signedPsbtBase64List) {
      const address = recoverSignerAddress(signatureHex, digest)
      signatures.push({ address, signatureHex })
    }
    if (signatures.length === 0) {
      throw new EscrowError(`SAFE_GUARD_EVM provider: no signatures to finalize for trade ${escrow.tradeId}`)
    }

    signatures.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))
    const combined = '0x' + signatures.map((s) => (s.signatureHex.startsWith('0x') ? s.signatureHex.slice(2) : s.signatureHex)).join('')

    const userOp = deserializeUserOp(bundle.userOp)
    return this.broadcast(userOp, combined)
  }

  private async broadcast(_userOp: PackedUserOperation, _combinedSignature: string): Promise<{ txId: string }> {
    throw new EscrowError(
      'SAFE_GUARD_EVM provider: broadcasting a finalized UserOperation requires a live EVM RPC connection and an ERC-4337 bundler ' +
      'endpoint — neither exists in this environment. The combined signature was built successfully; submission is the remaining gap.'
    )
  }

  async finalizeRelease(escrow: SafeGuardEvmEscrowInput, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }> {
    return this.finalizeBundle(escrow, unsignedPsbtBase64, signedPsbtBase64List)
  }

  async finalizeRefund(escrow: SafeGuardEvmEscrowInput, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }> {
    return this.finalizeBundle(escrow, unsignedPsbtBase64, signedPsbtBase64List)
  }

  // Real Safe deployment (CREATE2) requires a live EVM RPC to broadcast
  // the deployment transaction and confirm it landed; verifying a
  // balance similarly requires a live RPC. Both disclosed, not
  // fabricated.
  async lockFunds(escrow: SafeGuardEvmEscrowInput): Promise<{ txId: string; address: string }> {
    throw new EscrowError(
      `SAFE_GUARD_EVM provider: lockFunds() for trade ${escrow.tradeId} requires deploying a real Safe via a live EVM RPC connection — not available in this environment.`
    )
  }

  async verifyLock(escrow: SafeGuardEvmEscrowInput): Promise<boolean> {
    throw new EscrowError(
      `SAFE_GUARD_EVM provider: verifyLock() for trade ${escrow.tradeId} requires a live EVM RPC connection to check the Safe's on-chain balance — not available in this environment.`
    )
  }

  // Not directly callable — same reasoning as MULTISIG/LIGHTNING_HODL:
  // buyer/seller keys are client-held, so a real release needs the
  // multi-step signature-collection flow above instead of a single
  // synchronous call.
  async releaseFunds(escrow: SafeGuardEvmEscrowInput, _toAddress: string): Promise<{ txId: string }> {
    throw new EscrowError(
      'SAFE_GUARD_EVM provider: releaseFunds() is not directly callable — buyer/seller keys are client-held. ' +
      `Use POST /v1/settlement/escrow/${escrow.tradeId}/initiate-release, then submit-transaction-signature, instead (see escrow.service.ts).`
    )
  }

  async refundFunds(escrow: SafeGuardEvmEscrowInput): Promise<{ txId: string }> {
    throw new EscrowError(
      'SAFE_GUARD_EVM provider: refundFunds() is not directly callable — buyer/seller keys are client-held. ' +
      `Use POST /v1/settlement/escrow/${escrow.tradeId}/initiate-refund, then submit-transaction-signature, instead (see escrow.service.ts).`
    )
  }
}

export const safeGuardEvmProvider = new SafeGuardEvmProvider()
