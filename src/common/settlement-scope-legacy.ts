/**
 * Legacy AssetType → SettlementScope translation (ADR-002 §11).
 *
 * Split out of `settlement-scope-registry.ts` in ARCH-IMPL-1-R1 to fix
 * the dependency direction: the canonical registry must not know about
 * the legacy `AssetType`; this file is the one place that does.
 *
 *     Canonical Asset / SettlementRail / SettlementScope
 *               ^
 *     Legacy Compatibility Translator (this file)
 *               ^
 *     legacy AssetType
 *
 * Only the 5 high-confidence mappings ADR-002 §11 explicitly names.
 * Deliberately a plain lookup map, not a heuristic function: anything
 * not listed here (including the ambiguous LN_BTC/STACKS/RSK_BTC, and
 * every other legacy AssetType value not named by ADR-002 §11) returns
 * null by construction — there is no code path that could "guess" a
 * mapping for them.
 */
import type { AssetType } from './types'
import type { SettlementScope } from './types/settlement-scope'

const LEGACY_ASSET_TYPE_TO_SCOPE: Partial<Record<AssetType, SettlementScope>> = {
  BTC: Object.freeze({ asset: 'BTC', rail: 'BITCOIN_L1' }),
  USDT_ERC20: Object.freeze({ asset: 'USDT', rail: 'ETHEREUM' }),
  USDT_TRC20: Object.freeze({ asset: 'USDT', rail: 'TRON' }),
  USDT_LIQUID: Object.freeze({ asset: 'USDT', rail: 'LIQUID' }),
  LIQUID_BTC: Object.freeze({ asset: 'BTC', rail: 'LIQUID' }),
}

/**
 * Translates a legacy `AssetType` to its `SettlementScope`, for the 5
 * high-confidence mappings ADR-002 §11 names. Returns `null` for every
 * other legacy value, including the ambiguous `LN_BTC`/`STACKS`/`RSK_BTC`
 * — never a guessed or default mapping (ADR-002 §11).
 */
export function translateLegacyAssetType(legacy: AssetType): SettlementScope | null {
  return LEGACY_ASSET_TYPE_TO_SCOPE[legacy] ?? null
}
