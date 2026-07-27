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
import { generateEscrowKeypair } from '@sails/sdk'
import { sailsClient } from '../lib/sailsClient'

const ESCROW_KEY_STORAGE_KEY = 'sails_ui_escrow_keypair'

interface StoredEscrowKeypair {
  privateKeyHex: string
  publicKeyHex: string
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
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
// source of truth this list mirrors.
const CLIENT_KEY_ESCROW_TYPES = new Set(['MULTISIG', 'LIGHTNING_HODL'])

export function useEscrowKey() {
  // Idempotent (the server upserts by role, see submitParticipantKey()) —
  // safe to call every time an escrow of the right type loads, no need to
  // track "already submitted" state client-side.
  const submitEscrowKeyIfNeeded = async (escrowType: string, escrowId: string) => {
    if (!CLIENT_KEY_ESCROW_TYPES.has(escrowType)) return null
    const { publicKeyHex } = loadOrCreateEscrowKeypair()
    return sailsClient.settlement.submitKey(escrowId, publicKeyHex)
  }

  return { submitEscrowKeyIfNeeded }
}
