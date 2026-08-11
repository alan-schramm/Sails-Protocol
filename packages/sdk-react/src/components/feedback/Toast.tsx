import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastMessage {
  id: string
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toasts: ToastMessage[]
  show: (message: string, variant?: ToastVariant) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * Deliberately a small, dependency-free implementation — not a wrapper
 * around `sonner` (what packages/sails-ui actually uses today). This is
 * a general @satsails/sdk-react for any third-party wallet, and forcing
 * every consumer to also install/configure a specific toast library
 * just to use this one hook would be a heavier ask than a ~40-line
 * context needs to justify. A consumer already using sonner (or
 * anything else) can just not use this component and call their own
 * toast function from wherever they'd otherwise call `show()`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
      setToasts((current) => [...current, { id, message, variant }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss }}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  )
}

export function useToast(): Pick<ToastContextValue, 'show' | 'dismiss'> {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast() must be called within a <ToastProvider>.')
  return ctx
}

const variantColor: Record<ToastVariant, { bg: string; fg: string }> = {
  info: { bg: '#f0f9ff', fg: '#0369a1' },
  success: { bg: '#f0fdf4', fg: '#15803d' },
  error: { bg: '#fef2f2', fg: '#b91c1c' },
}

/** The individual toast, exported for Storybook to render in isolation without needing a live ToastProvider context. */
export function Toast({ message, variant, onDismiss }: { message: string; variant: ToastVariant; onDismiss?: () => void }) {
  const color = variantColor[variant]
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        backgroundColor: color.bg,
        color: color.fg,
        borderRadius: '8px',
        padding: '10px 14px',
        fontSize: '0.875rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        minWidth: '240px',
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

function ToastViewport() {
  const { toasts, dismiss } = useContext(ToastContext) as ToastContextValue
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 9999,
      }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} variant={t.variant} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}
