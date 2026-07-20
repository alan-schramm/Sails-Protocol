/**
 * Real session state — @sails/sdk's `identity.create()`/`authenticate()`
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
 * To demo two counterparties trading with each other, use two separate
 * browser sessions (e.g. a normal window + an incognito window) — this
 * key/session storage is per-origin, shared across tabs in the same
 * browser profile, same as any localStorage-backed session.
 */
import React, { createContext, useContext, useEffect, useState } from 'react'
import { generateKeypair, hexToBytes, type Ed25519Keypair } from '@sails/sdk'
import type { User } from '../types'
import { sailsClient } from '../lib/sailsClient'

const KEYPAIR_STORAGE_KEY = 'sails_ui_keypair_secret_hex'

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

function loadStoredKeypair(): Ed25519Keypair | null {
  const secretHex = localStorage.getItem(KEYPAIR_STORAGE_KEY)
  if (!secretHex) return null
  const secretKey = hexToBytes(secretHex)
  // Ed25519 secret keys (tweetnacl's sign keypair) encode the public key
  // in their last 32 bytes — no separate storage needed to reconstruct it.
  const publicKey = secretKey.slice(32)
  return { secretKey, publicKey }
}

function storeKeypair(kp: Ed25519Keypair) {
  const hex = Array.from(kp.secretKey).map((b) => b.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(KEYPAIR_STORAGE_KEY, hex)
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: () => Promise<void>
  logout: () => void
  isOperator: boolean
  toggleRole: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ROLE_STORAGE_KEY = 'sails_ui_mock_role' // presentation-only role toggle, unrelated to real auth

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOperator, setIsOperator] = useState(() => localStorage.getItem(ROLE_STORAGE_KEY) === 'operator')

  const toggleRole = () => {
    setIsOperator((prev) => {
      const next = !prev
      localStorage.setItem(ROLE_STORAGE_KEY, next ? 'operator' : 'user')
      return next
    })
  }

  const login = async () => {
    setLoading(true)
    try {
      let keypair = loadStoredKeypair()
      if (!keypair) {
        keypair = generateKeypair()
        // identity.create() registers a real Participant for this fresh
        // keypair — only needed once, before the first authenticate().
        await sailsClient.identity.create(keypair)
        storeKeypair(keypair)
      }
      // Real challenge-response — requests a challenge, signs it, submits
      // it, and stores the returned session token on the client's
      // transport for every subsequent authenticated call.
      await sailsClient.identity.authenticate(keypair)
      const participant = await sailsClient.identity.me()
      setUser(toUser(participant))
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    sailsClient.setSessionToken(null)
  }

  // On load, silently re-authenticate if a keypair is already stored —
  // the SDK client's session token lives only in memory (transport.ts),
  // so a page refresh needs a fresh challenge-response even though the
  // underlying identity is unchanged.
  useEffect(() => {
    const keypair = loadStoredKeypair()
    if (!keypair) {
      setLoading(false)
      return
    }
    sailsClient.identity
      .authenticate(keypair)
      .then(() => sailsClient.identity.me())
      .then((participant) => setUser(toUser(participant)))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isOperator, toggleRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
