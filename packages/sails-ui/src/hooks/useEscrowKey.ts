/**
 * Client-held escrow key (MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM) — the
 * buyer/seller half of the non-custodial upgrade to those escrow types
 * (`src/modules/open-settlement/multisig.provider.ts`,
 * `lightning-hodl.provider.ts`, `safe-guard-evm.provider.ts`). Same
 * disclosed demo-shortcut pattern `AuthContext.tsx` already uses for the
 * Ed25519 identity key: the private key is generated and held in this
 * browser's own localStorage, never sent anywhere — only the public key
 * ever leaves, via `sailsClient.settlement.submitKey()`. A real wallet
 * integration would keep this in the wallet's own secure storage instead.
 *
 * Encrypted at rest since 2026-08-11, same fix and same reasoning as
 * AuthContext.tsx's identity key (real gap flagged live: plain-hex in
 * localStorage) — reuses the SAME derived key from AuthContext (passed
 * in below) rather than asking for the passphrase a second time. This is
 * arguably the more important of the two keys to have encrypted: unlike
 * the identity key, this one directly signs fund release/refund
 * transactions.
 *
 * One key is reused across every such escrow this browser profile
 * participates in, rather than a fresh key per trade (HodlHodl's own
 * real design derives one per contract) — kept simple here since this
 * is a reference implementation, not production custody; a real wallet
 * integration could derive per-trade keys instead without changing
 * anything on the server side (it only ever sees a pubkey).
 */
import { generateEscrowKeypair, signEscrowPsbt, signEscrowArkTx, signEscrowSafeUserOp } from '@satsails/p2p-trading-sdk'
import { sailsClient } from '../lib/sailsClient'
import { encryptBytes, decryptBytes } from '../lib/keyEncryption'

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

// Public key is stored alongside the encrypted private key, in plain
// text — it's not secret (it's the same value submitKey() sends to the
// server), so there's no reason to make the caller decrypt just to read
// it back.
interface StoredEscrowEnvelope {
  encryptedPrivateKey: string // keyEncryption.ts's packed `iv:ciphertext` format
  publicKeyHex: string
}

async function loadOrCreateEscrowKeypair(encryptionKey: CryptoKey): Promise<StoredEscrowKeypair> {
  const raw = localStorage.getItem(ESCROW_KEY_STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredEscrowEnvelope>
      if (parsed?.encryptedPrivateKey && parsed?.publicKeyHex) {
        const result = await decryptBytes(encryptionKey, parsed.encryptedPrivateKey)
        if (result.ok) return { privateKeyHex: bytesToHex(result.bytes), publicKeyHex: parsed.publicKeyHex }
        if (result.reason === 'wrong-passphrase') {
          // Real fund-safety guard: this key signs escrow release/refund
          // transactions. Silently regenerating here would orphan
          // whatever escrow this browser already submitted the OLD
          // public key for — surface the failure instead of masking it.
          throw new Error('Não foi possível desbloquear sua chave de escrow — senha incorreta.')
        }
        // reason === 'corrupt' (pre-encryption legacy entry or a
        // corrupted one) — falls through and regenerates below, same as
        // the pre-2026-08-11 behavior for a JSON.parse failure.
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('senha incorreta')) throw err
      // JSON.parse failure or missing fields — fall through and regenerate.
    }
  }
  const kp = generateEscrowKeypair()
  const envelope: StoredEscrowEnvelope = {
    encryptedPrivateKey: await encryptBytes(encryptionKey, kp.privateKey),
    publicKeyHex: kp.publicKeyHex,
  }
  localStorage.setItem(ESCROW_KEY_STORAGE_KEY, JSON.stringify(envelope))
  return { privateKeyHex: bytesToHex(kp.privateKey), publicKeyHex: kp.publicKeyHex }
}

// Escrow types whose address/script depends on a client-submitted pubkey
// — see NON_CUSTODIAL_PROVIDERS in escrow.service.ts, the server-side
// source of truth this list mirrors. SAFE_GUARD_EVM added 2026-08-02
// (RFC-020) — its own getDepositAddress()/owners() need the same
// 33-byte compressed secp256k1 pubkey format MULTISIG already submits
// (safe-guard-evm.provider.ts's own SafeGuardEvmEscrowInput comment:
// "same as MULTISIG"), so no new key format is needed here.
const PUBKEY_SUBMISSION_ESCROW_TYPES = new Set(['MULTISIG', 'LIGHTNING_HODL', 'SAFE_GUARD_EVM'])

// SAFE_GUARD_EVM added 2026-08-03 — @satsails/p2p-trading-sdk's signEscrowSafeUserOp()
// closes the gap this comment used to describe (only parseSafeGuardBundle()
// existed before, nothing to sign with). Produces a real ECDSA signature
// over the ERC-4337 UserOperation hash — a different routine from
// signEscrowPsbt()/signEscrowArkTx() (Bitcoin PSBT / Ark tx formats)
// even though all three ultimately use the same secp256k1 curve and the
// SAME client-held private key (no new key format needed, verified
// against the real backend's recoverSignerAddress() per that function's
// own doc comment).
const CLIENT_SIGNING_ESCROW_TYPES = new Set(['MULTISIG', 'LIGHTNING_HODL', 'SAFE_GUARD_EVM'])

// `encryptionKey` — the same derived key AuthContext.tsx produces from
// the user's passphrase at login, reused here rather than prompting a
// second time (see this file's own header comment). Callers only reach
// this hook while authenticated (Trade.tsx), so a null encryptionKey
// here would mean a real auth-state bug elsewhere, not a normal path —
// both functions below throw immediately rather than silently no-op-ing.
export function useEscrowKey(encryptionKey: CryptoKey | null) {
  // Idempotent (the server upserts by role, see submitParticipantKey()) —
  // safe to call every time an escrow of the right type loads, no need to
  // track "already submitted" state client-side.
  const submitEscrowKeyIfNeeded = async (escrowType: string, escrowId: string) => {
    if (!PUBKEY_SUBMISSION_ESCROW_TYPES.has(escrowType)) return null
    if (!encryptionKey) throw new Error('No encryption key available — user is not authenticated')
    const { publicKeyHex } = await loadOrCreateEscrowKeypair(encryptionKey)
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
    if (!encryptionKey) throw new Error('No encryption key available — user is not authenticated')

    const { privateKeyHex } = await loadOrCreateEscrowKeypair(encryptionKey)
    const privateKey = hexToBytes(privateKeyHex)
    const signedPsbtBase64 = escrowType === 'LIGHTNING_HODL'
      ? await signEscrowArkTx(pending.unsignedPsbtBase64, privateKey)
      : escrowType === 'SAFE_GUARD_EVM'
        ? signEscrowSafeUserOp(pending.unsignedPsbtBase64, privateKey)
        : signEscrowPsbt(pending.unsignedPsbtBase64, privateKey)
    return sailsClient.settlement.submitTransactionSignature(escrowId, signedPsbtBase64)
  }

  return { submitEscrowKeyIfNeeded, signAndSubmitPendingTransactionIfNeeded }
}
