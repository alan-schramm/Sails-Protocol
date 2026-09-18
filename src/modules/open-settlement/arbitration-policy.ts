/**
 * ADR-003 — Rail-scoped arbitration capability + policy.
 *
 * This module contains policy truth only. It does not select settlement
 * providers and does not make Product Scope claims.
 */
import type { EscrowType } from '../../common/types/trade'
import type { ArbitrationProvider } from './arbitration-provider'
import { TrustedArbitratorProvider } from './arbitration-provider'
import { marketArbitrationProvider } from './market-arbitration.provider'
import { ValidationError } from '../../common/errors'

export type ArbitrationMode = 'trusted-list' | 'market'
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

export function createArbitrationProviderResolver(
  defaultMode: ArbitrationMode,
  overrides: Readonly<Record<string, ArbitrationMode>>,
  trustedArbitrators: readonly string[],
): (implementation: string) => ArbitrationProvider {
  let trustedProvider: TrustedArbitratorProvider | null = null

  return (implementation: string): ArbitrationProvider => {
    const mode = resolveArbitrationModeForImplementation(implementation, defaultMode, overrides)
    assertArbitrationPolicyCompatible(implementation, mode)

    if (mode === 'market') return marketArbitrationProvider

    if (trustedArbitrators.length === 0) {
      throw new ValidationError('No trusted arbitrators configured — set TRUSTED_ARBITRATORS (RFC-007 D4)')
    }
    if (!trustedProvider) trustedProvider = new TrustedArbitratorProvider([...trustedArbitrators])
    return trustedProvider
  }
}
