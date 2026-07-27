/**
 * @sails/sdk — client-held escrow key generation
 *
 * The buyer/seller half of the client-held-keys upgrade to MULTISIG/
 * LIGHTNING_HODL escrow (`src/modules/open-settlement/multisig.provider.ts`,
 * `lightning-hodl.provider.ts`) — a real secp256k1 keypair generated here,
 * in the caller's own environment, never sent to the server. Only the
 * 33-byte compressed public key (`publicKeyHex` below) is ever submitted,
 * via `SailsSettlementModule.submitKey()`.
 *
 * Same architecture as `identity.ts`'s Ed25519 keypair (generate
 * client-side, hold client-side, submit the public half only) — this is
 * a DIFFERENT curve (secp256k1, not Ed25519) because Bitcoin/Ark scripts
 * need it, so it's a separate module rather than reusing identity.ts's
 * keypair for both purposes.
 *
 * `@noble/curves` — pure JS, browser-safe, no WASM (unlike
 * `tiny-secp256k1`, the backend's own choice for the same curve, which
 * would complicate this package's browser bundle target). Pinned to
 * `^1.2.0` specifically (not the newer 2.x also present elsewhere in
 * this monorepo's dependency tree via `@arkade-os/sdk`'s own
 * dependencies) — 2.x ships pure ESM with no real CJS entry point for
 * this subpath, which breaks under Jest the same way
 * `@tetherto/wdk-wallet-evm`/`@arkade-os/sdk` already do elsewhere in
 * this repo; 1.2.0 is genuinely dual CJS/ESM, confirmed directly against
 * its own `package.json` (`main`/`exports` fields), not assumed. Verified
 * experimentally before this file was written that a `@noble/curves`
 * private key produces a compressed pubkey directly compatible with
 * bitcoinjs-lib's multisig construction (`multisig.provider.ts` uses it
 * server-side) and, with the leading byte stripped, the x-only form
 * `@arkade-os/sdk`'s `MultisigTapscript` wants
 * (`lightning-hodl.provider.ts`) — one client key genuinely serves both
 * providers, not two separate ones.
 */
import { secp256k1 } from '@noble/curves/secp256k1'
import * as ecc from '@bitcoinerlab/secp256k1'
import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import { bytesToHex } from '../encoding'

bitcoin.initEccLib(ecc)
const ECPair = ECPairFactory(ecc)

export interface EscrowKeypair {
  /** Raw 32-byte secp256k1 private key — never sent anywhere. Keep this in the caller's own secure storage. */
  privateKey: Uint8Array
  /** 33-byte compressed public key — the only part ever submitted to the server (`submitKey()`). */
  publicKey: Uint8Array
  /** `publicKey`, hex-encoded — what `SailsSettlementModule.submitKey()` actually sends. */
  publicKeyHex: string
}

export function generateEscrowKeypair(): EscrowKeypair {
  const privateKey = secp256k1.utils.randomPrivateKey()
  const publicKey = secp256k1.getPublicKey(privateKey, true) // compressed, 33 bytes
  return { privateKey, publicKey, publicKeyHex: bytesToHex(publicKey) }
}

/**
 * Phase 2 (2026-07-27) — signs a MULTISIG escrow's unsigned release/refund
 * PSBT with a client-held `EscrowKeypair.privateKey`
 * (`generateEscrowKeypair()` above), for submission via
 * `SailsSettlementModule.submitTransactionSignature()`. The PSBT itself
 * comes from `initiateRelease()`/`initiateRefund()` (server-built,
 * base64-encoded, already carrying the correct `witnessUtxo`/
 * `witnessScript` for input 0 — this function only ever signs that one
 * input, matching every unsigned PSBT this flow produces).
 *
 * `@bitcoinerlab/secp256k1` — pure JS, no WASM, built specifically to
 * integrate into the BitcoinJS ecosystem without WASM (same tradeoff
 * `escrow-key.ts`'s own header comment already made for `@noble/curves`
 * over `tiny-secp256k1`, applied here to bitcoinjs-lib's own ECC
 * interface). Verified experimentally before this was written: a PSBT
 * input signed with an `@bitcoinerlab/secp256k1`-backed `ECPair` combines
 * and finalizes correctly against the backend's own
 * `tiny-secp256k1`-backed verification — the two libraries interoperate
 * on the same PSBT bytes, which is the actual requirement here (this
 * function's signature and the arbiter/counterparty's signature end up in
 * the same finalized transaction).
 */
export function signEscrowPsbt(psbtBase64: string, privateKey: Uint8Array): string {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64)
  const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey))
  psbt.signInput(0, keyPair)
  return psbt.toBase64()
}
