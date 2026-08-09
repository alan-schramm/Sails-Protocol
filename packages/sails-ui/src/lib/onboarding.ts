// Per-browser, not per-account (same scope as ThemeContext/Marketplace's
// saved filters) — deliberately simple for a reference UI; a real
// deployment might key this by user.id instead so switching wallets on
// the same device doesn't replay the tour unnecessarily.
const ONBOARDING_SEEN_KEY = 'sails_ui_onboarding_seen'

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true'
}

export function markOnboardingSeen(): void {
  localStorage.setItem(ONBOARDING_SEEN_KEY, 'true')
}
