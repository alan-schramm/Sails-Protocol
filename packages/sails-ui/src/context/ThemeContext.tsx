import React, { createContext, useContext, useState } from 'react'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'sails_ui_theme'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function resolveInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  // Dark is the official Satsails identity (2026-07-28 direction, same
  // reasoning Login's brand panel already uses: "deliberately always
  // dark") — defaults here regardless of system preference; light stays
  // a fully supported, one-click opt-out via ThemeToggle.
  return 'dark'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Lazy initializer applies the class synchronously on first render —
  // same "don't do this in a useEffect" lesson AuthContext's own doc
  // comment already documents (effect-ordering race found by manually
  // testing in a browser), applied here before it could bite again.
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = resolveInitialTheme()
    applyTheme(initial)
    return initial
  })

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem(STORAGE_KEY, next)
      applyTheme(next)
      return next
    })
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
