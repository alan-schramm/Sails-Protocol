/**
 * @satsails/p2p-trading-sdk — client-side signing for SAFE_GUARD_EVM escrow release/refund.
 *
 * The third leg of the same client-held-keys pattern `escrow-key.ts`'s
 * `signEscrowPsbt()` (MULTISIG) and `escrow-ark-signing.ts`'s
 * `signEscrowArkTx()` (LIGHTNING_HODL) already cover — same
 * `EscrowKeypair.privateKey` (raw 32-byte secp256k1, `generateEscrowKeypair()`),
 * a different wire format because Safe's `checkNSignatures()` needs a
 * standard 65-byte Ethereum (r||s||v) signature, not a PSBT input
 * signature or a Schnorr one.
 *
 * UI-audit gap (2026-08-03, sails-ui SLC audit relayed via the parallel
 * UI session): `parseSafeGuardBundle()` could read a bundle's
 * `userOpHash` but nothing in this SDK could actually sign it — every
 * disputed SAFE_GUARD_EVM trade was permanently stuck at "awaiting
 * counterparty signature" for a signature no client code could ever
 * produce. `safe-guard-evm.provider.ts`'s own `finalizeBundle()` expects
 * exactly what this produces: each submitted `signedPsbtBase64` string is
 * a bare 65-byte hex signature over `bundle.userOpHash` (that field name
 * is generic across every escrow type's pending-transaction row, per
 * `settlement.ts`'s own header comment — it is never actually PSBT bytes
 * here), which the provider recovers a signer address from
 * (`recoverSignerAddress()`) and sorts into Safe's real ascending-address
 * packed-signature order before broadcasting. There is no separate
 * "unsigned userOp" object to sign here — the server already reduced it
 * to a single 32-byte digest (`bundle.userOpHash`, ERC-4337
 * `EntryPoint.getUserOpHash()`'s real output, per `evm-4337.ts`'s own
 * header comment) before this bundle was ever handed to a client, so
 * signing it is a direct digest signature, not a hash-then-sign step.
 *
 * Deliberately reuses `custody/kms-signer.ts`'s `toEthereumSignature()` —
 * the exact recovery-bit-brute-force-against-a-known-public-key logic
 * `SailsSignerService`'s KMS-backed arbiter co-signer already relies on
 * and already has real test coverage for (`tests/custody-kms-signer.test.ts`).
 * The only difference from the KMS path is that this key is held in
 * plaintext by the caller (never sent anywhere) instead of behind a KMS
 * `Sign` call, so the "expected public key" `toEthereumSignature()` needs
 * is derived directly from `privateKey` here rather than fetched via
 * `GetPublicKeyCommand`.
 *
 * `secp256k1.sign(digest, privateKey, { prehash: false })` — `prehash:
 * false` because `digest` is already the 32-byte keccak256 userOpHash,
 * matching `kms-signer.ts`'s own `MessageType: 'DIGEST'` framing exactly
 * (don't hash what's already a hash). `@noble/curves`'s ECDSA `sign()`
 * defaults to a low-S signature (its own documented `lowS` policy
 * default), so — unlike `kms-signer.ts`'s `parseDerSignature()`, which
 * has to normalize AWS KMS's possibly-high-S DER output — no manual
 * high-S check is needed for a signature this code produced itself.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { toEthereumSignature } from '../custody/kms-signer'
import { parseSafeGuardBundle } from './settlement'

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex
}

/**
 * Signs a SAFE_GUARD_EVM escrow's pending bundle (the raw
 * `unsignedPsbtBase64` string from `initiateRelease()`/`initiateRefund()`/
 * `getPendingTransaction()` — the same generic field name every escrow
 * type's pending transaction carries) with a client-held `EscrowKeypair.privateKey`.
 * Returns a 65-byte hex-encoded Ethereum signature (`0x` + r||s||v, 130
 * hex chars), ready for `SailsSettlementModule.submitTransactionSignature()`.
 */
export function signEscrowSafeUserOp(unsignedPsbtBase64: string, privateKey: Uint8Array): string {
  const bundle = parseSafeGuardBundle(unsignedPsbtBase64)
  const digest = hexToBytes(stripHexPrefix(bundle.userOpHash))

  const sigBytes = secp256k1.sign(digest, privateKey, { prehash: false })
  const sig = secp256k1.Signature.fromBytes(sigBytes, 'compact')
  const uncompressedPubkey = secp256k1.getPublicKey(privateKey, false)

  const ethSig = toEthereumSignature(sig, digest, uncompressedPubkey)
  return '0x' + bytesToHex(ethSig)
}
