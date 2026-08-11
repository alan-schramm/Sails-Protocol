/**
 * @satsails/p2p-trading-sdk — client-side signing for LIGHTNING_HODL (Arkade) escrow
 * release/refund (Phase 2, 2026-07-27).
 *
 * The Arkade equivalent of `escrow-key.ts`'s `signEscrowPsbt()` — same
 * client-held `EscrowKeypair.privateKey` (`generateEscrowKeypair()`,
 * shared across both MULTISIG and LIGHTNING_HODL, see that file's own
 * header comment), but Ark's offchain tx format needs `@arkade-os/sdk`'s
 * own signer (`SingleKey`) and tx type (`@scure/btc-signer`'s
 * `Transaction`, what `buildOffchainTx()` actually returns), not
 * bitcoinjs-lib/ECPair.
 *
 * Wire format: `lightning-hodl.provider.ts`'s `buildUnsignedRelease()`/
 * `buildUnsignedRefund()` hand back a JSON string
 * (`{ arkTxPsbtBase64, checkpointsPsbtBase64[] }`), not a bare PSBT — an
 * Ark offchain tx needs its main tx AND a per-input checkpoint tx signed
 * together, unlike a single Bitcoin PSBT. This function parses that JSON,
 * signs both, and re-serializes the same shape for submission via
 * `SailsSettlementModule.submitTransactionSignature()`.
 *
 * Verified experimentally before this was written (mirrors every prior
 * provider's "verify before build" discipline this session): `SingleKey`
 * needs nothing but the raw private key to sign — no ASP connection, no
 * wallet/seed machinery — and the subset of `@arkade-os/sdk` this
 * function touches (`SingleKey`, plus `@scure/btc-signer`'s
 * `Transaction`) bundles cleanly for a browser target (esbuild,
 * `platform: 'browser'`) with zero Node-core imports detected in the
 * output. `@scure/btc-signer`'s `Transaction.toPSBT()`/`fromPSBT()`
 * round-trip was confirmed to preserve everything `SingleKey.sign()`
 * needs (the taproot leaf-script spending info), the same PSBT wire
 * format `escrow-key.ts`'s `signEscrowPsbt()` uses for MULTISIG.
 */
import { SingleKey } from '@arkade-os/sdk'
import { Transaction } from '@scure/btc-signer'

interface ArkPendingBundle {
  arkTxPsbtBase64: string
  checkpointsPsbtBase64: string[]
}

export async function signEscrowArkTx(bundleJson: string, privateKey: Uint8Array): Promise<string> {
  const parsed = JSON.parse(bundleJson) as ArkPendingBundle
  const key = SingleKey.fromPrivateKey(privateKey)

  const arkTx = Transaction.fromPSBT(Buffer.from(parsed.arkTxPsbtBase64, 'base64'))
  const signedArkTx = await key.sign(arkTx, [0])

  const checkpointsPsbtBase64 = await Promise.all(
    parsed.checkpointsPsbtBase64.map(async (b) => {
      const checkpoint = Transaction.fromPSBT(Buffer.from(b, 'base64'))
      const signed = await key.sign(checkpoint, [0])
      return Buffer.from(signed.toPSBT()).toString('base64')
    })
  )

  const signed: ArkPendingBundle = {
    arkTxPsbtBase64: Buffer.from(signedArkTx.toPSBT()).toString('base64'),
    checkpointsPsbtBase64,
  }
  return JSON.stringify(signed)
}
