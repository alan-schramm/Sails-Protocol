import { Link, NavLink } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { UserAvatar } from '../ui/UserAvatar'
import { ThemeToggle } from '../ui/ThemeToggle'
import { buttonVariants } from '../ui/button'
import { cn } from '../../lib/utils'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-brand-text' : 'text-brand-text-secondary hover:text-brand-text'}`

export function TopNav() {
  const { user } = useAuth()

  return (
    <header className="hidden md:flex h-14 items-center border-b border-brand-border bg-brand-bg/90 backdrop-blur px-6 sticky top-0 z-40">
      <Link to="/" className="font-display font-bold text-lg tracking-tight text-brand-text">
        Sails <span className="text-brand-orange-accent">P2P</span>
      </Link>

      <nav className="flex items-center gap-6 ml-10">
        <NavLink to="/" end className={linkClass}>Marketplace</NavLink>
        <NavLink to="/profile/active" className={linkClass}>Trades Ativos</NavLink>
        <NavLink to="/profile/history" className={linkClass}>Meus Trades</NavLink>
        <NavLink to="/profile" className={linkClass}>Perfil</NavLink>
        {/* No role gate — real listDisputes() is scoped server-side to
            the caller's own arbiterId; there's no operator/admin tier to
            check client-side (see Disputes.tsx's own header comment). A
            non-arbiter just sees a real, honest empty state there. */}
        {user && <NavLink to="/disputes" className={linkClass}>Disputas</NavLink>}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />

        {user ? (
          <Link to="/profile" className="flex items-center gap-2">
            <UserAvatar user={user} size="sm" />
            <span className="text-sm font-medium text-brand-text">{user.displayName}</span>
          </Link>
        ) : (
          <Link to="/login" className={cn(buttonVariants({ className: 'text-sm px-4 py-2' }))}>
            Conectar
          </Link>
        )}
      </div>
    </header>
  )
}
