import { NavLink } from 'react-router'
import { ShoppingCart, Hourglass, ArrowLeftRight, User } from 'lucide-react'

const items = [
  { to: '/', label: 'Comprar', icon: ShoppingCart, end: true },
  { to: '/profile/active', label: 'Ativos', icon: Hourglass, end: false },
  { to: '/profile/history', label: 'Trades', icon: ArrowLeftRight, end: false },
  { to: '/profile', label: 'Perfil', icon: User, end: false },
]

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-brand-surface border-t border-brand-border flex">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }: { isActive: boolean }) =>
            `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
              isActive ? 'text-brand-orange-accent font-semibold' : 'text-brand-text-muted'
            }`
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
