/**
 * Escrow creation — sails-p2p-schemas (Bounded Remediation F5,
 * docs/TECHNICAL_DEBT_AUDIT.md #52).
 *
 * The canonical structural contract for `POST /v1/settlement/escrow`.
 * Before this file existed, the SDK (`packages/sails-sdk/src/modules/settlement.ts`'s
 * `CreateEscrowInput`) and the server
 * (`src/modules/open-settlement/settlement.routes.ts`'s `createEscrowSchema`,
 * `src/modules/open-settlement/escrow.service.ts`'s own `CreateEscrowInput`)
 * each independently declared the same field list and the same two enum
 * value lists — real historical drift already happened once
 * (`WDK_USDT_EVM`/`SAFE_GUARD_EVM` were both missing from the server's
 * validator after being added as real providers; see that file's own
 * git history). Both sides now import this file's exports directly, so
 * a future addition/removal only needs to happen here.
 *
 * Scope, deliberately narrow: this is the escrow-CREATION structural
 * contract only. `AssetType`/`EscrowType` remain independently declared
 * elsewhere for their own broader, non-creation-specific purposes
 * (`src/common/types/index.ts`, `src/common/types/trade.ts`,
 * `packages/sails-sdk/src/types.ts` — Offer/Trade/PayoutAddress response
 * shapes, not escrow creation) — today structurally identical to the
 * values below, unchanged by this file, out of this fix's scope.
 * Consolidating every use of these two enums repo-wide is a materially
 * bigger, separate undertaking this fix does not attempt.
 *
 * Structural schema, not business logic: this file defines field names,
 * enum membership, and required/optional status only. It does NOT
 * decide whether an amount is a valid positive decimal (server-only,
 * `common/validation.ts`'s `positiveDecimalString()` — an economic
 * constraint, not a structural one), which escrow type a given asset
 * defaults to (client/server business logic,
 * `recommendedEscrowType()`/`escrow.service.ts`'s own default), or
 * whether a given `EscrowType` is production-ready (provider maturity,
 * entirely separate from structural acceptance — `LIQUID_COVENANT`
 * below is a real, currently-accepted enum value even though its
 * provider is reserved/unimplemented, exactly the same distinction
 * `docs/DATABASE.md` §2 already documents).
 *
 * Zero runtime dependencies, matching this package's own convention
 * (see index.ts's header) — no zod here. The server layers its own
 * zod validation (`z.enum(ESCROW_TYPE_VALUES)`/`z.enum(ASSET_TYPE_VALUES)`)
 * on top of these exports; `isValidCreateEscrowInput()` below gives any
 * OTHER consumer (a non-zod SDK caller, a test) the same structural
 * check without requiring zod as a dependency.
 */

export const ESCROW_TYPE_VALUES = [
  'MULTISIG',
  'LIGHTNING_HODL',
  'LIQUID_COVENANT',
  'WDK_USDT_EVM',
  'SAFE_GUARD_EVM',
  'MOCK',
] as const

export type EscrowType = (typeof ESCROW_TYPE_VALUES)[number]

/** True only for a value this protocol version actually knows about — an unrecognized string is never treated as a valid escrow type. */
export function isKnownEscrowType(value: string): value is EscrowType {
  return (ESCROW_TYPE_VALUES as readonly string[]).includes(value)
}

export const ASSET_TYPE_VALUES = [
  'BTC',
  'USDT_ERC20',
  'USDT_TRC20',
  'USDT_LIQUID',
  'USDT_LIGHTNING',
  'LN_BTC',
  'LIQUID_BTC',
  'SPARK',
  'STACKS',
  'RSK_BTC',
] as const

export type AssetType = (typeof ASSET_TYPE_VALUES)[number]

/** True only for a value this protocol version actually knows about — an unrecognized string is never treated as a valid asset type. */
export function isKnownAssetType(value: string): value is AssetType {
  return (ASSET_TYPE_VALUES as readonly string[]).includes(value)
}

export interface CreateEscrowInput {
  tradeId: string
  type?: EscrowType
  /** Decimal string (RFC-009), never a JS number. Positivity/format beyond "non-empty string" is a server-side business rule, not enforced here. */
  lockedAmount: string
  asset: AssetType
  network?: string
  timelockHours?: number
}

/**
 * Pure structural check — the same properties `createEscrowSchema` (zod,
 * server-side) enforces, expressed without a zod dependency. Does not
 * validate `lockedAmount`'s numeric format/positivity (business rule,
 * intentionally out of scope — see this file's own header).
 */
export function isValidCreateEscrowInput(value: unknown): value is CreateEscrowInput {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.tradeId !== 'string' || v.tradeId.length === 0) return false
  if (v.type !== undefined && (typeof v.type !== 'string' || !isKnownEscrowType(v.type))) return false
  if (typeof v.lockedAmount !== 'string' || v.lockedAmount.length === 0) return false
  if (typeof v.asset !== 'string' || !isKnownAssetType(v.asset)) return false
  if (v.network !== undefined && typeof v.network !== 'string') return false
  if (v.timelockHours !== undefined && typeof v.timelockHours !== 'number') return false
  return true
}
