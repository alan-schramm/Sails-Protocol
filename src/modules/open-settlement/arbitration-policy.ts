/**
 * ADR-003 — rail-scoped arbitration capability + policy truth.
 *
 * Pure module by design: no runtime provider imports, no database, no
 * configuration side effects. Boot validation and service selection may
 * both depend on this without creating provider/import cycles.
 */
import type { EscrowType } from '../../common/types/trade'

export type ArbitrationMode = 'trusted-list' | 'market'

export function parseArbitrationMode(raw: string | undefined, source = 'ARBITRATION_MODE'): ArbitrationMode {
  const value = raw?.trim() || 'trusted-list'
  if (value !== 'trusted-list' && value !== 'market') {
    throw new Error(`Invalid ${source} value '${value}'. Expected trusted-list|market`)
  }
  return value
}
export type ArbitrationCapability =
  | 'FIXED_ARBITER_COMMITMENT'
  | 'DYNAMIC_REASSIGNABLE'
  | 'UNKNOWN'

const CAPABILITY_BY_IMPLEMENTATION: Readonly<Partial<Record<EscrowType, ArbitrationCapability>>> = Object.freeze({
  MULTISIG: 'FIXED_ARBITER_COMMITMENT',
  MOCK: 'DYNAMIC_REASSIGNABLE',
})

export function arbitrationCapabilityFor(implementation: string): ArbitrationCapability {
  return CAPABILITY_BY_IMPLEMENTATION[implementation as EscrowType] ?? 'UNKNOWN'
}

export function resolveArbitrationModeForImplementation(
  implementation: string,
  defaultMode: ArbitrationMode,
  overrides: Readonly<Record<string, ArbitrationMode>>,
): ArbitrationMode {
  return overrides[implementation] ?? defaultMode
}

export function assertArbitrationPolicyCompatible(
  implementation: string,
  mode: ArbitrationMode,
): void {
  if (mode !== 'market') return
  const capability = arbitrationCapabilityFor(implementation)
  if (capability === 'DYNAMIC_REASSIGNABLE') return

  throw new Error(
    `FATAL: arbitration policy selects market for settlement implementation '${implementation}', ` +
    `but its arbitration capability is ${capability}. Market arbitration requires DYNAMIC_REASSIGNABLE. ` +
    'Refusing to boot with a policy whose economic authority semantics cannot be honored.'
  )
}
