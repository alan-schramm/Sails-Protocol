/**
 * scripts/publish-economic-policy.ts — Missão 11 Fase 7.2 §J (CTO Decision,
 * Fase 7.1A §E — Model A: offline/operator CLI).
 *
 * The FIRST controlled Satsails production bootstrap needs a way to
 * publish a FeePolicyVersion/DistributionPolicyVersion (moving it from
 * DRAFT to PUBLISHED — the moment it becomes economically live) without
 * inventing a new governance system, a magic admin identity, or an HTTP
 * admin endpoint. This repository has zero admin-token pattern anywhere
 * (.env.example confirmed clean of any ADMIN_KEY/OPERATOR_SECRET before
 * this file was written) and "Governance Layer v1" is explicitly not yet
 * built (docs/GOVERNANCE.md) — inventing either here would be exactly the
 * "magic admin identity" / "isolated auth mechanism" the CTO mandate
 * forbids.
 *
 * This is bootstrap OPERATIONAL governance, not final protocol governance:
 * a plain, ts-node, server-side-only script — no HTTP surface, no
 * credential to mint/rotate/leak. Running it requires shell + DATABASE_URL
 * access to the target environment, the same trust boundary this
 * repository already assumes for `npm run db:migrate` and the existing
 * `db:seed` precedent (`ts-node src/test/seeds/seed.ts` — a script run
 * manually by a trusted operator against the real DB, no HTTP surface at
 * all). When Governance Layer v1 exists, only the CALLER changes (a
 * governance-approved process invokes the same service-layer publish()
 * calls this script calls today) — the underlying contract is unchanged.
 *
 * All structural/economic validation stays exactly where it already lives
 * (FeePolicyService.publish() / DistributionPolicyService.publish()) —
 * this script duplicates none of it. Its only job is the operator-safety
 * layer around that call: explicit type, explicit id, explicit
 * confirmation, clear non-fabricated audit output, fail-closed on any
 * ambiguity.
 *
 * Usage:
 *   npm run economics:publish-policy -- --type fee --id <uuid> --confirm-economic-change
 *   npm run economics:publish-policy -- --type distribution --id <uuid> --confirm-economic-change
 */
import { config } from '../src/config'
import { feePolicyVersionRepository } from '../src/modules/open-settlement/fee-policy-repository'
import { feePolicyService } from '../src/modules/open-settlement/fee-policy.service'
import { distributionPolicyRepository } from '../src/modules/open-settlement/distribution-policy-repository'
import { distributionPolicyService } from '../src/modules/open-settlement/distribution-policy.service'

// Never echo a raw connection string — it may carry a real password. Same
// discipline tests/integration/postgresTestHarness.ts already established
// for exactly this reason.
function redactedTarget(): string {
  try {
    const u = new URL(config.database.url)
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return '<DATABASE_URL could not be parsed>'
  }
}

function parseArgs(argv: string[]): Record<string, string | true> {
  const args: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = true
    }
  }
  return args
}

function fail(message: string): never {
  console.error(`REFUSED: ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const type = args.type
  const id = args.id
  const confirmed = args['confirm-economic-change'] === true

  console.log('Sails Protocol — bootstrap operator economic policy publication (Missão 11 Fase 7.2)')
  console.log(`Target database: ${redactedTarget()}`)
  console.log(`Operator attribution: bootstrap operator control (no trustworthy per-operator identity source exists in this codebase yet — Missão 11 Fase 2 §15; not fabricated here).`)

  // Fail closed on any ambiguity — never guess, never list candidates for
  // an operator to accidentally pick the wrong one from.
  if (type !== 'fee' && type !== 'distribution') {
    fail(`--type must be exactly "fee" or "distribution" (got: ${JSON.stringify(type)}).`)
  }
  if (typeof id !== 'string' || id.length === 0) {
    fail('--id <uuid> is required and must name exactly one existing DRAFT policy.')
  }
  if (!confirmed) {
    fail(
      'this action publishes a real economic policy and makes it immediately economically live for its scope — ' +
      'this tool has no undo (retire() is a separate, explicit, later action). ' +
      'Re-run with --confirm-economic-change to proceed.'
    )
  }

  const timestamp = new Date().toISOString()

  if (type === 'fee') {
    const before = await feePolicyVersionRepository.findById(id)
    if (!before) fail(`no FeePolicyVersion found with id ${id}.`)
    console.log(`Previous state: status=${before!.status}, railScope=${before!.railScope}, protocolFeeRate=${before!.protocolFeeRate.toString()}`)

    // All structural validation (rate >= 0, requiredConfirmations set,
    // rail collection-capability, DRAFT-only) lives in publish() itself —
    // duplicated nowhere in this script.
    const after = await feePolicyService.publish(id)
    console.log(`Resulting state: status=${after.status}, railScope=${after.railScope}, publishedAt=${after.publishedAt?.toISOString()}`)
    console.log(`AUDIT: policyId=${id} policyType=fee railScope=${after.railScope} previousStatus=${before!.status} resultingStatus=${after.status} timestamp=${timestamp}`)
    return
  }

  const before = await distributionPolicyRepository.findById(id)
  if (!before) fail(`no DistributionPolicyVersion found with id ${id}.`)
  console.log(`Previous state: status=${before!.status}, recipients=${before!.recipients.length}`)

  const after = await distributionPolicyService.publish(id)
  console.log(`Resulting state: status=${after.status}, publishedAt=${after.publishedAt?.toISOString()}`)
  console.log(`AUDIT: policyId=${id} policyType=distribution previousStatus=${before!.status} resultingStatus=${after.status} timestamp=${timestamp}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Fail closed and loud — never a silent partial success. Error
    // messages from FeePolicyService/DistributionPolicyService already
    // carry no credentials/keys (verified: their validation errors only
    // ever echo policy field values, never config.database.url or any
    // secret material).
    console.error('FAILED:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
