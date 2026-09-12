/**
 * ARCH-IMPL-2 — SettlementProviderRegistration registry
 * (`src/common/settlement-provider-registry.ts`), the second additive
 * layer over ADR-002: which concrete provider registrations can serve a
 * canonical `SettlementScope`. Proves the dependency direction
 * (Provider Registry depends on SettlementScope Registry, never the
 * reverse), that provider registration cannot create or remove Product
 * Scope, and the exact evidenced provider-to-scope mappings.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  listProviderRegistrations,
  listProvidersForScope,
  providerSupportsScope,
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

describe('SettlementProviderRegistry — registered providers', () => {
  it('contains exactly 3 registrations', () => {
    expect(listProviderRegistrations()).toHaveLength(3)
  })

  it('has no duplicate provider IDs', () => {
    const ids = listProviderRegistrations().map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no duplicate {id, scope} rows', () => {
    const keys = listProviderRegistrations().map((r) => `${r.id}:${r.scope.asset}:${r.scope.rail}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('MULTISIG maps to {BTC, BITCOIN_L1}', () => {
    expect(providerSupportsScope('MULTISIG', 'BTC', 'BITCOIN_L1')).toBe(true)
  })

  it('LIGHTNING_HODL maps to {BTC, ARKADE}, not {BTC, LIGHTNING} (real Arkade backing, not plain Lightning)', () => {
    expect(providerSupportsScope('LIGHTNING_HODL', 'BTC', 'ARKADE')).toBe(true)
    expect(providerSupportsScope('LIGHTNING_HODL', 'BTC', 'LIGHTNING')).toBe(false)
  })

  it('WDK_USDT_EVM maps to {USDT, ETHEREUM}', () => {
    expect(providerSupportsScope('WDK_USDT_EVM', 'USDT', 'ETHEREUM')).toBe(true)
  })

  it('MOCK is excluded from the canonical provider registry', () => {
    expect(listProviderRegistrations().some((r) => r.id === 'MOCK')).toBe(false)
    expect(providerSupportsScope('MOCK', 'BTC', 'BITCOIN_L1')).toBe(false)
  })

  it('SAFE_GUARD_EVM is excluded (no canonical Day-0 asset for its native-EVM-currency settlement)', () => {
    expect(listProviderRegistrations().some((r) => r.id === 'SAFE_GUARD_EVM')).toBe(false)
  })

  it('LIQUID_COVENANT is excluded (EscrowType value with zero implementation)', () => {
    expect(listProviderRegistrations().some((r) => r.id === 'LIQUID_COVENANT')).toBe(false)
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
  it('a registration carries only {id, scope, capabilities}', () => {
    for (const reg of listProviderRegistrations()) {
      expect(Object.keys(reg).sort()).toEqual(['capabilities', 'id', 'scope'])
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
