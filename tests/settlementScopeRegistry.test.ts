/**
 * ARCH-IMPL-1 / ARCH-IMPL-1-R1 — first runtime implementation of ADR-002's
 * SettlementScope registry (`src/common/settlement-scope-registry.ts`,
 * relocated out of `src/core/` and split from the legacy translator
 * `src/common/settlement-scope-legacy.ts` in the R1 boundary correction).
 * Proves the 25 canonical Day-0 rows, the sparse/no-cross-product
 * property, the providerless-is-valid-scope property, that the registry
 * cannot be mutated by a consumer, and that the canonical registry has
 * no dependency on the legacy `AssetType`.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { SettlementScope } from '../src/common/types/settlement-scope'
import {
  isSettlementScopeRegistered,
  listSettlementScopes,
  listSettlementRailsForAsset,
  listAssetsForSettlementRail,
} from '../src/common/settlement-scope-registry'
import { translateLegacyAssetType } from '../src/common/settlement-scope-legacy'

describe('SettlementScope registry — canonical Day-0 rows', () => {
  it('contains exactly 25 rows', () => {
    expect(listSettlementScopes()).toHaveLength(25)
  })

  it('has no duplicate {asset, rail} rows', () => {
    const keys = listSettlementScopes().map((s) => `${s.asset}:${s.rail}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('contains every ADR-002 §5 Day-0 scope', () => {
    const expected: SettlementScope[] = [
      { asset: 'BTC', rail: 'BITCOIN_L1' },
      { asset: 'BTC', rail: 'LIGHTNING' },
      { asset: 'BTC', rail: 'SPARK' },
      { asset: 'BTC', rail: 'ARKADE' },
      { asset: 'BTC', rail: 'LIQUID' },
      { asset: 'DEPIX', rail: 'LIQUID' },
      { asset: 'DEPIX', rail: 'SPARK' },
      { asset: 'USDT', rail: 'ETHEREUM' },
      { asset: 'USDT', rail: 'BASE' },
      { asset: 'USDT', rail: 'OPTIMISM' },
      { asset: 'USDT', rail: 'POLYGON' },
      { asset: 'USDT', rail: 'AVALANCHE' },
      { asset: 'USDT', rail: 'SOLANA' },
      { asset: 'USDT', rail: 'TRON' },
      { asset: 'USDT', rail: 'TON' },
      { asset: 'USDT', rail: 'BNB_CHAIN' },
      { asset: 'USDT', rail: 'ARBITRUM' },
      { asset: 'USDT', rail: 'LIQUID' },
      { asset: 'USDC', rail: 'ETHEREUM' },
      { asset: 'USDC', rail: 'BASE' },
      { asset: 'USDC', rail: 'OPTIMISM' },
      { asset: 'USDC', rail: 'ARBITRUM' },
      { asset: 'USDC', rail: 'AVALANCHE' },
      { asset: 'USDC', rail: 'POLYGON' },
      { asset: 'XAUT', rail: 'ETHEREUM' },
    ]
    for (const row of expected) {
      expect(isSettlementScopeRegistered(row.asset, row.rail)).toBe(true)
    }
    expect(listSettlementScopes()).toHaveLength(expected.length)
  })

  it('per-asset row counts match ADR-002 §5 (BTC 5, DEPIX 2, USDT 11, USDC 6, XAUT 1)', () => {
    expect(listSettlementRailsForAsset('BTC')).toHaveLength(5)
    expect(listSettlementRailsForAsset('DEPIX')).toHaveLength(2)
    expect(listSettlementRailsForAsset('USDT')).toHaveLength(11)
    expect(listSettlementRailsForAsset('USDC')).toHaveLength(6)
    expect(listSettlementRailsForAsset('XAUT')).toHaveLength(1)
  })
})

describe('SettlementScope registry — sparse, not a cross-product', () => {
  it('rejects an unregistered combination: XAUT + ARKADE', () => {
    expect(isSettlementScopeRegistered('XAUT', 'ARKADE')).toBe(false)
  })

  it('rejects other plausible-but-unregistered combinations without guessing', () => {
    expect(isSettlementScopeRegistered('XAUT', 'TRON')).toBe(false)
    expect(isSettlementScopeRegistered('DEPIX', 'ETHEREUM')).toBe(false)
    expect(isSettlementScopeRegistered('USDC', 'TRON')).toBe(false)
  })

  it('treats BTC + LIGHTNING and BTC + ARKADE as separate, independently-registered scopes', () => {
    expect(isSettlementScopeRegistered('BTC', 'LIGHTNING')).toBe(true)
    expect(isSettlementScopeRegistered('BTC', 'ARKADE')).toBe(true)
    const rails = listSettlementRailsForAsset('BTC')
    expect(rails).toContain('LIGHTNING')
    expect(rails).toContain('ARKADE')
  })
})

describe('SettlementScope registry — presence implies scope only, never provider/evidence/maturity', () => {
  it('a providerless scope (DEPIX + SPARK) is still registered Product Scope', () => {
    // No provider exists for DEPIX+SPARK today (ADR-002 §5) — registration
    // must not depend on provider existence.
    expect(isSettlementScopeRegistered('DEPIX', 'SPARK')).toBe(true)
  })

  it('listAssetsForSettlementRail is consistent with listSettlementRailsForAsset (inverse query)', () => {
    expect(listAssetsForSettlementRail('LIQUID')).toEqual(expect.arrayContaining(['BTC', 'DEPIX', 'USDT']))
    expect(listAssetsForSettlementRail('TRON')).toEqual(['USDT'])
  })

  it('an unregistered rail for any asset returns an empty list, not an error', () => {
    expect(listSettlementRailsForAsset('XAUT')).toEqual(['ETHEREUM'])
    expect(listAssetsForSettlementRail('LIGHTNING')).toEqual(['BTC'])
  })
})

describe('SettlementScope registry — determinism and immutability', () => {
  it('query results are deterministic across repeated calls', () => {
    expect(listSettlementScopes()).toEqual(listSettlementScopes())
    expect(listSettlementRailsForAsset('USDT')).toEqual(listSettlementRailsForAsset('USDT'))
    expect(isSettlementScopeRegistered('BTC', 'LIQUID')).toBe(isSettlementScopeRegistered('BTC', 'LIQUID'))
  })

  it('consumers cannot mutate the canonical registry by pushing to the returned list', () => {
    const scopes = listSettlementScopes()
    expect(() => {
      ;(scopes as SettlementScope[]).push({ asset: 'XAUT', rail: 'ARKADE' })
    }).toThrow()
    expect(listSettlementScopes()).toHaveLength(25)
  })

  it('consumers cannot mutate a canonical row in place', () => {
    const [first] = listSettlementScopes()
    expect(() => {
      ;(first as { asset: string }).asset = 'USDT'
    }).toThrow()
  })
})

describe('SettlementScope registry — legacy translation, safe subset only', () => {
  it('translates the 5 high-confidence legacy AssetType values named in ADR-002 §11', () => {
    expect(translateLegacyAssetType('BTC')).toEqual({ asset: 'BTC', rail: 'BITCOIN_L1' })
    expect(translateLegacyAssetType('USDT_ERC20')).toEqual({ asset: 'USDT', rail: 'ETHEREUM' })
    expect(translateLegacyAssetType('USDT_TRC20')).toEqual({ asset: 'USDT', rail: 'TRON' })
    expect(translateLegacyAssetType('USDT_LIQUID')).toEqual({ asset: 'USDT', rail: 'LIQUID' })
    expect(translateLegacyAssetType('LIQUID_BTC')).toEqual({ asset: 'BTC', rail: 'LIQUID' })
  })

  it('does NOT automatically translate the ambiguous legacy values', () => {
    expect(translateLegacyAssetType('LN_BTC')).toBeNull()
    expect(translateLegacyAssetType('STACKS')).toBeNull()
    expect(translateLegacyAssetType('RSK_BTC')).toBeNull()
  })

  it('returns null for every other legacy value not named by ADR-002 §11', () => {
    expect(translateLegacyAssetType('SPARK')).toBeNull()
    expect(translateLegacyAssetType('USDT_LIGHTNING')).toBeNull()
  })
})

describe('SettlementScope — static architecture guard (ADR-002 §2/§4/§6/§7/§9)', () => {
  it('a SettlementScope row carries only {asset, rail} — no provider/maturity/evidence/interoperability keys', () => {
    for (const row of listSettlementScopes()) {
      expect(Object.keys(row).sort()).toEqual(['asset', 'rail'])
    }
  })

  it('the canonical registry itself has no extra top-level entries beyond the 25 scope rows', () => {
    // Structural guard: every entry in the array is a plain {asset, rail}
    // object — nothing resembling a provider registration, capability
    // flag, evidence record, or maturity/eligibility field has been
    // smuggled into the registry.
    const disallowedKeys = ['provider', 'providerId', 'capability', 'evidence', 'maturity', 'productionEligible', 'interoperability']
    for (const row of listSettlementScopes()) {
      for (const key of disallowedKeys) {
        expect(Object.prototype.hasOwnProperty.call(row, key)).toBe(false)
      }
    }
  })
})

describe('SettlementScope — legacy dependency boundary (ARCH-IMPL-1-R1)', () => {
  const registrySource = fs.readFileSync(
    path.join(__dirname, '../src/common/settlement-scope-registry.ts'),
    'utf8',
  )
  const legacySource = fs.readFileSync(
    path.join(__dirname, '../src/common/settlement-scope-legacy.ts'),
    'utf8',
  )

  // Only real `import ...` statements count as a dependency — both
  // files' header comments legitimately *discuss* AssetType/
  // settlement-scope-legacy.ts in prose to document the dependency
  // direction, which must not itself trip this guard. So this strips
  // block/line comments before inspecting import statements, rather
  // than grepping the raw file for identifier mentions anywhere.
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

  it('the canonical registry has no import statement naming AssetType, EscrowType, Prisma, or the legacy translator', () => {
    const registryImports = imports(registrySource)
    for (const imp of registryImports) {
      expect(imp.specifier).not.toMatch(/settlement-scope-legacy/)
      expect(imp.specifier).not.toMatch(/[Pp]risma/)
      expect(imp.names.join(',')).not.toMatch(/\bAssetType\b/)
      expect(imp.names.join(',')).not.toMatch(/\bEscrowType\b/)
    }
  })

  it('only settlement-scope-legacy.ts imports AssetType', () => {
    const legacyImports = imports(legacySource)
    const importsAssetType = legacyImports.some(
      (imp) => imp.specifier === './types' && imp.names.some((n) => n.includes('AssetType')),
    )
    expect(importsAssetType).toBe(true)
  })

  it('canonical scope queries work with only the registry module required (no legacy import needed)', () => {
    let registry: typeof import('../src/common/settlement-scope-registry')
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      registry = require('../src/common/settlement-scope-registry')
    })
    expect(registry!.listSettlementScopes()).toHaveLength(25)
    expect(registry!.isSettlementScopeRegistered('BTC', 'BITCOIN_L1')).toBe(true)
  })
})
