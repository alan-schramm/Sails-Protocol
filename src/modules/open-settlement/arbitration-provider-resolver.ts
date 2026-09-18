import type { ArbitrationProvider } from './arbitration-provider'
import { TrustedArbitratorProvider } from './arbitration-provider'
import { marketArbitrationProvider } from './market-arbitration.provider'
import { ValidationError } from '../../common/errors'
import {
  assertArbitrationPolicyCompatible,
  resolveArbitrationModeForImplementation,
  type ArbitrationMode,
} from './arbitration-policy'

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
