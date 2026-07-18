import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', label: 'Comprar', icon: '🛒', end: true },
  { to: '/profile/history', label: 'Trades', icon: '↔️', end: false },
  { to: '/profile', label: 'Perfil', icon: '👤', end: false },
]

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs ${isActive ? 'text-gray-900 font-semibold' : 'text-gray-400'}`
          }
        >
          <span className="text-base">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
