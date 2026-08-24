// tests/integration/draftEconomicPolicyOperatorCli.test.ts
//
// Missão 11 Fase 7.3.1 §F — the companion draft-creation CLI
// (scripts/draft-economic-policy.ts). Genuinely invoked as a child
// process (same rationale as economicPolicyOperatorCli.test.ts's own
// header comment) — proving what an operator running it from a real
// shell actually sees, including exit code and refusal behavior.
//
// Also proves the real gap this phase found and fixed: a draft created
// through this CLI (and therefore through FeePolicyService.createDraft()
// itself) is actually publishable — requiredConfirmations is set, unlike
// before this fix (fee-policy-repository.ts's own header comment).

import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { createPostgresIntegrationHarness } from './postgresTestHarness'

const execFileAsync = promisify(execFile)
const REPO_ROOT = path.join(__dirname, '..', '..')
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'draft-economic-policy.ts')
const TS_NODE_ENTRY = path.join(REPO_ROOT, 'node_modules', 'ts-node', 'dist', 'bin.js')

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [TS_NODE_ENTRY, CLI_PATH, ...args], { cwd: REPO_ROOT })
    return { stdout, stderr, code: 0 }
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.code ?? 1 }
  }
}

describe('scripts/draft-economic-policy.ts — operator CLI safety (Missão 11 Fase 7.3.1 §F, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: import('@prisma/client').PrismaClient

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  function suffix() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

  it('refuses when --action is missing', async () => {
    requirePostgres('missing action')
    const result = await runCli([])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--action must be one of/)
  })

  it('refuses an unrecognized --action rather than guessing', async () => {
    requirePostgres('bad action')
    const result = await runCli(['--action', 'nonsense'])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--action must be one of/)
  })

  it('refuses when --confirm-draft-creation is missing, even with a valid action', async () => {
    requirePostgres('missing confirm')
    const result = await runCli(['--action', 'create-recipient', '--class', 'X', '--label', 'Y'])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--confirm-draft-creation/)
  })

  it('create-fee-draft refuses a non-canonical --payer-model rather than accepting a near-miss', async () => {
    requirePostgres('bad payer model')
    const result = await runCli([
      '--action', 'create-fee-draft', '--label', 'x', '--rail-scope', 'x', '--protocol-fee-rate', '0.004',
      '--required-confirmations', '1', '--payer-model', 'BUYER_PAYS', '--economic-basis', 'SELLER_DELIVERED_VALUE',
      '--created-by', 'test', '--confirm-draft-creation',
    ])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--payer-model must be exactly "SELLER_PAYS"/)
  })

  it('create-fee-draft refuses a non-integer --required-confirmations', async () => {
    requirePostgres('bad confirmations')
    const result = await runCli([
      '--action', 'create-fee-draft', '--label', 'x', '--rail-scope', 'x', '--protocol-fee-rate', '0.004',
      '--required-confirmations', '1.5', '--payer-model', 'SELLER_PAYS', '--economic-basis', 'SELLER_DELIVERED_VALUE',
      '--created-by', 'test', '--confirm-draft-creation',
    ])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--required-confirmations must be a positive integer/)
  })

  it('never prints the DATABASE_URL password, even on a refusal path', async () => {
    requirePostgres('secret redaction')
    const result = await runCli([])
    const combined = result.stdout + result.stderr
    expect(combined).not.toMatch(/password/i)
    expect(combined).toMatch(/Target database: localhost:5432\/sails_protocol/)
  })

  // ─── Real end-to-end proof: the gap this phase found is actually closed ──
  it('a fee draft created via this CLI is immediately publishable end to end (requiredConfirmations is actually set)', async () => {
    requirePostgres('end-to-end fee draft -> publish')
    const s = suffix()
    const railScope = `FIXTURE_RAIL_DRAFT_CLI-${s}`

    const createResult = await runCli([
      '--action', 'create-fee-draft', '--label', `draft-cli-${s}`, '--rail-scope', railScope,
      '--protocol-fee-rate', '0.004', '--required-confirmations', '2',
      '--payer-model', 'SELLER_PAYS', '--economic-basis', 'SELLER_DELIVERED_VALUE',
      '--created-by', 'fase7-3-1-draft-cli-test', '--confirm-draft-creation',
    ])
    expect(createResult.code).toBe(0)
    const idMatch = createResult.stdout.match(/Created: id=([0-9a-f-]+)/)
    expect(idMatch).not.toBeNull()
    const draftId = idMatch![1]

    // Before this phase's fix, this row's requiredConfirmations would have
    // been NULL — publish() would reject it. Prove it wasn't.
    const row = await prisma.feePolicyVersion.findUniqueOrThrow({ where: { id: draftId } })
    expect(row.status).toBe('DRAFT')
    expect(row.requiredConfirmations).toBe(2)

    const { feePolicyService } = require('../../src/modules/open-settlement/fee-policy.service')
    const published = await feePolicyService.publish(draftId)
    expect(published.status).toBe('PUBLISHED')

    await feePolicyService.retire(draftId) // leave no PUBLISHED row behind for other tests' exclusivity checks
  })

  it('a distribution draft + recipient created via this CLI is immediately publishable end to end', async () => {
    requirePostgres('end-to-end distribution draft -> publish')
    const s = suffix()

    const recipientResult = await runCli([
      '--action', 'create-recipient', '--class', `DRAFT_CLI_TEST_${s.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
      '--label', 'draft-cli-fixture-recipient', '--confirm-draft-creation',
    ])
    expect(recipientResult.code).toBe(0)
    const recipientId = recipientResult.stdout.match(/Created: id=([0-9a-f-]+)/)![1]

    const { distributionPolicyService } = require('../../src/modules/open-settlement/distribution-policy.service')
    const live = await distributionPolicyService.findLivePolicy()
    if (live) await distributionPolicyService.retire(live.id)

    const draftResult = await runCli([
      '--action', 'create-distribution-draft', '--label', `draft-cli-dist-${s}`,
      '--created-by', 'fase7-3-1-draft-cli-test', '--confirm-draft-creation',
    ])
    expect(draftResult.code).toBe(0)
    const policyId = draftResult.stdout.match(/Created: id=([0-9a-f-]+)/)![1]

    const addResult = await runCli([
      '--action', 'add-recipient-to-draft', '--policy-id', policyId, '--recipient-id', recipientId,
      '--weight-pct', '100', '--confirm-draft-creation',
    ])
    expect(addResult.code).toBe(0)

    const published = await distributionPolicyService.publish(policyId)
    expect(published.status).toBe('PUBLISHED')
    await distributionPolicyService.retire(policyId)
  })
})
