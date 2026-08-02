/**
 * Client-held escrow key (MULTISIG/LIGHTNING_HODL) — the buyer/seller
 * half of the non-custodial upgrade to those two escrow types
 * (`src/modules/open-settlement/multisig.provider.ts`,
 * `lightning-hodl.provider.ts`). Same disclosed demo-shortcut pattern
 * `AuthContext.tsx` already uses for the Ed25519 identity key: the
 * private key is generated and held in this browser's own localStorage,
 * never sent anywhere — only the public key ever leaves, via
 * `sailsClient.settlement.submitKey()`. A real wallet integration would
 * keep this in the wallet's own secure storage instead.
 *
 * One key is reused across every MULTISIG/LIGHTNING_HODL escrow this
 * browser profile participates in, rather than a fresh key per trade
 * (HodlHodl's own real design derives one per contract) — kept simple
 * here since this is a reference implementation, not production custody;
 * a real wallet integration could derive per-trade keys instead without
 * changing anything on the server side (it only ever sees a pubkey).
 */
import { generateEscrowKeypair, signEscrowPsbt, signEscrowArkTx } from '@sails/sdk'
import { sailsClient } from '../lib/sailsClient'

const ESCROW_KEY_STORAGE_KEY = 'sails_ui_escrow_keypair'

interface StoredEscrowKeypair {
  privateKeyHex: string
  publicKeyHex: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  return bytes
}

function loadOrCreateEscrowKeypair(): StoredEscrowKeypair {
  const raw = localStorage.getItem(ESCROW_KEY_STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.privateKeyHex && parsed?.publicKeyHex) return parsed
    } catch {
      // fall through and regenerate — a corrupted entry shouldn't block trading
    }
  }
  const kp = generateEscrowKeypair()
  const stored: StoredEscrowKeypair = { privateKeyHex: bytesToHex(kp.privateKey), publicKeyHex: kp.publicKeyHex }
  localStorage.setItem(ESCROW_KEY_STORAGE_KEY, JSON.stringify(stored))
  return stored
}

// Escrow types whose address/script depends on a client-submitted pubkey
// — see NON_CUSTODIAL_PROVIDERS in escrow.service.ts, the server-side
// source of truth this list mirrors. SAFE_GUARD_EVM added 2026-08-02
// (RFC-020) — its own getDepositAddress()/owners() need the same
// 33-byte compressed secp256k1 pubkey format MULTISIG already submits
// (safe-guard-evm.provider.ts's own SafeGuardEvmEscrowInput comment:
// "same as MULTISIG"), so no new key format is needed here.
const PUBKEY_SUBMISSION_ESCROW_TYPES = new Set(['MULTISIG', 'LIGHTNING_HODL', 'SAFE_GUARD_EVM'])

// Deliberately narrower than PUBKEY_SUBMISSION_ESCROW_TYPES above —
// submitting a pubkey is just data, but SIGNING for SAFE_GUARD_EVM means
// producing a real ECDSA signature over an ERC-4337 UserOperation hash,
// a different routine from signEscrowPsbt()/signEscrowArkTx() (Bitcoin
// PSBT / Ark tx formats) even though all three ultimately use secp256k1.
// @sails/sdk has no such signing primitive yet (only parseSafeGuardBundle()
// to read the bundle, nothing to sign it) — calling either existing
// signer on a SAFE_GUARD_EVM bundle would produce a garbage signature,
// not a "not yet implemented" error, so this stays MULTISIG/LIGHTNING_HODL
// only until that primitive is real.
const CLIENT_SIGNING_ESCROW_TYPES = new Set(['MULTISIG', 'LIGHTNING_HODL'])

export function useEscrowKey() {
  // Idempotent (the server upserts by role, see submitParticipantKey()) —
  // safe to call every time an escrow of the right type loads, no need to
  // track "already submitted" state client-side.
  const submitEscrowKeyIfNeeded = async (escrowType: string, escrowId: string) => {
    if (!PUBKEY_SUBMISSION_ESCROW_TYPES.has(escrowType)) return null
    const { publicKeyHex } = loadOrCreateEscrowKeypair()
    return sailsClient.settlement.submitKey(escrowId, publicKeyHex)
  }

  // Phase 2 (2026-07-27) — MULTISIG and LIGHTNING_HODL both use client
  // signature collection now (escrow.service.ts's
  // SIGNATURE_COLLECTION_PROVIDERS). If a release/refund round is in
  // flight for this escrow and the current participant is one of its
  // required signers, signs the unsigned bundle with this browser's
  // stored escrow key and submits it — MULTISIG via `signEscrowPsbt()`
  // (bitcoinjs-lib PSBT), LIGHTNING_HODL via `signEscrowArkTx()`
  // (`@arkade-os/sdk`'s `SingleKey`, a JSON bundle of Ark tx + checkpoint
  // PSBTs — see `lightning-hodl.provider.ts`'s own header comment for
  // why). Both use the SAME client-held private key (one raw secp256k1
  // key genuinely serves both formats). Idempotent (server upserts by
  // participantId) and a safe no-op when no round is in flight or this
  // participant isn't a required signer — same "call speculatively"
  // pattern as submitEscrowKeyIfNeeded above.
  const signAndSubmitPendingTransactionIfNeeded = async (escrowType: string, escrowId: string, participantId: string) => {
    if (!CLIENT_SIGNING_ESCROW_TYPES.has(escrowType)) return null
    let pending
    try {
      pending = await sailsClient.settlement.getPendingTransaction(escrowId)
    } catch {
      return null // no signing round in flight for this escrow — nothing to do
    }
    if (!pending.requiredSigners.includes(participantId)) return null

    const { privateKeyHex } = loadOrCreateEscrowKeypair()
    const privateKey = hexToBytes(privateKeyHex)
    const signedPsbtBase64 = escrowType === 'LIGHTNING_HODL'
      ? await signEscrowArkTx(pending.unsignedPsbtBase64, privateKey)
      : signEscrowPsbt(pending.unsignedPsbtBase64, privateKey)
    return sailsClient.settlement.submitTransactionSignature(escrowId, signedPsbtBase64)
  }

  return { submitEscrowKeyIfNeeded, signAndSubmitPendingTransactionIfNeeded }
}
