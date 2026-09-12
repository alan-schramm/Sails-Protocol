/**
 * SettlementProviderRegistration registry (ARCH-IMPL-2) — the second,
 * additive runtime layer over ADR-002's frozen architecture
 * (`docs/adr/ADR-002-asset-settlement-rail-adapter-provider-architecture.md`).
 * Sits directly on top of the canonical `SettlementScope` registry
 * (`settlement-scope-registry.ts`), never the other way around:
 *
 *     SettlementScope Registry
 *             |
 *             v
 *     Provider Registry (this file)
 *             |
 *             v
 *     Concrete Provider Registrations
 *
 * This file answers exactly one question: "which concrete provider
 * registrations can serve this registered {asset, rail} scope?" It does
 * NOT answer whether Product Scope exists (that's the SettlementScope
 * registry alone), whether a provider is production-eligible, whether
 * evidence proves any security property, whether an agent is
 * authorized, or which provider should ultimately be selected — all of
 * those are separate, later concerns (ADR-002 §6/§8; this file's own
 * `SettlementProviderRegistration` type carries none of them, see below).
 *
 * **Provider registration never defines Product Scope.** Every row
 * below is validated at module-load time (see the invariant check after
 * the table) against the canonical `SettlementScope` registry — a typo
 * or a future addition that names an unregistered scope fails loudly at
 * import time, it can never silently "create" scope. Removing a
 * provider row here has zero effect on `SettlementScope`'s own registry
 * — `{DEPIX, SPARK}` and `{BTC, LIGHTNING}` stay valid, registered
 * Product Scope with zero providers, exactly as ADR-002 §4/§5 requires.
 *
 * **Provider identity reuses the existing `EscrowType` identifier** —
 * the same string keys `escrow-providers.ts`'s own `PROVIDERS` record,
 * routes, and the dispute/escrow lifecycle already use everywhere
 * (`MULTISIG`, `LIGHTNING_HODL`, `WDK_USDT_EVM`, `SAFE_GUARD_EVM`,
 * `MOCK`) — deliberately not a new, second provider-ID scheme. This is
 * NOT the same as depending on the legacy `AssetType`: `EscrowType`
 * identifies a settlement *implementation*, `AssetType` identifies an
 * *asset+network+rail* conflation ADR-002 exists to replace. This file
 * still has no import of `AssetType`.
 *
 * **Only 3 of the 5 real `EscrowType` values are registered here.**
 * `MOCK` and `SAFE_GUARD_EVM` are deliberately excluded — see the
 * "Excluded providers" section below and ARCH-IMPL-2's own mission
 * report for the full evidence trail. `LIQUID_COVENANT` (an `EscrowType`
 * value with zero implementation — no entry in `PROVIDERS`, no provider
 * file) is not registered either: enum existence is not implementation.
 *
 * Structural capability tags are the minimum needed to describe what
 * each registered provider's code actually does today
 * (`escrow-providers.ts`'s own `SettlementProvider`/
 * `SignatureCollectionProvider` interfaces and each provider's real
 * method implementations, verified directly, not inferred from name):
 * `release`/`refund` (every real provider), `split` (only where a real,
 * non-throwing split path exists), `signatureCollection` (only where
 * release/refund/split go through the client-signature-collection flow
 * instead of a single direct provider call). No security/evidence/
 * maturity claim (`retrySafe`, `beneficiaryBoundDestinationProven`,
 * `productionEligible`, etc. — ADR-002 §6) is encoded here; those
 * belong to a future Evidence/Property layer, never to this one.
 */
import type { EscrowType } from './types/trade'
import type { Asset, SettlementRail, SettlementScope } from './types/settlement-scope'
import { isSettlementScopeRegistered, listSettlementScopes } from './settlement-scope-registry'

/**
 * The minimum structural capability vocabulary needed to describe the 3
 * providers registered below — deliberately not a large universal
 * vocabulary (ADR-002 §6 freezes the capability/property distinction,
 * not a final vocabulary). Extending this list requires the same
 * evidence discipline as adding a provider row: verify against real
 * code, never infer from a name.
 */
export type SettlementCapability = 'release' | 'refund' | 'split' | 'signatureCollection'

/**
 * A concrete provider's registration against one canonical
 * `SettlementScope`. Deliberately minimal: no provider/maturity/
 * evidence/eligibility field — see this file's own header comment.
 */
export interface SettlementProviderRegistration {
  /** Reuses the existing `EscrowType`/`PROVIDERS`-map identifier — never a new provider-ID scheme. */
  readonly id: EscrowType
  readonly scope: SettlementScope
  readonly capabilities: readonly SettlementCapability[]
}

function registration(
  id: EscrowType,
  scope: SettlementScope,
  capabilities: readonly SettlementCapability[],
): SettlementProviderRegistration {
  return Object.freeze({ id, scope: Object.freeze(scope), capabilities: Object.freeze([...capabilities]) })
}

