/**
 * Favorite traders (2026-07-29, requested directly after researching
 * Airtm's "cashier" pattern — pick a trader you trust and find them
 * again). A real, working feature, not a demo toggle: unlike `Offer`'s
 * own `tradedWithCurrentUser`/`blockedRelationship` fields (types.ts's
 * own comment — those are UI-only demonstration flags with no real
 * backend behind them yet), this one is fully real *within this UI* —
 * it actually persists and actually filters, the same localStorage
 * pattern `offersStore.ts` and the Marketplace's own saved-filters
 * feature already use. No real backend endpoint exists for a "favorite
 * user" relationship (checked: no such route in
 * src/modules/open-identity or open-reputation) — this is this UI's own
 * client-side list, keyed by `User.id`.
 */
const STORAGE_KEY = 'sails_ui_favorite_traders'

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Returns whether the write actually landed — a quota-exceeded or
// private-browsing localStorage throw shouldn't crash the toggle, but the
// caller needs to know so it doesn't report a "favorited" state that
// silently reverts on the next reload.
function writeFavorites(ids: string[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}

export function isFavoriteTrader(userId: string): boolean {
  return readFavorites().includes(userId)
}

export function toggleFavoriteTrader(userId: string): boolean {
  const current = readFavorites()
  const isFav = current.includes(userId)
  const next = isFav ? current.filter((id) => id !== userId) : [...current, userId]
  const saved = writeFavorites(next)
  return saved ? !isFav : isFav
}

export function getFavoriteTraderIds(): string[] {
  return readFavorites()
}
