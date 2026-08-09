import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router'
import { TopNav } from './TopNav'
import { BottomNav } from './BottomNav'
import { ThemeToggle } from '../ui/ThemeToggle'
import { UserAvatar } from '../ui/UserAvatar'
import { OnboardingTour } from '../onboarding/OnboardingTour'
import { useAuth } from '../../context/AuthContext'
import { buttonVariants } from '../ui/button'
import { cn } from '../../lib/utils'
import { HelpCircle } from 'lucide-react'
import { hasSeenOnboarding, markOnboardingSeen } from '../../lib/onboarding'

export function Layout() {
  // Real bug found in a cold-start UX walkthrough: on mobile, TopNav
  // (the only place login/wallet state was shown) is hidden entirely,
  // and this bar showed nothing about it — a first-time mobile user had
  // no way to tell whether they were connected without opening Perfil.
  // Mirrors TopNav's own avatar+name / "Conectar" pattern so the same
  // signal exists on both breakpoints.
  const { user } = useAuth()

  // First-time onboarding (2026-08-04) — owned here rather than inside
  // OnboardingTour itself, since Layout already knows `user` and wraps
  // every authenticated route. Fires once per browser on the first
  // render where a session exists and the flag hasn't been set yet —
  // not tied to the login action itself, so a session restored on page
  // load (AuthContext's own silent re-authenticate effect) triggers it
  // exactly the same as a fresh "Conectar Carteira" click would.
  const [tourOpen, setTourOpen] = useState(false)
  useEffect(() => {
    if (user && !hasSeenOnboarding()) setTourOpen(true)
  }, [user])

  const closeTour = (open: boolean) => {
    setTourOpen(open)
    if (!open) markOnboardingSeen()
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <TopNav onReplayTour={() => setTourOpen(true)} />
      {/* Mobile-only bar — desktop nav (TopNav) already carries the
          theme toggle; mobile needs its own since BottomNav is reserved
          for primary navigation. */}
      <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-brand-border sticky top-0 z-40 bg-brand-bg/90 backdrop-blur">
        <Link to="/" className="font-display font-bold text-brand-text tracking-tight">
          Sails <span className="text-brand-orange-accent">P2P</span>
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              title="Rever tour de boas-vindas"
              aria-label="Rever tour de boas-vindas"
              className="p-2 -m-2 text-brand-text-secondary hover:text-brand-text"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          )}
          <ThemeToggle />
          {user ? (
            <Link to="/profile" className="flex items-center gap-1.5">
              <UserAvatar user={user} size="sm" />
            </Link>
          ) : (
            <Link to="/login" className={cn(buttonVariants({ className: 'text-xs px-3 py-1.5' }))}>
              Conectar
            </Link>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>
      <BottomNav />
      <OnboardingTour open={tourOpen} onOpenChange={closeTour} />
    </div>
  )
}
