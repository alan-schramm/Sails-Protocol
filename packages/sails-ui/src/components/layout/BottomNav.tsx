import { NavLink } from 'react-router'
import { ShoppingCart, Hourglass, ArrowLeftRight, User } from 'lucide-react'

// DESIGN-LANGUAGE-1 §2.2 — this destination was labeled "Comprar" here but
// "Market" everywhere else (Sidebar.tsx, page <h1>, wordmark): "Comprar"
// names a specific action (buy), but the destination itself is the whole
// market listing — it has its own Comprar/Vender side toggle inside the
// page, so a buy-only label undersells and misdescribes what's actually
// there. No Product Decision authorizes a different name per breakpoint
// for the same destination, so this now matches Sidebar's "Market"
// exactly. "Ativos"/"Trades"/"Perfil" are kept as-is: legitimate short
// forms of "Trades Ativos"/"Meus Trades"/"Perfil" for the same meaning,
// not a different name for the same place.
//
// §2.1 — `Perfil`'s `end` was `false`, so `/profile` (prefix-matched)
// activated on `/profile/active` and `/profile/history` too, alongside
// their own correct items. `end: true` restricts it to the exact
// `/profile` path — same fix as Sidebar.tsx's own NAV_ITEMS.
const items = [
  { to: '/', label: 'Market', icon: ShoppingCart, end: true },
  { to: '/profile/active', label: 'Ativos', icon: Hourglass, end: false },
  { to: '/profile/history', label: 'Trades', icon: ArrowLeftRight, end: false },
  { to: '/profile', label: 'Perfil', icon: User, end: true },
]

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-brand-surface border-t border-brand-border-subtle flex">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }: { isActive: boolean }) =>
            // UI-FOUNDATION-1-VISUAL-CORRECTION §4.8 — color-only active
            // state was easy to miss at a glance/thumb's-length; a top
            // accent bar mirrors Sidebar's own left-rail treatment so
            // "active" reads the same language across breakpoints.
            `relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
              isActive ? 'text-brand-orange-accent font-semibold' : 'text-brand-text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span className="absolute top-0 inset-x-1/4 h-0.5 rounded-full bg-brand-orange-accent" aria-hidden="true" />
              )}
              <item.icon className="h-5 w-5" />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
