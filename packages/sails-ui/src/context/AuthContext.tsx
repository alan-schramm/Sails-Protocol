/**
 * Mocked session state — `localStorage`-backed, not a real Ed25519
 * challenge-response session. A real integration replaces this with
 * @sails/sdk's `identity.authenticate()` (real, tested,
 * packages/sails-sdk/src/modules/identity.ts) and stores the session
 * token that returns, not the whole user object client-side.
 */
import React, { createContext, useContext, useState } from 'react'
import type { User } from '../types'
import { CURRENT_USER } from '../data/mock'

const STORAGE_KEY = 'sails_ui_mock_user'
const ROLE_STORAGE_KEY = 'sails_ui_mock_role'

interface AuthContextType {
  user: User | null
  login: () => void
  logout: () => void
  isOperator: boolean
  toggleRole: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Real bug found via manual browser testing (not caught by npm run
// build, since it's a runtime effect-ordering issue, not a type error):
// reading localStorage inside a useEffect here meant Profile's own
// `if (!user) navigate('/login')` effect (a descendant) fired *before*
// this provider's effect had a chance to populate `user` from storage —
// React runs effects child-to-parent on mount, so a hard navigation
// straight to /profile bounced a genuinely-logged-in user back to
// /login. Fixed by reading storage synchronously in the initial state
// (lazy useState initializer) instead of after mount.
function readStoredUser(): User | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : null
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(readStoredUser)
  const [isOperator, setIsOperator] = useState(() => localStorage.getItem(ROLE_STORAGE_KEY) === 'operator')

  const toggleRole = () => {
    setIsOperator((prev) => {
      const next = !prev
      localStorage.setItem(ROLE_STORAGE_KEY, next ? 'operator' : 'user')
      return next
    })
  }

  const login = () => {
    // TODO: replace with @sails/sdk identity.authenticate() — real
    // Ed25519 challenge-response, packages/sails-sdk/src/modules/identity.ts
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CURRENT_USER))
    setUser(CURRENT_USER)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout, isOperator, toggleRole }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
