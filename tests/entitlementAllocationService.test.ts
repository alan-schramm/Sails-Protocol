/**
 * entitlement-allocation.service.ts — Missão 11 Fase 6.3A.
 *
 * allocate()/reverseEntry()/reverseGeneration() run everything inside a
 * real prisma.$transaction (the same atomicity discipline
 * FeeDistributionRepository.addObligationToBatch() already established,
 * Fase 2.2) — real-Postgres proof of their behavior lives in
 * tests/integration/distributionEntitlementFoundation.test.ts, not here (a
 * mocked Prisma client cannot prove a real transaction's atomicity or a
 * real DB trigger's behavior). This file covers the one pure,
 * dependency-free function this module exports for direct unit testing —
 * same "exported for direct unit testing" precedent as
 * multisig.provider.ts's keyIndexFor() and
 * wdk-settlement.provider.ts's toBaseUnits().
 */
import { nativeUnitDecimalsFor } from '../src/modules/open-settlement/entitlement-allocation.service'

describe('nativeUnitDecimalsFor() — fail-closed native-unit precision mapping', () => {
  it('maps every Bitcoin-denominated asset to 8 decimals (satoshi precision)', () => {
    expect(nativeUnitDecimalsFor('BTC')).toBe(8)
    expect(nativeUnitDecimalsFor('LN_BTC')).toBe(8)
    expect(nativeUnitDecimalsFor('LIQUID_BTC')).toBe(8)
    expect(nativeUnitDecimalsFor('RSK_BTC')).toBe(8)
  })

  it('maps every named USDT variant to 6 decimals (matching wdk-settlement.provider.ts\'s own USDT_DECIMALS)', () => {
    expect(nativeUnitDecimalsFor('USDT_ERC20')).toBe(6)
    expect(nativeUnitDecimalsFor('USDT_TRC20')).toBe(6)
    expect(nativeUnitDecimalsFor('USDT_LIQUID')).toBe(6)
    expect(nativeUnitDecimalsFor('USDT_LIGHTNING')).toBe(6)
  })

  it('fails closed (throws) for an asset with no defined native-unit precision, rather than guessing', () => {
    expect(() => nativeUnitDecimalsFor('SPARK' as any)).toThrow(/no native-unit decimals mapping/)
    expect(() => nativeUnitDecimalsFor('STACKS' as any)).toThrow(/no native-unit decimals mapping/)
  })
})
