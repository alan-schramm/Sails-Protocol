import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { UserAvatar } from '../ui/UserAvatar'
import { ThemeToggle } from '../ui/ThemeToggle'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${isActive ? 'text-brand-text' : 'text-brand-text-secondary hover:text-brand-text'}`

export function TopNav() {
  const { user, isOperator, toggleRole } = useAuth()

  return (
    <header className="hidden md:flex h-14 items-center border-b border-brand-border bg-brand-bg/90 backdrop-blur px-6 sticky top-0 z-40">
      <Link to="/" className="font-black text-lg tracking-tight text-brand-text">
        Sails <span className="text-brand-orange">P2P</span>
      </Link>

      <nav className="flex items-center gap-6 ml-10">
        <NavLink to="/" end className={linkClass}>Marketplace</NavLink>
        <NavLink to="/profile/history" className={linkClass}>Meus Trades</NavLink>
        <NavLink to="/profile" className={linkClass}>Perfil</NavLink>
        {isOperator && <NavLink to="/admin" className={linkClass}>Operador</NavLink>}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />

        <button
          type="button"
          onClick={toggleRole}
          className="text-xs border border-brand-border rounded-lg px-2.5 py-1.5 text-brand-text-secondary hover:text-brand-text hover:border-brand-border-hover transition-colors"
        >
          {isOperator ? '⚙️ Operador' : '👤 Usuário'}
        </button>

        {user ? (
          <Link to="/profile" className="flex items-center gap-2">
            <UserAvatar user={user} size="sm" />
            <span className="text-sm font-medium text-brand-text">{user.displayName}</span>
          </Link>
        ) : (
          <Link to="/login" className="btn-primary text-sm px-4 py-2">
            Conectar
          </Link>
        )}
      </div>
    </header>
  )
}
