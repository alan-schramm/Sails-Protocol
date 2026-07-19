import { Link, Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { BottomNav } from './BottomNav'
import { ThemeToggle } from '../ui/ThemeToggle'
import { UserAvatar } from '../ui/UserAvatar'
import { useAuth } from '../../context/AuthContext'

export function Layout() {
  // Real bug found in a cold-start UX walkthrough: on mobile, TopNav
  // (the only place login/wallet state was shown) is hidden entirely,
  // and this bar showed nothing about it — a first-time mobile user had
  // no way to tell whether they were connected without opening Perfil.
  // Mirrors TopNav's own avatar+name / "Conectar" pattern so the same
  // signal exists on both breakpoints.
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-brand-bg">
      <TopNav />
      {/* Mobile-only bar — desktop nav (TopNav) already carries the
          theme toggle; mobile needs its own since BottomNav is reserved
          for primary navigation. */}
      <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-brand-border sticky top-0 z-40 bg-brand-bg/90 backdrop-blur">
        <Link to="/" className="font-black text-brand-text tracking-tight">
          Sails <span className="text-brand-orange">P2P</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <Link to="/profile" className="flex items-center gap-1.5">
              <UserAvatar user={user} size="sm" />
            </Link>
          ) : (
            <Link to="/login" className="btn-primary text-xs px-3 py-1.5">
              Conectar
            </Link>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
