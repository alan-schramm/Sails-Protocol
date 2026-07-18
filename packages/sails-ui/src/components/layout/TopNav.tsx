import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { UserAvatar } from '../ui/UserAvatar'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`

export function TopNav() {
  const { user, isOperator, toggleRole } = useAuth()

  return (
    <header className="hidden md:flex h-14 items-center border-b border-gray-200 bg-white px-6 sticky top-0 z-40">
      <Link to="/" className="font-black text-lg tracking-tight">
        Sails <span className="text-gray-400 font-medium">P2P</span>
      </Link>

      <nav className="flex items-center gap-6 ml-10">
        <NavLink to="/" end className={linkClass}>Marketplace</NavLink>
        <NavLink to="/profile/history" className={linkClass}>Meus Trades</NavLink>
        <NavLink to="/profile" className={linkClass}>Perfil</NavLink>
        {isOperator && <NavLink to="/admin" className={linkClass}>Operador</NavLink>}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={toggleRole}
          className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-500 hover:text-gray-800"
        >
          {isOperator ? '⚙️ Operador' : '👤 Usuário'}
        </button>

        {user ? (
          <Link to="/profile" className="flex items-center gap-2">
            <UserAvatar user={user} size="sm" />
            <span className="text-sm font-medium">{user.displayName}</span>
          </Link>
        ) : (
          <Link
            to="/login"
            className="text-sm font-semibold bg-gray-900 text-white rounded-lg px-4 py-2 hover:bg-gray-700"
          >
            Conectar
          </Link>
        )}
      </div>
    </header>
  )
}
