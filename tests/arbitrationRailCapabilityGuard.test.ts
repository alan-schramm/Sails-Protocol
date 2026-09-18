/**
 * ADR-003 boot compatibility guard.
 *
 * The guard now validates the effective arbitration policy per settlement
 * implementation rather than reasoning from one global market switch.
 * Invalid configuration must fail closed at boot; the config parser owns
 * rejection of values outside the closed ArbitrationMode vocabulary.
 */
import {
  assertArbitrationModeCompatibleWithAvailableRails,
  SCRIPT_COMMITTED_ARBITER_RAILS,
} from '../src/modules/open-settlement/escrow-providers'

describe('assertArbitrationModeCompatibleWithAvailableRails() — ADR-003', () => {
  it('refuses a global market default because MULTISIG has fixed arbiter commitment', () => {
    expect(() => assertArbitrationModeCompatibleWithAvailableRails('market')).toThrow(
      /MULTISIG.*FIXED_ARBITER_COMMITMENT|FIXED_ARBITER_COMMITMENT.*MULTISIG/
    )
  })

  it('boots cleanly under trusted-list mode — the deployment default', () => {
    expect(() => assertArbitrationModeCompatibleWithAvailableRails('trusted-list')).not.toThrow()
  })

  it('allows the intended mixed deployment: MOCK=market while MULTISIG remains trusted-list', () => {
    expect(() =>
      assertArbitrationModeCompatibleWithAvailableRails('trusted-list', {
        MOCK: 'market',
        MULTISIG: 'trusted-list',
      })
    ).not.toThrow()
  })

  it('fails closed when an override selects market for MULTISIG', () => {
    expect(() =>
      assertArbitrationModeCompatibleWithAvailableRails('trusted-list', {
        MULTISIG: 'market',
      })
    ).toThrow(/MULTISIG/)
  })

  it('SCRIPT_COMMITTED_ARBITER_RAILS still names exactly MULTISIG today', () => {
    expect([...SCRIPT_COMMITTED_ARBITER_RAILS]).toEqual(['MULTISIG'])
  })
})
