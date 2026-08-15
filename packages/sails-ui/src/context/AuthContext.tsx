/**
 * Real session state — @satsails/p2p-trading-sdk's `identity.create()`/`authenticate()`
 * (real Ed25519 challenge-response, packages/sails-sdk/src/modules/
 * identity.ts), replacing the previous localStorage-mocked CURRENT_USER.
 *
 * Demo-only shortcut, disclosed rather than hidden: this reference UI
 * generates and stores the Ed25519 secret key in the browser's own
 * localStorage so "Conectar Carteira" has something to sign with without
 * a real external wallet extension. A real wallet integration keeps that
 * key in the wallet's own secure storage/hardware and never lets a page
 * touch it — see CRYPTOGRAPHIC_MODEL.md. This is a demonstration of the
 * protocol's real auth flow, not a template for production key custody.
 *
 * Encrypted at rest since 2026-08-11 (real gap flagged live: the secret
 * key sat in localStorage as plain hex, readable by anything that can
 * run JS on this origin — an XSS, a malicious extension, anyone with
 * browser-profile access). `login()` now takes the user's own passphrase,
 * used to derive a non-extractable AES-256-GCM key (lib/keyEncryption.ts)
 * that encrypts the stored keypair. This does NOT close the "active XSS
 * during an unlocked session" case — a script running while the key is
 * decrypted in memory can still read it, same as any browser-based
 * signer. What it closes is passive exposure: reading localStorage alone
 * is no longer enough. A real fix (external wallet) is still the only
 * complete answer — see the paragraph above.
 *
 * To demo two counterparties trading with each other, use two separate
 * browser sessions (e.g. a normal window + an incognito window) — this
 * key/session storage is per-origin, shared across tabs in the same
 * browser profile, same as any localStorage-backed session.
 *
 * `isOperator`/`toggleRole` removed 2026-08-04 — a self-assigned,
 * localStorage-toggled "operator" role had no real backend counterpart
 * (Sails' authorization model has no platform-operator/admin tier at
 * all, by design: every real read stays scoped to the calling
 * participant or a genuine assigned role like `Dispute.arbiterId`). It
 * gated a nav link to `pages/admin/Dashboard.tsx`/`ManageOffers.tsx`,
 * both deleted the same day for the same reason — see
 * feedback_no_platform_operator_visibility (memory) for the full
 * non-custodial reasoning.
 */
import React, { createContext, useContext, useState } from 'react'
import { generateKeypair, type Ed25519Keypair } from '@satsails/p2p-trading-sdk'
import type { User } from '../types'
import { sailsClient } from '../lib/sailsClient'
import { deriveKeyFromPassphrase, encryptBytes, decryptBytes } from '../lib/keyEncryption'

const KEYPAIR_STORAGE_KEY = 'sails_ui_keypair_secret_hex'

/** Lets Login.tsx show "crie uma senha" vs "digite sua senha" without needing to authenticate first. */
export function hasStoredIdentity(): boolean {
  return localStorage.getItem(KEYPAIR_STORAGE_KEY) !== null
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Senha incorreta.')
    this.name = 'WrongPassphraseError'
  }
}

function toUser(participant: {
  id: string; publicKey: string; displayName: string | null; peerId: string | null
  reputationScore: number; totalTrades: number; disputeCount: number
  totalVolumeBtc: string; verified: boolean; createdAt: string
}): User {
  return {
    id: participant.id,
    publicKey: participant.publicKey,
    displayName: participant.displayName,
    peerId: participant.peerId,
    reputationScore: participant.reputationScore,
    totalTrades: participant.totalTrades,
    disputeCount: participant.disputeCount,
    totalVolumeBtc: Number(participant.totalVolumeBtc), // RFC-009 decimal string -> UI number
    verified: participant.verified,
    createdAt: participant.createdAt,
  }
}

// Returns `null` for "nothing stored yet" (first-time user) as well as
// `null` for "stored data is malformed" (pre-encryption legacy entry from
// before 2026-08-11, or a corrupted one) — both are safe to treat as
// "generate a fresh keypair". A wrong-passphrase decrypt failure is NOT
// folded in here — it throws WrongPassphraseError instead, since silently
// generating a fresh identity there would strand the real one.
async function loadStoredKeypair(encryptionKey: CryptoKey): Promise<Ed25519Keypair | null> {
  const packed = localStorage.getItem(KEYPAIR_STORAGE_KEY)
  if (!packed) return null
  const result = await decryptBytes(encryptionKey, packed)
  if (!result.ok && result.reason === 'corrupt') return null
  if (!result.ok) throw new WrongPassphraseError()
  const secretKey = result.bytes
  // Ed25519 secret keys (tweetnacl's sign keypair) encode the public key
  // in their last 32 bytes — no separate storage needed to reconstruct it.
  const publicKey = secretKey.slice(32)
  return { secretKey, publicKey }
}

async function storeKeypair(encryptionKey: CryptoKey, kp: Ed25519Keypair) {
  localStorage.setItem(KEYPAIR_STORAGE_KEY, await encryptBytes(encryptionKey, kp.secretKey))
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (passphrase: string) => Promise<void>
  logout: () => void
  // The same Ed25519Keypair already used for identity.authenticate() —
  // exposed here so a real caller (Trade.tsx's chat) can pass it into
  // @satsails/p2p-trading-sdk's encryptChatMessage()/decryptChatMessage() without this
  // module's own storage/loading details leaking outside AuthContext.
  keypair: Ed25519Keypair | null
  // Same derived key used to encrypt the identity keypair above, reused
  // by useEscrowKey.ts so the user isn't asked for their passphrase a
  // second time to unlock the (separate) escrow signing key.
  encryptionKey: CryptoKey | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [keypair, setKeypair] = useState<Ed25519Keypair | null>(null)
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)
  const [loading, setLoading] = useState(false)

  const login = async (passphrase: string) => {
    setLoading(true)
    try {
      const derivedKey = await deriveKeyFromPassphrase(passphrase)
      let keypair = await loadStoredKeypair(derivedKey) // throws WrongPassphraseError on a real mismatch
      if (!keypair) {
        keypair = generateKeypair()
        // identity.create() registers a real Participant for this fresh
        // keypair — only needed once, before the first authenticate().
        await sailsClient.identity.create(keypair)
        await storeKeypair(derivedKey, keypair)
      }
      // Real challenge-response — requests a challenge, signs it, submits
      // it, and stores the returned session token on the client's
      // transport for every subsequent authenticated call.
      await sailsClient.identity.authenticate(keypair)
      const participant = await sailsClient.identity.me()
      setUser(toUser(participant))
      setKeypair(keypair)
      setEncryptionKey(derivedKey)
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    setKeypair(null)
    setEncryptionKey(null)
    sailsClient.setSessionToken(null)
  }

  // No more silent re-authenticate-on-mount: a page refresh now requires
  // re-entering the passphrase, same as any real wallet/password manager
  // locking on reload — there is no way to re-derive the encryption key
  // without it. (Before encryption landed, this used to auto-restore the
  // session using the stored plaintext keypair; that's the exact passive
  // exposure this change closes, so it can't stay.)

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, keypair, encryptionKey }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
