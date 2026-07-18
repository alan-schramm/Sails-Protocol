import { Link, Outlet } from 'react-router-dom'
import { TopNav } from './TopNav'
import { BottomNav } from './BottomNav'
import { ThemeToggle } from '../ui/ThemeToggle'

export function Layout() {
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
        <ThemeToggle />
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
