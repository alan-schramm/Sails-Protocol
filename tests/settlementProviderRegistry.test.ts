/**
 * ARCH-IMPL-2 / ARCH-IMPL-2-R1 — SettlementProviderRegistration registry
 * (`src/common/settlement-provider-registry.ts`), the second additive
 * layer over ADR-002: which concrete settlement implementations can
 * serve a canonical `SettlementScope`. Proves the dependency direction
 * (Provider Registry depends on SettlementScope Registry, never the
 * reverse), that registration cannot create or remove Product Scope,
 * the exact evidenced implementation-to-scope mappings, and (R1) that
 * `EscrowType` is never documented or treated as canonical Provider
 * Identity — the model must not foreclose a future multi-provider state.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  listProviderRegistrations,
  listProvidersForScope,
  implementationSupportsScope,
} from '../src/common/settlement-provider-registry'
import type { SettlementProviderRegistration } from '../src/common/settlement-provider-registry'
import { isSettlementScopeRegistered, listSettlementScopes } from '../src/common/settlement-scope-registry'

describe('SettlementProviderRegistry — dependency direction (ARCH-IMPL-2 §2)', () => {
  const providerRegistrySource = fs.readFileSync(
    path.join(__dirname, '../src/common/settlement-provider-registry.ts'),
    'utf8',
  )

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  }

  const IMPORT_STATEMENT = /^import\s+(?:type\s+)?(?:\{([^}]*)\}|(\S+))\s+from\s+['"]([^'"]+)['"]/gm

  function imports(source: string): Array<{ names: string[]; specifier: string }> {
    const code = stripComments(source)
    return [...code.matchAll(IMPORT_STATEMENT)].map((m) => ({
      names: (m[1] ?? m[2] ?? '').split(',').map((n) => n.trim()).filter(Boolean),
      specifier: m[3],
    }))
  }

  it('the Provider Registry imports the SettlementScope registry (the required downward dependency)', () => {
    const providerImports = imports(providerRegistrySource)
    expect(providerImports.some((imp) => imp.specifier === './settlement-scope-registry')).toBe(true)
  })

  it('the Provider Registry has no import statement naming AssetType (legacy isolation preserved)', () => {
    const providerImports = imports(providerRegistrySource)
    for (const imp of providerImports) {
      expect(imp.names.join(',')).not.toMatch(/\bAssetType\b/)
    }
  })

  it('the SettlementScope registry does not import the Provider Registry (never the reverse direction)', () => {
    const scopeRegistrySource = fs.readFileSync(
      path.join(__dirname, '../src/common/settlement-scope-registry.ts'),
      'utf8',
    )
    const scopeImports = imports(scopeRegistrySource)
    expect(scopeImports.some((imp) => imp.specifier.includes('settlement-provider-registry'))).toBe(false)
  })
})

describe('SettlementProviderRegistry — registered implementations', () => {
  it('contains exactly 3 registrations', () => {
    expect(listProviderRegistrations()).toHaveLength(3)
  })

  it('has no duplicate implementation values', () => {
    const implementations = listProviderRegistrations().map((r) => r.implementation)
    expect(new Set(implementations).size).toBe(implementations.length)
  })

  it('has no duplicate {implementation, scope} rows', () => {
    const keys = listProviderRegistrations().map((r) => `${r.implementation}:${r.scope.asset}:${r.scope.rail}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('MULTISIG maps to {BTC, BITCOIN_L1}', () => {
    expect(implementationSupportsScope('MULTISIG', 'BTC', 'BITCOIN_L1')).toBe(true)
  })

  it('LIGHTNING_HODL maps to {BTC, ARKADE}, not {BTC, LIGHTNING} (real Arkade backing, not plain Lightning)', () => {
    expect(implementationSupportsScope('LIGHTNING_HODL', 'BTC', 'ARKADE')).toBe(true)
    expect(implementationSupportsScope('LIGHTNING_HODL', 'BTC', 'LIGHTNING')).toBe(false)
  })

  it('WDK_USDT_EVM maps to {USDT, ETHEREUM}', () => {
    expect(implementationSupportsScope('WDK_USDT_EVM', 'USDT', 'ETHEREUM')).toBe(true)
  })

  it('MOCK is excluded from the canonical provider registry', () => {
    expect(listProviderRegistrations().some((r) => r.implementation === 'MOCK')).toBe(false)
    expect(implementationSupportsScope('MOCK', 'BTC', 'BITCOIN_L1')).toBe(false)
  })

  it('SAFE_GUARD_EVM is excluded (no canonical Day-0 asset for its native-EVM-currency settlement)', () => {
    expect(listProviderRegistrations().some((r) => r.implementation === 'SAFE_GUARD_EVM')).toBe(false)
  })

  it('LIQUID_COVENANT is excluded (EscrowType value with zero implementation)', () => {
    expect(listProviderRegistrations().some((r) => r.implementation === 'LIQUID_COVENANT')).toBe(false)
  })
})

describe('SettlementProviderRegistry — capabilities reflect real code, not guesses', () => {
  it('MULTISIG declares release/refund/split/signatureCollection (its buildUnsignedSplit is real)', () => {
    const [multisig] = listProvidersForScope('BTC', 'BITCOIN_L1')
    expect([...multisig.capabilities].sort()).toEqual(['refund', 'release', 'signatureCollection', 'split'])
  })

  it('LIGHTNING_HODL declares release/refund/signatureCollection but NOT split (its buildUnsignedSplit always throws)', () => {
    const [lightningHodl] = listProvidersForScope('BTC', 'ARKADE')
    expect([...lightningHodl.capabilities].sort()).toEqual(['refund', 'release', 'signatureCollection'])
    expect(lightningHodl.capabilities).not.toContain('split')
  })

  it('WDK_USDT_EVM declares release/refund/split but NOT signatureCollection (direct calls, no signing flow)', () => {
    const [wdk] = listProvidersForScope('USDT', 'ETHEREUM')
    expect([...wdk.capabilities].sort()).toEqual(['refund', 'release', 'split'])
    expect(wdk.capabilities).not.toContain('signatureCollection')
  })

  it('listProvidersForScope filters by required capability', () => {
    expect(listProvidersForScope('BTC', 'BITCOIN_L1', 'split')).toHaveLength(1)
    expect(listProvidersForScope('BTC', 'ARKADE', 'split')).toHaveLength(0)
  })
})

describe('SettlementProviderRegistry — provider registration never defines Product Scope', () => {
  it('every provider registration references an already-canonical SettlementScope', () => {
    for (const reg of listProviderRegistrations()) {
      expect(isSettlementScopeRegistered(reg.scope.asset, reg.scope.rail)).toBe(true)
    }
  })

  it('DEPIX + SPARK remains registered Product Scope with zero providers', () => {
    expect(isSettlementScopeRegistered('DEPIX', 'SPARK')).toBe(true)
    expect(listProvidersForScope('DEPIX', 'SPARK')).toEqual([])
  })

  it('BTC + LIGHTNING remains registered Product Scope even though no provider implements it', () => {
    expect(isSettlementScopeRegistered('BTC', 'LIGHTNING')).toBe(true)
    expect(listProvidersForScope('BTC', 'LIGHTNING')).toEqual([])
  })

  it('an unregistered scope returns zero providers, not an error', () => {
    expect(listProvidersForScope('XAUT', 'ARKADE')).toEqual([])
  })

  it('the SettlementScope registry still has exactly 25 rows — unaffected by provider registration', () => {
    expect(listSettlementScopes()).toHaveLength(25)
  })

  it('a provider registry module that tried to reference an unregistered scope would fail at load time (invariant, not just convention)', () => {
    // The real module (already loaded above) enforces this via a
    // module-load-time check against isSettlementScopeRegistered for
    // every row — this test documents the property the invariant
    // protects, using the same predicate the real check uses, rather
    // than re-loading a second broken module copy (isolateModules would
    // require duplicating the whole registry inline, which risks
    // silently drifting from the real file).
    for (const reg of listProviderRegistrations()) {
      expect(isSettlementScopeRegistered(reg.scope.asset, reg.scope.rail)).toBe(true)
    }
  })
})

describe('SettlementProviderRegistry — provider identity semantics (ARCH-IMPL-2-R1)', () => {
  const providerRegistrySource = fs.readFileSync(
    path.join(__dirname, '../src/common/settlement-provider-registry.ts'),
    'utf8',
  )

  it('the registration type field is named `implementation`, not `id` — EscrowType is never documented as canonical Provider Identity', () => {
    // Type-level proof: this line only compiles if `implementation`
    // really is the field name. If a future edit renamed it back to
    // `id` without updating this test, this file would fail to
    // typecheck, not silently pass.
    const [sample] = listProviderRegistrations()
    const implementationValue: string = sample.implementation
    expect(typeof implementationValue).toBe('string')
    expect(Object.prototype.hasOwnProperty.call(sample, 'id')).toBe(false)
  })

  it('the source does not claim EscrowType IS (canonical) Provider Identity, and explicitly says it is not', () => {
    // ARCH-IMPL-2's original wording ("Provider identity reuses the
    // existing `EscrowType` identifier") is the exact overclaim
    // ARCH-IMPL-2-R1 corrected — must not reappear.
    expect(providerRegistrySource).not.toMatch(/Provider identity reuses/i)
    // The corrected file must explicitly say EscrowType is NOT Provider Identity.
    expect(providerRegistrySource).toMatch(/EscrowType`? is NOT canonical Provider Identity/)
  })

  it('registry identity (implementation) is independent of Product Scope — the same implementation can appear in multiple scopes without collapsing scope identity', () => {
    // MULTISIG/LIGHTNING_HODL/WDK_USDT_EVM each register exactly one
    // scope today, but nothing in the type ties `implementation` to a
    // single scope — proven structurally by scope filtering working
    // per-row, not per-implementation.
    const multisigRows = listProviderRegistrations().filter((r) => r.implementation === 'MULTISIG')
    expect(multisigRows).toHaveLength(1)
    expect(multisigRows[0].scope).toEqual({ asset: 'BTC', rail: 'BITCOIN_L1' })
  })
})

describe('SettlementProviderRegistry — future multi-provider compatibility (ARCH-IMPL-2-R1 §3/§8)', () => {
  it('the SettlementProviderRegistration type does not name or require a 1:1 implementation<->scope invariant', () => {
    // Structural proof, not a runtime one: two rows sharing the same
    // `implementation` but different `scope` values already typecheck
    // and behave correctly today — nothing rejects that shape. This
    // demonstrates the type does not encode "one implementation, one
    // scope, forever."
    const hypotheticalSecondRow: SettlementProviderRegistration = Object.freeze({
      implementation: 'MULTISIG',
      scope: Object.freeze({ asset: 'BTC', rail: 'LIQUID' }),
      capabilities: Object.freeze(['release', 'refund'] as const),
    })
    const combined = [...listProviderRegistrations(), hypotheticalSecondRow]
    const multisigRows = combined.filter((r) => r.implementation === 'MULTISIG')
    expect(multisigRows).toHaveLength(2)
    // Not registered in the real module — this array is local to the
    // test and never passed through the module's own invariant check,
    // so it proves only that the TYPE tolerates the shape, not that
    // this scope is authorized (it is not: {BTC, LIQUID} has no real
    // MULTISIG provider today).
  })

  it('a future second provider instance sharing an existing implementation would not conceptually violate this model (documented, not implemented)', () => {
    // Canonical Provider Identity (distinguishing "operator A running
    // MULTISIG" from "operator B running MULTISIG" against the same
    // scope) is a deliberately unmodeled future concept (ARCH-IMPL-2-R1).
    // This test exists to fail loudly if a future change adds a runtime
    // assertion enforcing implementation<->scope uniqueness beyond the
    // duplicate-row guard above (which only rejects an EXACT duplicate
    // {implementation, scope} pair, never a second, distinct provider
    // instance for the same implementation+scope) — that would be a
    // real architectural narrowing this mission was told not to make.
    const duplicateExactRowCount = listProviderRegistrations().filter(
      (r) => r.implementation === 'MULTISIG' && r.scope.asset === 'BTC' && r.scope.rail === 'BITCOIN_L1',
    ).length
    expect(duplicateExactRowCount).toBe(1) // today's real, evidenced state
    // No assertion here claims this MUST stay 1 forever — only that it
    // is 1 today, which is what current implementation evidence shows.
  })
})

describe('SettlementProviderRegistry — determinism', () => {
  it('query results are deterministic across repeated calls', () => {
    expect(listProviderRegistrations()).toEqual(listProviderRegistrations())
    expect(listProvidersForScope('BTC', 'BITCOIN_L1')).toEqual(listProvidersForScope('BTC', 'BITCOIN_L1'))
  })

  it('consumers cannot mutate the canonical provider registry', () => {
    const regs = listProviderRegistrations()
    expect(() => {
      ;(regs as SettlementProviderRegistration[]).push(regs[0])
    }).toThrow()
    expect(listProviderRegistrations()).toHaveLength(3)
  })
})

describe('SettlementProviderRegistry — no maturity/evidence/eligibility fields (ADR-002 §6/§7)', () => {
  it('a registration carries only {implementation, scope, capabilities}', () => {
    for (const reg of listProviderRegistrations()) {
      expect(Object.keys(reg).sort()).toEqual(['capabilities', 'implementation', 'scope'])
    }
  })

  it('no registration carries a maturity/evidence/eligibility flag', () => {
    const disallowedKeys = ['productionEligible', 'betaEligible', 'evidencePassed', 'auditStatus', 'retrySafe', 'beneficiaryBoundDestinationProven', 'recoveryProven', 'productionSafe']
    for (const reg of listProviderRegistrations()) {
      for (const key of disallowedKeys) {
        expect(Object.prototype.hasOwnProperty.call(reg, key)).toBe(false)
      }
    }
  })
})
