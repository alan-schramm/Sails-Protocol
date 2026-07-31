import type { FiatCurrency } from '../types'

// Locale used purely for Intl.NumberFormat's currency symbol/grouping —
// not a claim about which country the currency "belongs to" beyond
// picking a reasonable formatting convention.
export const FIAT_CURRENCIES: { code: FiatCurrency; label: string; locale: string }[] = [
  { code: 'BRL', label: 'Real Brasileiro', locale: 'pt-BR' },
  { code: 'USD', label: 'Dólar Americano', locale: 'en-US' },
  { code: 'EUR', label: 'Euro', locale: 'de-DE' },
  { code: 'GBP', label: 'Libra Esterlina', locale: 'en-GB' },
  { code: 'ARS', label: 'Peso Argentino', locale: 'es-AR' },
  { code: 'MXN', label: 'Peso Mexicano', locale: 'es-MX' },
  { code: 'NGN', label: 'Naira Nigeriana', locale: 'en-NG' },
  { code: 'INR', label: 'Rupia Indiana', locale: 'en-IN' },
  // Added 2026-07-29 to match Airtm/El Dorado's own covered countries —
  // see types.ts's own comment on FiatCurrency for the per-country
  // sourcing.
  { code: 'VES', label: 'Bolívar Venezuelano', locale: 'es-VE' },
  { code: 'COP', label: 'Peso Colombiano', locale: 'es-CO' },
  { code: 'PEN', label: 'Sol Peruano', locale: 'es-PE' },
  { code: 'BOB', label: 'Boliviano', locale: 'es-BO' },
  { code: 'EGP', label: 'Libra Egípcia', locale: 'ar-EG' },
]

// Quick-select trade-amount presets, roughly equivalent purchasing
// power per currency — mocked/illustrative, not sourced from a live FX
// rate. A real implementation would derive these from a live rate feed
// (OpenLiquidity doesn't have one today — BACKLOG.md).
export const AMOUNT_PRESETS: Record<FiatCurrency, number[]> = {
  BRL: [50, 200, 500, 700, 2000],
  USD: [10, 50, 100, 150, 500],
  EUR: [10, 45, 90, 130, 450],
  GBP: [10, 40, 80, 110, 400],
  ARS: [5000, 20000, 50000, 70000, 200000],
  MXN: [200, 900, 1800, 2500, 9000],
  NGN: [8000, 32000, 80000, 110000, 320000],
  INR: [800, 3300, 6600, 9200, 33000],
  VES: [2000, 10000, 20000, 30000, 100000],
  COP: [40000, 200000, 400000, 600000, 2000000],
  PEN: [40, 200, 400, 600, 1900],
  BOB: [70, 350, 700, 1000, 3500],
  EGP: [500, 2500, 5000, 7500, 25000],
}

export function formatByCurrency(value: number, currency: FiatCurrency): string {
  const meta = FIAT_CURRENCIES.find((c) => c.code === currency) ?? FIAT_CURRENCIES[0]
  return value.toLocaleString(meta.locale, { style: 'currency', currency: meta.code })
}

// Illustrative-only fiat->USD rates, same honesty boundary as
// AMOUNT_PRESETS above — used by PublishOffer.tsx to derive the
// mandatory `priceUsd` (real CreateOfferInput field,
// liquidity.service.ts) from whatever fiat price the user enters, since
// no live rate feed exists. Not sourced from any live market.
export const ILLUSTRATIVE_FX_TO_USD: Record<FiatCurrency, number> = {
  BRL: 1 / 5.05,
  USD: 1,
  EUR: 1 / 0.92,
  GBP: 1 / 0.79,
  ARS: 1 / 980,
  MXN: 1 / 18,
  NGN: 1 / 1550,
  INR: 1 / 83,
  VES: 1 / 200,
  COP: 1 / 4000,
  PEN: 1 / 3.8,
  BOB: 1 / 6.9,
  EGP: 1 / 49,
}
