/**
 * getSettlementProvider() — Missão 11 Fase 7.3.1 §A adversarial proof.
 *
 * Phase 7.3's audit found a real P0: `config.features.mockEscrow` used to
 * short-circuit getSettlementProvider() BEFORE `type` was ever consulted
 * (escrow-providers.ts), so a persisted, real MULTISIG escrow silently
 * resolved to MockSettlementProvider whenever MOCK_ESCROW was left at its
 * own default (true) and NODE_ENV wasn't the exact literal string
 * 'production' — the only value config/index.ts's RT-001 boot guard
 * checks. 'staging', a typo, or simply an unset NODE_ENV all sailed
 * straight past it with zero protection.
 *
 * The fix (escrow-providers.ts) is structural, not another
 * environment-name convention: getSettlementProvider() no longer reads
 * config.features.mockEscrow (or NODE_ENV) at all for any type other than
 * the literal string 'MOCK'. This file proves that directly against the
 * function itself — it does not re-toggle NODE_ENV (tests/
 * configProductionGates.test.ts already covers config/index.ts's own
 * separate boot-time RT-001 guard; that guard is unchanged by this fix
 * and stays a real, independent second layer of protection for the one
 * NODE_ENV value it does check).
 */
let mockEscrowFeatureFlag = false
jest.mock('../src/config', () => ({
  get config() {
    return { features: { mockEscrow: mockEscrowFeatureFlag } }
  },
}))

jest.mock('../src/modules/open-settlement/multisig.provider', () => ({
  multisigProvider: { name: 'MULTISIG' },
}))
jest.mock('../src/modules/open-settlement/lightning-hodl.provider', () => ({
  lightningHodlProvider: { name: 'LIGHTNING_HODL' },
}))
jest.mock('../src/modules/open-settlement/safe-guard-evm.provider', () => ({
  safeGuardEvmProvider: { name: 'SAFE_GUARD_EVM' },
}))
jest.mock('../src/modules/open-settlement/wdk-settlement.provider', () => ({
  wdkSettlementProvider: { name: 'WDK_USDT_EVM' },
}))

import { getSettlementProvider } from '../src/modules/open-settlement/escrow-providers'

describe('getSettlementProvider() — structural fail-closed selection (Fase 7.3.1 §A)', () => {
  beforeEach(() => {
    mockEscrowFeatureFlag = false
  })

  // Proof 1/2/3 — MULTISIG always resolves to the real provider,
  // regardless of mockEscrow (which is the only lever this function used
  // to read; NODE_ENV was never read here directly, config/index.ts's own
  // RT-001 guard is the separate, already-covered layer for that).
  it('MULTISIG resolves to the real MultisigProvider when mockEscrow is false', () => {
    mockEscrowFeatureFlag = false
    expect(getSettlementProvider('MULTISIG').name).toBe('MULTISIG')
  })

  it('MULTISIG resolves to the real MultisigProvider even when mockEscrow defaults/is left true — the P0 this phase closes', () => {
    mockEscrowFeatureFlag = true
    expect(getSettlementProvider('MULTISIG').name).toBe('MULTISIG')
  })

  // Proof 6 — no global flag can override a persisted real type, for any
  // real rail, not just MULTISIG.
  it('every other real registered type also resolves to its own real provider regardless of mockEscrow', () => {
    mockEscrowFeatureFlag = true
    expect(getSettlementProvider('LIGHTNING_HODL').name).toBe('LIGHTNING_HODL')
    expect(getSettlementProvider('SAFE_GUARD_EVM').name).toBe('SAFE_GUARD_EVM')
    expect(getSettlementProvider('WDK_USDT_EVM').name).toBe('WDK_USDT_EVM')
  })

  // Proof 4 — an escrow explicitly, deliberately created with type='MOCK'
  // still resolves to the mock provider, with or without the flag — this
  // is the ONE legitimate way to get a fake escrow, decided once at
  // creation time, never inferred later at settlement time.
  it('an explicitly MOCK-typed escrow still resolves to MockSettlementProvider, flag on or off', () => {
    mockEscrowFeatureFlag = false
    expect(getSettlementProvider('MOCK').name).toBe('MOCK')
    mockEscrowFeatureFlag = true
    expect(getSettlementProvider('MOCK').name).toBe('MOCK')
  })

  // Proof 5 — an unregistered/malformed type fails closed (throws), it is
  // never silently absorbed into MOCK just because the flag happens to be
  // on.
  it('an unregistered type throws instead of silently falling back to MOCK, even with mockEscrow true', () => {
    mockEscrowFeatureFlag = true
    expect(() => getSettlementProvider('LIQUID_COVENANT')).toThrow(
      "No SettlementProvider registered for escrow type 'LIQUID_COVENANT'"
    )
  })
})