// Verified directly against each provider file before registering (see
// ARCH-IMPL-2's own mission report for the full per-provider evidence):
//
// - MULTISIG -> {BTC, BITCOIN_L1}: real 2-of-3 Bitcoin PSBT construction
//   (multisig.provider.ts). release/refund via the signature-collection
//   flow (buildUnsignedRelease/buildUnsignedRefund + finalize*, real);
//   split via buildUnsignedSplit/finalizeSplit — real, the only
//   provider whose split path is not a throw-only override.
// - LIGHTNING_HODL -> {BTC, ARKADE}: real Arkade (Ark protocol) VTXO
//   escrow via @arkade-os/sdk against mutinynet (lightning-hodl.provider.ts)
//   — NOT plain Lightning (ADR-002 §11's own LN_BTC/ARKADE distinction).
//   release/refund via the signature-collection flow, real.
//   buildUnsignedSplit exists but always throws ("VtxoScript only has
//   fixed 2-of-2 leaves... none of which let the arbiter co-sign a
//   payout to both parties") — not a real split capability.
// - WDK_USDT_EVM -> {USDT, ETHEREUM}: real @tetherto/wdk-wallet-evm ERC-20
//   USDT transfers against a real, configured WDK_USDT_CONTRACT
//   (wdk-settlement.provider.ts), Sepolia testnet, server-custodial.
//   lockFunds/releaseFunds/refundFunds/splitFunds are all real, direct
//   calls — no signature-collection flow.
const PROVIDER_REGISTRATIONS: readonly SettlementProviderRegistration[] = Object.freeze([
  registration('MULTISIG', { asset: 'BTC', rail: 'BITCOIN_L1' }, ['release', 'refund', 'split', 'signatureCollection']),
  registration('LIGHTNING_HODL', { asset: 'BTC', rail: 'ARKADE' }, ['release', 'refund', 'signatureCollection']),
  registration('WDK_USDT_EVM', { asset: 'USDT', rail: 'ETHEREUM' }, ['release', 'refund', 'split']),
])

// Excluded providers (evidence, not guesses — ARCH-IMPL-2 mission report
// has the full trail):
//
// - MOCK: test infrastructure (escrow-providers.ts's own MockSettlementProvider
//   fakes every operation with a timeout+random id; getCustodyModelForType()
//   returns null for it by design — "no custody model to disclose").
//   Strong default per ARCH-IMPL-2 §11 applied: not canonical Product
//   Scope provider truth merely because it exists for tests.
// - SAFE_GUARD_EVM: real code exists (CREATE2 Safe/Guard deployment,
//   ERC-4337 UserOp construction — safe-guard-evm.provider.ts), but its
//   lockFunds() performs a *native EVM currency* balance check
//   ("a plain native-currency balance check has no specific
//   funding-transaction hash... without a third-party indexer" — its
//   own comment), not an ERC-20 USDT/USDC transfer. None of the 5
//   canonical Day-0 assets (BTC/USDT/USDC/DEPIX/XAUT) is native ETH —
//   registering it against {USDT,ETHEREUM} or {USDC,ETHEREUM} would be
//   factually wrong (it never touches those tokens), and no canonical
//   Asset exists for "native EVM currency." Returned as a finding
//   requiring a Product/Architecture Decision, not registered here
//   (ARCH-IMPL-2 §12 — "architecture/product decision required").
// - LIQUID_COVENANT: `EscrowType` value with zero implementation — no
//   entry in `PROVIDERS`, no provider file. Enum existence is not
//   provider implementation (ARCH-IMPL-2 §13).

// Invariant, enforced at module load (not just true by construction):
// every registered provider's scope must already be a canonical
// SettlementScope. This is the concrete mechanism that makes "Provider
// Registry cannot add new scope implicitly" true, not merely asserted.
for (const reg of PROVIDER_REGISTRATIONS) {
  if (!isSettlementScopeRegistered(reg.scope.asset, reg.scope.rail)) {
    throw new Error(
      `Provider Registry invariant violated: '${reg.id}' registers {${reg.scope.asset}, ${reg.scope.rail}}, ` +
      'which is not a canonical SettlementScope. A provider registration can never create Product Scope — ' +
      'register the scope in settlement-scope-registry.ts first, or fix this row.',
    )
  }
}

/** All provider registrations (currently 3), regardless of scope. */
export function listProviderRegistrations(): readonly SettlementProviderRegistration[] {
  return PROVIDER_REGISTRATIONS
}

/**
 * Provider registrations for a given `{asset, rail}` scope. Returns an
 * empty array both when the scope is unregistered AND when it is a
 * registered scope with zero providers (e.g. `{DEPIX, SPARK}`,
 * `{BTC, LIGHTNING}`) — this function does not, and must not, answer
 * "does this scope exist" (`isSettlementScopeRegistered` does that).
 * `requiredCapability`, if given, filters to providers that declare it.
 */
export function listProvidersForScope(
  asset: Asset,
  rail: SettlementRail,
  requiredCapability?: SettlementCapability,
): readonly SettlementProviderRegistration[] {
  return PROVIDER_REGISTRATIONS.filter(
    (reg) =>
      reg.scope.asset === asset &&
      reg.scope.rail === rail &&
      (requiredCapability === undefined || reg.capabilities.includes(requiredCapability)),
  )
}

/** Does provider `id` have a registration for `{asset, rail}`? */
export function providerSupportsScope(id: EscrowType, asset: Asset, rail: SettlementRail): boolean {
  return PROVIDER_REGISTRATIONS.some((reg) => reg.id === id && reg.scope.asset === asset && reg.scope.rail === rail)
}

// Re-exported so a consumer of this file's query results can also check
// "does this scope exist at all" without a second import — pure
// convenience re-export, not a new dependency: this file already
// imports `settlement-scope-registry.ts`.
export { listSettlementScopes }
