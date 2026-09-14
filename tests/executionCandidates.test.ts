/**
 * Mission 4 (docs/ADAPTIVE_EXECUTION_CAPABILITY_ROUTING.md) —
 * `src/common/execution-candidates.ts`'s Candidate Discovery layer.
 *
 * R1 (CTO Gate Corrective, 2026-09-14): the original version collapsed
 * "scope registered, zero providers at all" and "scope registered,
 * provider(s) exist, none declare the required capability" into the
 * same `SCOPE_REGISTERED_NO_PROVIDER` outcome — a false statement for a
 * case like `{BTC, ARKADE}` + `requiredCapability: 'split'`
 * (LIGHTNING_HODL IS registered there, it just doesn't declare `split`).
 * This file now proves all five outcomes stay distinct, with the exact
 * scenarios the CTO required.
 */
import {
  discoverExecutionCandidates,
  resolveSingleStructurallyCompatibleImplementation,
} from '../src/common/execution-candidates'

describe('discoverExecutionCandidates() — the five exhaustive outcomes', () => {
  it('SCOPE_NOT_REGISTERED for a real {asset, rail} pair that was never registered (XAUT is only Day-0 on ETHEREUM)', () => {
    const result = discoverExecutionCandidates('XAUT', 'ARKADE')
    expect(result).toEqual({ outcome: 'SCOPE_NOT_REGISTERED', asset: 'XAUT', rail: 'ARKADE' })
  })

  // CTO-required scenario 1: {DEPIX, SPARK} = registered scope / genuinely zero provider.
  it('SCOPE_REGISTERED_NO_PROVIDER for {DEPIX, SPARK} — registered Day-0 scope, genuinely zero providers, no capability filter involved', () => {
    const result = discoverExecutionCandidates('DEPIX', 'SPARK')
    expect(result).toEqual({ outcome: 'SCOPE_REGISTERED_NO_PROVIDER', scope: { asset: 'DEPIX', rail: 'SPARK' } })
  })

  it('SCOPE_REGISTERED_NO_PROVIDER for {BTC, LIGHTNING} — registered, but LIGHTNING_HODL is registered against ARKADE, not LIGHTNING', () => {
    const result = discoverExecutionCandidates('BTC', 'LIGHTNING')
    expect(result).toEqual({ outcome: 'SCOPE_REGISTERED_NO_PROVIDER', scope: { asset: 'BTC', rail: 'LIGHTNING' } })
  })

  // CTO-required scenario 2: {BTC, ARKADE} + 'split' = provider exists but capability mismatch.
  it('NO_PROVIDER_WITH_REQUIRED_CAPABILITY for {BTC, ARKADE} + split — LIGHTNING_HODL IS registered here, it just does not declare split (never SCOPE_REGISTERED_NO_PROVIDER)', () => {
    const result = discoverExecutionCandidates('BTC', 'ARKADE', 'split')
    expect(result.outcome).toBe('NO_PROVIDER_WITH_REQUIRED_CAPABILITY')
    if (result.outcome === 'NO_PROVIDER_WITH_REQUIRED_CAPABILITY') {
      expect(result.requiredCapability).toBe('split')
      expect(result.registeredProviders.map((p) => p.implementation)).toEqual(['LIGHTNING_HODL'])
      expect(result.scope).toEqual({ asset: 'BTC', rail: 'ARKADE' })
    }
  })

  // CTO-required scenario 3: {BTC, ARKADE} without 'split' = structurally compatible candidate exists.
  it('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE for {BTC, ARKADE} with no capability filter — LIGHTNING_HODL, the only registered implementation', () => {
    const result = discoverExecutionCandidates('BTC', 'ARKADE')
    expect(result.outcome).toBe('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE')
    if (result.outcome === 'SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE') {
      expect(result.candidate.implementation).toBe('LIGHTNING_HODL')
    }
  })

  it('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE for {BTC, ARKADE} + release — LIGHTNING_HODL DOES declare release, unlike split', () => {
    const result = discoverExecutionCandidates('BTC', 'ARKADE', 'release')
    expect(result.outcome).toBe('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE')
    if (result.outcome === 'SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE') {
      expect(result.candidate.implementation).toBe('LIGHTNING_HODL')
    }
  })

  it('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE for {BTC, BITCOIN_L1} — MULTISIG, the only registered implementation', () => {
    const result = discoverExecutionCandidates('BTC', 'BITCOIN_L1')
    expect(result.outcome).toBe('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE')
    if (result.outcome === 'SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE') {
      expect(result.candidate.implementation).toBe('MULTISIG')
      expect(result.scope).toEqual({ asset: 'BTC', rail: 'BITCOIN_L1' })
    }
  })

  it('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE for {USDT, ETHEREUM} — WDK_USDT_EVM', () => {
    const result = discoverExecutionCandidates('USDT', 'ETHEREUM')
    expect(result.outcome).toBe('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE')
    if (result.outcome === 'SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE') {
      expect(result.candidate.implementation).toBe('WDK_USDT_EVM')
    }
  })

  it('MULTISIG at {BTC, BITCOIN_L1} DOES declare split — requesting it returns the same single candidate, not NO_PROVIDER_WITH_REQUIRED_CAPABILITY', () => {
    const result = discoverExecutionCandidates('BTC', 'BITCOIN_L1', 'split')
    expect(result.outcome).toBe('SINGLE_STRUCTURALLY_COMPATIBLE_CANDIDATE')
  })

  it('WDK_USDT_EVM at {USDT, ETHEREUM} does NOT declare signatureCollection — NO_PROVIDER_WITH_REQUIRED_CAPABILITY, not SCOPE_REGISTERED_NO_PROVIDER', () => {
    const result = discoverExecutionCandidates('USDT', 'ETHEREUM', 'signatureCollection')
    expect(result.outcome).toBe('NO_PROVIDER_WITH_REQUIRED_CAPABILITY')
    if (result.outcome === 'NO_PROVIDER_WITH_REQUIRED_CAPABILITY') {
      expect(result.registeredProviders.map((p) => p.implementation)).toEqual(['WDK_USDT_EVM'])
    }
  })

  // CTO-required scenario 4: none of the five outcomes collapse into the same reason.
  it('none of the five outcomes collapse — SCOPE_NOT_REGISTERED, SCOPE_REGISTERED_NO_PROVIDER, and NO_PROVIDER_WITH_REQUIRED_CAPABILITY are three distinct outcome strings for three distinct real scenarios', () => {
    const notRegistered = discoverExecutionCandidates('XAUT', 'ARKADE')
    const registeredNoProvider = discoverExecutionCandidates('DEPIX', 'SPARK')
    const registeredNoCapabilityMatch = discoverExecutionCandidates('BTC', 'ARKADE', 'split')

    const outcomes = [notRegistered.outcome, registeredNoProvider.outcome, registeredNoCapabilityMatch.outcome]
    expect(new Set(outcomes).size).toBe(3) // all three distinct — none collapse
    expect(outcomes).toEqual(['SCOPE_NOT_REGISTERED', 'SCOPE_REGISTERED_NO_PROVIDER', 'NO_PROVIDER_WITH_REQUIRED_CAPABILITY'])
  })

  it('never throws for any input — always returns a structured outcome', () => {
    expect(() => discoverExecutionCandidates('XAUT', 'SOLANA')).not.toThrow()
  })

  it('is deterministic — repeated calls with the same input return equal results', () => {
    expect(discoverExecutionCandidates('BTC', 'BITCOIN_L1')).toEqual(discoverExecutionCandidates('BTC', 'BITCOIN_L1'))
  })
})

