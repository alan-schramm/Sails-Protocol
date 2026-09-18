import {
  arbitrationCapabilityFor,
  assertArbitrationPolicyCompatible,
  createArbitrationProviderResolver,
  resolveArbitrationModeForImplementation,
} from '../src/modules/open-settlement/arbitration-policy'

describe('ADR-003 rail-scoped arbitration policy', () => {
  it('declares MULTISIG fixed and MOCK dynamically reassignable', () => {
    expect(arbitrationCapabilityFor('MULTISIG')).toBe('FIXED_ARBITER_COMMITMENT')
    expect(arbitrationCapabilityFor('MOCK')).toBe('DYNAMIC_REASSIGNABLE')
  })

  it('fails closed for an implementation whose arbitration capability is unknown', () => {
    expect(arbitrationCapabilityFor('WDK_USDT_EVM')).toBe('UNKNOWN')
    expect(() => assertArbitrationPolicyCompatible('WDK_USDT_EVM', 'market')).toThrow(/UNKNOWN/)
  })

  it('rejects market policy for MULTISIG', () => {
    expect(() => assertArbitrationPolicyCompatible('MULTISIG', 'market')).toThrow(
      /FIXED_ARBITER_COMMITMENT/
    )
  })

  it('allows market policy for MOCK', () => {
    expect(() => assertArbitrationPolicyCompatible('MOCK', 'market')).not.toThrow()
  })

  it('resolves an explicit implementation override ahead of the deployment default', () => {
    expect(resolveArbitrationModeForImplementation('MOCK', 'trusted-list', { MOCK: 'market' })).toBe('market')
    expect(resolveArbitrationModeForImplementation('MULTISIG', 'trusted-list', { MOCK: 'market' })).toBe('trusted-list')
  })

  it('supports a mixed deployment without requiring trusted arbiters for the MOCK market rail', () => {
    const resolver = createArbitrationProviderResolver(
      'trusted-list',
      { MOCK: 'market' },
      [],
    )
    expect(resolver('MOCK').name).toBe('market-arbitration')
  })

  it('still requires trusted arbiters when a rail effectively selects trusted-list', () => {
    const resolver = createArbitrationProviderResolver(
      'trusted-list',
      { MOCK: 'market' },
      [],
    )
    expect(() => resolver('MULTISIG')).toThrow(/No trusted arbitrators configured/)
  })
})
