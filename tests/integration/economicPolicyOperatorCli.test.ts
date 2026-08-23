// tests/integration/economicPolicyOperatorCli.test.ts
//
// Missão 11 Fase 7.2 §R (items 19-20) — the bootstrap operator CLI
// (scripts/publish-economic-policy.ts, §J/§K) is genuinely invoked as a
// child process here (not imported and called as a function) — the whole
// point is proving what an operator running it from a real shell actually
// sees and experiences, including its process exit code and its refusal
// to proceed without explicit confirmation.

import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

const execFileAsync = promisify(execFile)
const REPO_ROOT = path.join(__dirname, '..', '..')
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'publish-economic-policy.ts')
// Invoke ts-node's own JS entry point via the current `node` binary
// directly (process.execPath), not the `.bin/ts-node[.cmd]` wrapper.
// Two real, reproduced Windows-specific problems ruled this out first:
// (1) execFile without shell:true cannot spawn a `.cmd` file at all on
// Windows (spawn EINVAL — `.cmd` is a shell script, not a real
// executable); (2) execFile WITH shell:true on Windows hands the argv
// array to cmd.exe without re-quoting it, silently splitting this repo's
// own path at the space in "Alan Schramm" ("Cannot find module
// './Alan'"). `node.exe` is a real executable, so a plain argv array
// with no shell involved sidesteps both problems entirely.
const TS_NODE_ENTRY = path.join(REPO_ROOT, 'node_modules', 'ts-node', 'dist', 'bin.js')

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [TS_NODE_ENTRY, CLI_PATH, ...args], { cwd: REPO_ROOT })
    return { stdout, stderr, code: 0 }
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 }
  }
}

describe('scripts/publish-economic-policy.ts — operator CLI safety (Missão 11 Fase 7.2 §R, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  // ─── R19: refuses insufficient confirmation ──────────────────────────────
  // fail() writes to console.error (stderr), not stdout — check both
  // streams combined rather than assuming which one a given message lands
  // on (confirmed directly: reproduced a real false failure asserting on
  // stdout alone before this fix).
  it('R19a: exits non-zero and refuses when --type is missing', async () => {
    requirePostgres('R19a')
    const result = await runCli([])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--type/)
  })

  it('R19b: exits non-zero and refuses when --id is missing', async () => {
    requirePostgres('R19b')
    const result = await runCli(['--type', 'fee'])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--id/)
  })

  it('R19c: exits non-zero and refuses when --confirm-economic-change is missing, even with a valid type and a real id', async () => {
    requirePostgres('R19c')
    const result = await runCli(['--type', 'fee', '--id', 'some-fake-id-not-even-checked-yet'])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*no undo/)
  })

  it('R19d: refuses an unrecognized --type value rather than guessing', async () => {
    requirePostgres('R19d')
    const result = await runCli(['--type', 'nonsense', '--id', 'x', '--confirm-economic-change'])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--type must be exactly/)
  })

  // ─── R20: never leaks DATABASE_URL credentials ───────────────────────────
  it('R20: never prints the DATABASE_URL password/username, even on a refusal path', async () => {
    requirePostgres('R20')
    const result = await runCli([]) // header + refusal — the path most likely to print connection info
    const combined = result.stdout + result.stderr
    // The real local dev password (per .env.example / config default) —
    // if the CLI ever changes to print the raw connection string, this
    // fails loudly rather than silently passing.
    expect(combined).not.toMatch(/password/i)
    expect(combined).toMatch(/Target database: localhost:5432\/sails_protocol/) // redacted form IS expected
  })
})
