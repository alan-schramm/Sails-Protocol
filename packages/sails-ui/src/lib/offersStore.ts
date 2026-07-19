/**
 * Local persistence for offers published via `PublishOffer.tsx`'s wizard
 * — layered on top of `MOCK_OFFERS` the same `localStorage` way
 * `Marketplace.tsx`'s filters persist (`sails_ui_marketplace_filters`).
 * TODO: replace with @sails/sdk `liquidity.createOffer()` (real route:
 * `POST /v1/liquidity/offers`, requires auth — `liquidity.routes.ts`,
 * real `CreateOfferInput` shape checked in `liquidity.service.ts` before
 * building the wizard around it) once the mock swap happens — this
 * whole file's reason to exist goes away then; a real backend is the
 * actual source of truth for "my offers," never `localStorage`.
 */
import { MOCK_OFFERS } from '../data/mock'
import type { Offer, OfferStatus } from '../types'

const STORAGE_KEY = 'sails_ui_created_offers'
const STATUS_OVERRIDES_KEY = 'sails_ui_offer_status_overrides'

function readCreatedOffers(): Offer[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

function readStatusOverrides(): Record<string, OfferStatus> {
  const stored = localStorage.getItem(STATUS_OVERRIDES_KEY)
  return stored ? JSON.parse(stored) : {}
}

// Created offers first — a user who just published one expects to see
// it immediately, not buried under the 8 seed offers. Status overrides
// (see updateOfferStatus below) apply on top of both sources, since a
// seed offer's status can't be mutated in place — it's a static import.
export function getAllOffers(): Offer[] {
  const overrides = readStatusOverrides()
  return [...readCreatedOffers(), ...MOCK_OFFERS].map((o) =>
    overrides[o.id] ? { ...o, status: overrides[o.id] } : o
  )
}

export function addOffer(offer: Offer): void {
  const created = readCreatedOffers()
  created.unshift(offer)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(created))
}

// Real fix: Profile.tsx's "Minhas Ofertas" used to be read-only — no way
// to pause or cancel an offer once published, unlike every real P2P
// platform (Binance's ad on/off toggle + delete, Bisq/HodlHodl/El Dorado's
// remove-offer action). Mirrors the real backend's status-only mutation
// (PATCH /v1/liquidity/offers/:id/status — liquidity.routes.ts, ownership-
// checked in liquidity.service.ts's updateOfferStatus()) rather than a
// hard delete — matches how those platforms actually behave: an ad is
// deactivated/cancelled, never erased from history.
export function updateOfferStatus(offerId: string, status: OfferStatus): void {
  const overrides = readStatusOverrides()
  overrides[offerId] = status
  localStorage.setItem(STATUS_OVERRIDES_KEY, JSON.stringify(overrides))
}