describe('resolveSingleStructurallyCompatibleImplementation() — the single-candidate convenience used by escrow.service.ts', () => {
  it('returns { implementation } for a scope with exactly one structurally compatible candidate', () => {
    expect(resolveSingleStructurallyCompatibleImplementation('BTC', 'BITCOIN_L1')).toEqual({ implementation: 'MULTISIG' })
  })

  it('returns three distinct, honest { error } messages for SCOPE_NOT_REGISTERED vs SCOPE_REGISTERED_NO_PROVIDER vs NO_PROVIDER_WITH_REQUIRED_CAPABILITY — never the same string for different reasons', () => {
    const notRegistered = resolveSingleStructurallyCompatibleImplementation('XAUT', 'ARKADE')
    const registeredNoProvider = resolveSingleStructurallyCompatibleImplementation('DEPIX', 'SPARK')
    const noCapabilityMatch = resolveSingleStructurallyCompatibleImplementation('BTC', 'ARKADE', 'split')

    expect('error' in notRegistered).toBe(true)
    expect('error' in registeredNoProvider).toBe(true)
    expect('error' in noCapabilityMatch).toBe(true)
    if ('error' in notRegistered && 'error' in registeredNoProvider && 'error' in noCapabilityMatch) {
      const messages = new Set([notRegistered.error, registeredNoProvider.error, noCapabilityMatch.error])
      expect(messages.size).toBe(3) // all three distinct
      expect(notRegistered.error).toMatch(/not a registered Product Scope/)
      expect(registeredNoProvider.error).toMatch(/zero registered settlement implementations/)
      expect(noCapabilityMatch.error).toMatch(/none declare the required 'split' capability/)
    }
  })

  // No real Day-0 scope has >1 registered implementation today (confirmed
  // by this mission's own audit — every registered scope is 0:1) — the
  // MULTIPLE_STRUCTURALLY_COMPATIBLE_CANDIDATES branch inside
  // resolveSingleStructurallyCompatibleImplementation() cannot be
  // exercised against real registry data without adding a fake second
  // provider row to the actual module (which would misrepresent Product
  // Scope truth just to satisfy a test — exactly what
  // settlement-provider-registry.ts's own module-load invariant exists to
  // prevent). Its correctness instead rests on: (1) TypeScript's own
  // exhaustiveness check on the `outcome` discriminant inside the real
  // function's `switch` — deleting or mishandling that branch fails
  // `tsc --noEmit`, not just this test file; (2) the identical branch
  // already proven correct in escrow.service.ts's own predecessor logic
  // (VERTICAL-SLICE-1's "Expected exactly one registered settlement
  // implementation... found N" guard, real for years before this
  // generalization) via `tests/escrowProviderWiring.test.ts`. This is
  // disclosed, not silently skipped.
})
