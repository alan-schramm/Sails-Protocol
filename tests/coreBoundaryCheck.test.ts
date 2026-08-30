/**
 * Proves the M0 mechanical boundary actually rejects representative
 * forbidden behavior and accepts legitimate pure code — the "boundary
 * negative tests" required by the Core Implementation Program Phase 1
 * mission and docs/CORE_IMPLEMENTATION_ARCHITECTURE.md §17.
 *
 * Fixtures live under packages/sails-core/tests/fixtures/*.ts.fixture —
 * deliberately NOT a `.ts` extension, so an intentionally-invalid
 * "import Prisma into Core" sample can never enter any real TypeScript
 * compilation path (root tsconfig's `src/**\/*.ts`, sails-core's own
 * `src/**\/*.ts`, or Jest's own test matcher) merely by existing on
 * disk. This test reads each fixture as plain text and hands it to
 * `checkSourceText` directly, in memory — exactly the pattern
 * `scripts/check-core-boundary.ts`'s own header describes.
 */
import * as fs from 'fs'
import * as path from 'path'
import { checkSourceText, BoundaryViolation } from '../scripts/check-core-boundary'

const FIXTURES_DIR = path.join(__dirname, '..', 'packages', 'sails-core', 'tests', 'fixtures')

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8')
}

function rules(violations: BoundaryViolation[]): string[] {
  return violations.map((v) => v.rule)
}

describe('Core boundary — forbidden import detection', () => {
  it('rejects a Prisma import', () => {
    const violations = checkSourceText('violation-prisma-import.ts', readFixture('violation-prisma-import.ts.fixture'))
    expect(violations.length).toBeGreaterThan(0)
    expect(rules(violations)).toContain('forbidden-import')
    expect(violations[0].detail).toMatch(/@prisma\/client/)
  })

  it('rejects a Redis client import and a Provider SDK import in the same file', () => {
    const violations = checkSourceText(
      'violation-redis-provider-sdk.ts',
      readFixture('violation-redis-provider-sdk.ts.fixture'),
    )
    const details = violations.map((v) => v.detail).join('\n')
    expect(rules(violations)).toEqual(['forbidden-import', 'forbidden-import'])
    expect(details).toMatch(/ioredis/)
    expect(details).toMatch(/@tetherto\/wdk-wallet-evm/)
  })

  it('rejects require(...) even when used to reach a forbidden module', () => {
    const violations = checkSourceText(
      'violation-require-and-dynamic-import.ts',
      readFixture('violation-require-and-dynamic-import.ts.fixture'),
    )
    expect(rules(violations)).toContain('forbidden-require')
    expect(rules(violations)).toContain('forbidden-dynamic-import')
  })
})

describe('Core boundary — ambient-effect detection', () => {
  it('rejects Date.now(), bare new Date(), process.env, Math.random, fetch, and setTimeout', () => {
    const violations = checkSourceText(
      'violation-ambient-effects.ts',
      readFixture('violation-ambient-effects.ts.fixture'),
    )
    const details = violations.map((v) => v.detail).join('\n')
    expect(rules(violations).every((r) => r === 'ambient-global')).toBe(true)
    expect(details).toMatch(/Date\.now/)
    expect(details).toMatch(/new Date\(\) with no arguments/)
    expect(details).toMatch(/ambient global "process"/)
    expect(details).toMatch(/Math\.random/)
    expect(details).toMatch(/ambient global "fetch"/)
    expect(details).toMatch(/ambient global "setTimeout"/)
  })
})

describe('Core boundary — legitimate pure code is never flagged', () => {
  it('accepts relative imports, explicit-argument Date conversion, and non-random Math usage', () => {
    const violations = checkSourceText(
      'clean-pure-computation.ts',
      readFixture('clean-pure-computation.ts.fixture'),
    )
    expect(violations).toEqual([])
  })
})

describe('Core boundary — the real package is clean today', () => {
  it('finds zero violations across packages/sails-core/src', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { checkDirectory } = require('../scripts/check-core-boundary') as typeof import('../scripts/check-core-boundary')
    const srcDir = path.join(__dirname, '..', 'packages', 'sails-core', 'src')
    const violations = checkDirectory(srcDir)
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error(violations)
    }
    expect(violations).toEqual([])
  })
})
