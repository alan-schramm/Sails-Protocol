/**
 * Asset / SettlementRail / SettlementScope — the runtime types frozen by
 * `docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`
 * §2. These are deliberately separate from the legacy `AssetType`
 * (`src/common/types/index.ts`), which conflates asset+network+rail and
 * is NOT modified or replaced by this file — see ADR-002 §11/§12 and
 * `docs/BACKLOG.md` item 20.6.
 *
 * `Asset` and `SettlementRail` are identity only. `SettlementScope` is a
 * registered `{asset, rail}` product-scope pair — it intentionally
 * carries no provider, capability, evidence, maturity, or wallet/UX
 * metadata (ADR-002 §2/§4/§6/§7). Adding any such field here would
 * recreate the God-object problem ADR-002 exists to avoid.
 */

/** Canonical Day-0 assets (ADR-002 §5). */
export type Asset = 'BTC' | 'USDT' | 'USDC' | 'DEPIX' | 'XAUT'

/** Canonical Day-0 settlement rails (ADR-002 §5). One dimension — see ADR-002 §3 for why this is not split into Protocol + Network. */
export type SettlementRail =
  | 'BITCOIN_L1'
  | 'LIGHTNING'
  | 'SPARK'
  | 'ARKADE'
  | 'LIQUID'
  | 'ETHEREUM'
  | 'BASE'
  | 'OPTIMISM'
  | 'POLYGON'
  | 'AVALANCHE'
  | 'SOLANA'
  | 'TRON'
  | 'TON'
  | 'BNB_CHAIN'
  | 'ARBITRUM'

/**
 * A registered `{asset, rail}` product-scope pair (ADR-002 §2/§4).
 * Presence in the canonical registry means only "registered Product
 * Scope" — never implementation, provider, evidence, beta eligibility,
 * or production eligibility (ADR-002 §4/§6/§7).
 */
export interface SettlementScope {
  readonly asset: Asset
  readonly rail: SettlementRail
}
