/**
 * assertArbitrationModeCompatibleWithAvailableRails() — Missão 11 Fase
 * 7.3.2 §1 (CTO-approved fail-closed boot guard).
 *
 * MULTISIG's P2WSH script commits exactly ONE specific, executable
 * arbiter identity at escrow-creation time — no other identity is ever
 * cryptographically capable of executing a ruling on that script (see
 * multisig.provider.ts's own header comment). ARBITRATION_MODE=market's
 * entire premise (a dynamic, collateral/reputation-weighted draw across
 * many registered arbiters) can therefore never actually be exercised for
 * a MULTISIG dispute — dispute.service.ts's own Fase 7.3.1 §B fix makes
 * this SAFE (the script commitment always wins), but silently so. This
 * guard makes the incompatibility a loud, explicit boot-time refusal
 * instead of a silently-ignored configuration.
 *
 * Tested directly against the exported function (same precedent as
 * configProductionGates.test.ts's own direct-guard-testing style) rather
 * than through a full buildApp() boot — no existing test controls
 * config.settlement.arbitrationMode for a full app instance, and this
 * function has zero side effects worth re-testing through that much
 * heavier setup.
 */
import { assertArbitrationModeCompatibleWithAvailableRails, SCRIPT_COMMITTED_ARBITER_RAILS } from '../src/modules/open-settlement/escrow-providers'

describe('assertArbitrationModeCompatibleWithAvailableRails() (Fase 7.3.2 §1)', () => {
  it('refuses to boot when ARBITRATION_MODE=market and a script-committed-arbiter rail is available', () => {
    expect(() => assertArbitrationModeCompatibleWithAvailableRails('market')).toThrow(/FATAL: ARBITRATION_MODE=market/)
  })

  it('the refusal message names the actual incompatible rail(s) and suggests the fix', () => {
    try {
      assertArbitrationModeCompatibleWithAvailableRails('market')
      fail('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      const message = (err as Error).message
      expect(message).toMatch(/MULTISIG/)
      expect(message).toMatch(/ARBITRATION_MODE=trusted-list/)
    }
  })

  it('boots cleanly under trusted-list mode — the deployment default', () => {
    expect(() => assertArbitrationModeCompatibleWithAvailableRails('trusted-list')).not.toThrow()
  })

  it('does not fire for an unrecognized mode value — this guard only ever names market as incompatible, never guesses about others', () => {
    expect(() => assertArbitrationModeCompatibleWithAvailableRails('some-future-mode')).not.toThrow()
  })

  it('SCRIPT_COMMITTED_ARBITER_RAILS names exactly MULTISIG today — the one rail that actually persists an arbiter commitment', () => {
    expect([...SCRIPT_COMMITTED_ARBITER_RAILS]).toEqual(['MULTISIG'])
  })
})
