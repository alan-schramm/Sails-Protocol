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
import type { Offer } from '../types'

const STORAGE_KEY = 'sails_ui_created_offers'

function readCreatedOffers(): Offer[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored ? JSON.parse(stored) : []
}

// Created offers first — a user who just published one expects to see
// it immediately, not buried under the 8 seed offers.
export function getAllOffers(): Offer[] {
  return [...readCreatedOffers(), ...MOCK_OFFERS]
}

export function addOffer(offer: Offer): void {
  const created = readCreatedOffers()
  created.unshift(offer)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(created))
}
