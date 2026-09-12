/**
 * SettlementScope registry — first runtime implementation of
 * `docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`
 * (ARCH-IMPL-1, additive, bounded; relocated out of `src/core/` in
 * ARCH-IMPL-1-R1 — see below). Freezes the 25 canonical Day-0
 * `{asset, rail}` rows from ADR-002 §5 as an explicit, sparse,
 * deterministic, read-only list.
 *
 * **Not in `src/core/`.** `src/core/README.md` defines that folder as
 * the location of formal Core components (`ARCHITECTURE.md` §1B). ADR-002
 * itself classifies this foundation as Product/Domain representation
 * infrastructure and explicitly declares no Core/Semantic Kernel change
 * (ADR-002 §13). Living in `src/common/` instead — the existing home for
 * shared, non-Core infrastructure (`database`, `events`, `types`, etc.)
 * — keeps file location from implying a Core/Semantic primitive that was
 * never decided.
 *
 * **Canonical, not legacy-aware.** This file knows only `Asset`,
 * `SettlementRail`, `SettlementScope`, the 25 canonical rows, and the
 * query functions below. It deliberately has **no import of the legacy
 * `AssetType`, `EscrowType`, Prisma, or any legacy provider map** — the
 * dependency runs the other way: `settlement-scope-legacy.ts` depends on
 * this file (and on legacy `AssetType`), never the reverse. See that
 * file for the legacy-translation function, and
 * `tests/settlementScopeRegistry.test.ts`'s "dependency boundary" suite
 * for the static proof.
 *
 * This registry answers exactly one question: "is this {asset, rail}
 * pair in current Product Scope?" It does not, and must not, answer
 * "does a provider exist for it" (that is a separate, future
 * ProviderRegistration mission — ADR-002 §12 item 1, explicitly not
 * started here) or "is it implemented/evidenced/production-eligible"
 * (ADR-002 §6/§7). Absence from this list means "not registered in
 * current Product Scope." Presence means only "registered Product
 * Scope" — providerless presence (e.g. `{DEPIX, SPARK}`) is a valid,
 * expected, non-error state (ADR-002 §4/§5).
 *
 * No Asset×Rail cross-product is generated here — every row is listed
 * explicitly, by hand, matching ADR-002 §5's own table exactly. This is
 * deliberate: a generated cross-product would silently make every
 * combination "valid," which is exactly what ADR-002 §4 rejects.
 *
 * Coexists independently of the legacy `AssetType`/`RECOMMENDED_ESCROW_TYPE`
 * (`src/modules/open-settlement/escrow-providers.ts`) — neither is
 * modified, and no existing call site is wired to this registry yet
 * (ADR-002 §12 items 2-3 remain future, separately-authorized missions;
 * `docs/BACKLOG.md` 20.2/20.5 stay OPEN).
 */
import type { Asset, SettlementRail, SettlementScope } from './types/settlement-scope'

function scope(asset: Asset, rail: SettlementRail): SettlementScope {
  return Object.freeze({ asset, rail })
}

// ADR-002 §5's 25-row table, reproduced exactly (BTC×5, DEPIX×2, USDT×11,
// USDC×6, XAUT×1). Order matches the ADR's own per-asset grouping.
const CANONICAL_DAY0_SCOPES: readonly SettlementScope[] = Object.freeze([
  scope('BTC', 'BITCOIN_L1'),
  scope('BTC', 'LIGHTNING'),
  scope('BTC', 'SPARK'),
  scope('BTC', 'ARKADE'),
  scope('BTC', 'LIQUID'),
  scope('DEPIX', 'LIQUID'),
  scope('DEPIX', 'SPARK'),
  scope('USDT', 'ETHEREUM'),
  scope('USDT', 'BASE'),
  scope('USDT', 'OPTIMISM'),
  scope('USDT', 'POLYGON'),
  scope('USDT', 'AVALANCHE'),
  scope('USDT', 'SOLANA'),
  scope('USDT', 'TRON'),
  scope('USDT', 'TON'),
  scope('USDT', 'BNB_CHAIN'),
  scope('USDT', 'ARBITRUM'),
  scope('USDT', 'LIQUID'),
  scope('USDC', 'ETHEREUM'),
  scope('USDC', 'BASE'),
  scope('USDC', 'OPTIMISM'),
  scope('USDC', 'ARBITRUM'),
  scope('USDC', 'AVALANCHE'),
  scope('USDC', 'POLYGON'),
  scope('XAUT', 'ETHEREUM'),
])

/** Is `{asset, rail}` a registered Day-0 Product Scope? Registration only — implies nothing about provider/evidence/eligibility. */
export function isSettlementScopeRegistered(asset: Asset, rail: SettlementRail): boolean {
  return CANONICAL_DAY0_SCOPES.some((s) => s.asset === asset && s.rail === rail)
}

/** All 25 canonical Day-0 scopes. Returns the frozen canonical list directly — safe, since every row and the list itself are frozen. */
export function listSettlementScopes(): readonly SettlementScope[] {
  return CANONICAL_DAY0_SCOPES
}

/** Rails registered for a given asset (empty array if the asset has no registered rows). */
export function listSettlementRailsForAsset(asset: Asset): readonly SettlementRail[] {
  return CANONICAL_DAY0_SCOPES.filter((s) => s.asset === asset).map((s) => s.rail)
}

/** Assets registered for a given rail (empty array if the rail has no registered rows). */
export function listAssetsForSettlementRail(rail: SettlementRail): readonly Asset[] {
  return CANONICAL_DAY0_SCOPES.filter((s) => s.rail === rail).map((s) => s.asset)
}
