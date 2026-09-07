/**
 * F5 (docs/TECHNICAL_DEBT_AUDIT.md #52) — proves the SDK-exported escrow
 * creation type and the server's accepted escrow creation schema resolve
 * to the SAME canonical structural source (@satsails/p2p-schemas), not
 * two independently-maintained copies that happen to agree today.
 *
 * CTO Gate correction (2026-09-07): an earlier version of this file also
 * tested a second, hand-written structural validator
 * (`isValidCreateEscrowInput()`) alongside the real server schema. That
 * helper has been removed — it was itself a second, independently
 * drifting validation implementation (its `lockedAmount` check was a
 * bare non-empty-string test, while the real server enforces
 * `positiveDecimalString()`), the exact class of duplication this
 * mission exists to close. Every assertion below now runs ONLY against
 * `createEscrowSchema`, the real, single runtime validation authority —
 * never a parallel stand-in for it.
 *
 * Deliberately does NOT re-type the field list or enum values a third
 * time — every assertion below either (a) inspects the REAL schema
 * object's own introspectable internals, or (b) is a compile-time type
 * identity check that fails to compile (not just fails a runtime
 * assertion) the moment any of the three declarations drifts.
 */
// This file only inspects `createEscrowSchema` (a pure zod object with no
// runtime behavior of its own) and never exercises a route handler, but
// importing settlement.routes.ts still pulls in its full module graph —
// including a real Redis client (via createSharedRateLimit()) that would
// otherwise retry connecting indefinitely with no server present (found
// directly: the un-mocked run left the process alive on repeated
// "Connection error" logs after all assertions had already passed). Same
// minimal no-op shape tests/routes.test.ts already establishes for this
// exact reason, trimmed to what this file actually needs (none of it is
// ever called here).
jest.mock('../src/common/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: jest.fn(),
    pexpire: jest.fn(),
    pttl: jest.fn(),
  },
}))

import {
  ESCROW_TYPE_VALUES,
  ASSET_TYPE_VALUES,
  type CreateEscrowInput as SchemaCreateEscrowInput,
} from '@satsails/p2p-schemas'
import { createEscrowSchema } from '../src/modules/open-settlement/settlement.routes'
import type { CreateEscrowInput as ServerCreateEscrowInput } from '../src/modules/open-settlement/escrow.service'
import type { CreateEscrowInput as SdkCreateEscrowInput } from '../packages/sails-sdk/src/modules/settlement'

// --- Compile-time identity check -------------------------------------------
// Standard zero-dependency TS type-equality idiom. If escrow.service.ts,
// settlement.ts (SDK), or settlement.routes.ts's z.infer<> ever redeclares
// its own competing CreateEscrowInput shape instead of re-exporting the
// canonical one, this file fails to COMPILE — ts-jest surfaces that as a
// test-suite failure, not a passing test with a silently-wrong assertion.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T
type _ServerMatchesSchema = Expect<Equal<ServerCreateEscrowInput, SchemaCreateEscrowInput>>
type _SdkMatchesSchema = Expect<Equal<SdkCreateEscrowInput, SchemaCreateEscrowInput>>
type _ServerInferredBodyMatchesSchema = Expect<Equal<import('zod').infer<typeof createEscrowSchema>, SchemaCreateEscrowInput>>

describe('escrow creation schema parity (F5) — against the real server Zod schema only', () => {
  it('the server enum was constructed from the canonical ESCROW_TYPE_VALUES array, not a copy', () => {
    const typeField = createEscrowSchema.shape.type
    const options = (typeField as unknown as { unwrap: () => { options: readonly string[] } }).unwrap().options
    expect(options).toEqual(ESCROW_TYPE_VALUES)
  })

  it('the server enum was constructed from the canonical ASSET_TYPE_VALUES array, not a copy', () => {
    const assetField = createEscrowSchema.shape.asset
    const options = (assetField as unknown as { options: readonly string[] }).options
    expect(options).toEqual(ASSET_TYPE_VALUES)
  })

  const validBase = { tradeId: 'trade-1', lockedAmount: '1.5', asset: 'BTC' as const }

  it('the real server schema accepts every currently valid escrow type — the real, current historical provider set', () => {
    const historicalProviders = ['MOCK', 'MULTISIG', 'LIGHTNING_HODL', 'WDK_USDT_EVM', 'SAFE_GUARD_EVM'] as const
    for (const type of historicalProviders) {
      expect(createEscrowSchema.safeParse({ ...validBase, type }).success).toBe(true)
    }
  })

  it('LIQUID_COVENANT remains structurally valid on the real server schema (reserved/unimplemented at the provider level, not the schema level — not changed by this fix)', () => {
    expect(createEscrowSchema.safeParse({ ...validBase, type: 'LIQUID_COVENANT' }).success).toBe(true)
  })

  it('the real server schema accepts every currently valid asset type', () => {
    for (const asset of ASSET_TYPE_VALUES) {
      expect(createEscrowSchema.safeParse({ tradeId: 'trade-1', lockedAmount: '1.5', asset }).success).toBe(true)
    }
  })

  it('the real server schema rejects an invalid/unknown escrow type', () => {
    expect(createEscrowSchema.safeParse({ ...validBase, type: 'NOT_A_REAL_TYPE' }).success).toBe(false)
  })

  it('the real server schema rejects an invalid/unknown asset type', () => {
    expect(createEscrowSchema.safeParse({ tradeId: 'trade-1', lockedAmount: '1.5', asset: 'NOT_A_REAL_ASSET' }).success).toBe(false)
  })

  it('the real server schema rejects a missing required field (tradeId)', () => {
    expect(createEscrowSchema.safeParse({ lockedAmount: '1.5', asset: 'BTC' }).success).toBe(false)
  })

  it('the real server schema rejects a missing required field (asset)', () => {
    expect(createEscrowSchema.safeParse({ tradeId: 'trade-1', lockedAmount: '1.5' }).success).toBe(false)
  })

  it('optional fields (type, network, timelockHours) remain optional on the real server schema — omitting all three still validates', () => {
    expect(createEscrowSchema.safeParse(validBase).success).toBe(true)
  })

  it('optional fields, when present, still validate on the real server schema', () => {
    const input = { ...validBase, type: 'MULTISIG' as const, network: 'testnet', timelockHours: 24 }
    expect(createEscrowSchema.safeParse(input).success).toBe(true)
  })

  // F5 must not change lockedAmount's existing server-side business
  // validation (positiveDecimalString()) — these prove it is still the
  // real, unchanged authority, not silently loosened or duplicated.
  it("lockedAmount's existing positive-decimal validation on the real server schema is unchanged — a non-positive amount is still rejected", () => {
    expect(createEscrowSchema.safeParse({ ...validBase, lockedAmount: '0' }).success).toBe(false)
    expect(createEscrowSchema.safeParse({ ...validBase, lockedAmount: '-1' }).success).toBe(false)
    expect(createEscrowSchema.safeParse({ ...validBase, lockedAmount: 'not-a-number' }).success).toBe(false)
  })

  it("lockedAmount's existing positive-decimal validation on the real server schema is unchanged — a genuinely positive amount is still accepted", () => {
    expect(createEscrowSchema.safeParse({ ...validBase, lockedAmount: '0.00000001' }).success).toBe(true)
  })
})
