/**
 * scripts/draft-economic-policy.ts — Missão 11 Fase 7.3.1 §F (CTO mandate:
 * "a deliberate OFFLINE operator control plane").
 *
 * Phase 7.3's audit found a real operational gap: `scripts/publish-economic-policy.ts`
 * (Fase 7.2) can PUBLISH an already-existing DRAFT policy, but nothing
 * anywhere — no route, no CLI — could ever CREATE one. The only way to
 * originate a real FeePolicyVersion/DistributionPolicyVersion/
 * DistributionRecipient draft was a raw, undocumented `prisma` console
 * call. This script closes that gap the same way the publish script
 * closed its own: a plain, server-side-only ts-node script, no HTTP
 * surface, no admin token — the same trust boundary this repository
 * already assumes for `npm run db:migrate`/`db:seed`.
 *
 * A second, independent gap was found and fixed while building this:
 * `FeePolicyVersionRepository.create()`'s own input type had no field for
 * `requiredConfirmations` at all, even though `FeePolicyService.publish()`
 * has always required it to be a positive integer before a policy can go
 * live — every draft created through the real service method was
 * therefore structurally unpublishable, with no update() to fix it
 * afterward (fee-policy-repository.ts's own header explains why no
 * update() exists by design). Fixed at the repository layer
 * (fee-policy-repository.ts) so this script — and any other real
 * caller — can actually produce a publishable draft.
 *
 * Deliberately does NOT publish anything (that stays
 * publish-economic-policy.ts's own separate, later, explicit action —
 * "draft creation and publication should remain separate deliberate
 * actions," per this mandate). Deliberately never chooses a rate,
 * confirmation depth, weight, or percentage on the operator's behalf —
 * every economic value is a required CLI argument with no default, same
 * "never chosen here" discipline every service file in this module
 * already documents. Never touches custody/keys — those live entirely
 * outside this module.
 *
 * Usage:
 *   npm run economics:draft-policy -- --action create-fee-draft \
 *     --label <string> --rail-scope <string> --protocol-fee-rate <decimal> \
 *     --required-confirmations <int> --payer-model SELLER_PAYS \
 *     --economic-basis SELLER_DELIVERED_VALUE --created-by <string> \
 *     --confirm-draft-creation
 *
 *   npm run economics:draft-policy -- --action create-recipient \
 *     --class <string> --label <string> [--identity-key <string>] \
 *     --confirm-draft-creation
 *
 *   npm run economics:draft-policy -- --action create-distribution-draft \
 *     --label <string> --created-by <string> --confirm-draft-creation
 *
 *   npm run economics:draft-policy -- --action add-recipient-to-draft \
 *     --policy-id <uuid> --recipient-id <uuid> --weight-pct <decimal> \
 *     --confirm-draft-creation
 *
 *   npm run economics:draft-policy -- --action attest-custody \
 *     --recipient-id <uuid> --asset <string> --descriptor '<json>' \
 *     --attested-by <string> --confirm-draft-creation
 *     (Missão 11 Fase 7.3.2 §3 — records an ATTESTED ASSOCIATION only,
 *     never cryptographic proof of custody control; supersedes any prior
 *     active attestation for the same recipient+asset without deleting it)
 */
import { config } from '../src/config'
import { feePolicyService } from '../src/modules/open-settlement/fee-policy.service'
import { distributionPolicyService } from '../src/modules/open-settlement/distribution-policy.service'
import { distributionRecipientRepository } from '../src/modules/open-settlement/distribution-recipient-repository'
import { custodyAttestationRepository } from '../src/modules/open-settlement/custody-attestation-repository'

// Same redaction discipline as publish-economic-policy.ts — never echo a
// raw connection string, it may carry a real password.
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

function requireString(args: Record<string, string | true>, key: string): string {
  const v = args[key]
  if (typeof v !== 'string' || v.length === 0) {
    fail(`--${key} <value> is required.`)
  }
  return v as string
}

function requirePositiveInt(args: Record<string, string | true>, key: string): number {
  const raw = requireString(args, key)
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    fail(`--${key} must be a positive integer (got: ${JSON.stringify(raw)}).`)
  }
  return n
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const action = args.action
  const confirmed = args['confirm-draft-creation'] === true

  console.log('Sails Protocol — bootstrap operator economic-policy DRAFT creation (Missão 11 Fase 7.3.1 §F)')
  console.log(`Target database: ${redactedTarget()}`)
  console.log('Operator attribution: bootstrap operator control (no trustworthy per-operator identity source exists in this codebase yet — Missão 11 Fase 2 §15; not fabricated here).')
  console.log('This action creates a DRAFT only — it never publishes, never activates real economics. Use publish-economic-policy.ts as a separate, later, explicit step.')

  if (
    action !== 'create-fee-draft' &&
    action !== 'create-recipient' &&
    action !== 'create-distribution-draft' &&
    action !== 'add-recipient-to-draft' &&
    action !== 'attest-custody'
  ) {
    fail(
      `--action must be one of "create-fee-draft", "create-recipient", "create-distribution-draft", "add-recipient-to-draft", "attest-custody" (got: ${JSON.stringify(action)}).`
    )
  }
  if (!confirmed) {
    fail('this action writes a real, persistent row to the target database — re-run with --confirm-draft-creation to proceed.')
  }

  const timestamp = new Date().toISOString()

  if (action === 'create-fee-draft') {
    const label = requireString(args, 'label')
    const railScope = requireString(args, 'rail-scope')
    const protocolFeeRate = requireString(args, 'protocol-fee-rate')
    const requiredConfirmations = requirePositiveInt(args, 'required-confirmations')
    const payerModel = requireString(args, 'payer-model')
    const economicBasis = requireString(args, 'economic-basis')
    const createdBy = requireString(args, 'created-by')

    // Fail closed on any ambiguity — never silently coerce a near-miss
    // value. These are currently the ONLY two valid values the schema's
    // own enums accept; this script does not get to loosen that.
    if (payerModel !== 'SELLER_PAYS') fail(`--payer-model must be exactly "SELLER_PAYS" (got: ${JSON.stringify(payerModel)}).`)
    if (economicBasis !== 'SELLER_DELIVERED_VALUE') fail(`--economic-basis must be exactly "SELLER_DELIVERED_VALUE" (got: ${JSON.stringify(economicBasis)}).`)

    console.log(`Proposed DRAFT: label=${label} railScope=${railScope} protocolFeeRate=${protocolFeeRate} requiredConfirmations=${requiredConfirmations} payerModel=${payerModel} economicBasis=${economicBasis}`)
    // Legacy nodeOperatorPct/treasuryPct/walletRebatePct/arbitratorReservePct/
    // smallTradeRule/triggerSemantics are deliberately never set here — no
    // longer normative inputs (Fase 7.2 CTO decision §I), and this script
    // never picks a percentage on the operator's behalf.
    const draft = await feePolicyService.createDraft({
      label, railScope, protocolFeeRate, requiredConfirmations,
      payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE',
      createdBy,
    })
    console.log(`Created: id=${draft.id} status=${draft.status}`)
    console.log(`AUDIT: action=create-fee-draft id=${draft.id} railScope=${railScope} timestamp=${timestamp}`)
    console.log(`Next step (separate, explicit): npm run economics:publish-policy -- --type fee --id ${draft.id} --confirm-economic-change`)
    return
  }

  if (action === 'create-recipient') {
    const recipientClass = requireString(args, 'class')
    const label = requireString(args, 'label')
    const identityKey = typeof args['identity-key'] === 'string' ? (args['identity-key'] as string) : undefined

    console.log(`Proposed DistributionRecipient: class=${recipientClass} label=${label} identityKey=${identityKey ?? '(none — singleton class)'}`)
    const recipient = await distributionRecipientRepository.create({ class: recipientClass, label, identityKey })
    console.log(`Created: id=${recipient.id}`)
    console.log(`AUDIT: action=create-recipient id=${recipient.id} class=${recipientClass} timestamp=${timestamp}`)
    return
  }

  if (action === 'create-distribution-draft') {
    const label = requireString(args, 'label')
    const createdBy = requireString(args, 'created-by')

    console.log(`Proposed DRAFT: label=${label} createdBy=${createdBy}`)
    const draft = await distributionPolicyService.createDraft({ label, createdBy })
    console.log(`Created: id=${draft.id} status=${draft.status}`)
    console.log(`AUDIT: action=create-distribution-draft id=${draft.id} timestamp=${timestamp}`)
    console.log(`Next step: npm run economics:draft-policy -- --action add-recipient-to-draft --policy-id ${draft.id} --recipient-id <uuid> --weight-pct <decimal> --confirm-draft-creation`)
    return
  }

  if (action === 'add-recipient-to-draft') {
    const policyId = requireString(args, 'policy-id')
    const recipientId = requireString(args, 'recipient-id')
    const weightPct = requireString(args, 'weight-pct')

    console.log(`Proposed: add recipientId=${recipientId} weightPct=${weightPct} to DistributionPolicyVersion ${policyId}`)
    const link = await distributionPolicyService.addRecipient(policyId, recipientId, weightPct)
    console.log(`Created: id=${link.id}`)
    console.log(`AUDIT: action=add-recipient-to-draft policyId=${policyId} recipientId=${recipientId} weightPct=${weightPct} timestamp=${timestamp}`)
    console.log('Reminder: publish() will refuse this policy unless its recipients\' weightPct values sum to exactly 100 — this script does not check that for you.')
    return
  }

  // attest-custody (Missão 11 Fase 7.3.2 §3) — records an ATTESTED
  // ASSOCIATION only, never cryptographic proof of control (see
  // CustodyAttestation's own schema.prisma comment). attestationAuthority
  // is deliberately NOT a CLI flag: this bootstrap script has no
  // mechanism to produce anything stronger than BOOTSTRAP_OPERATOR_ATTESTED,
  // so it never offers the operator a way to claim otherwise.
  const recipientId = requireString(args, 'recipient-id')
  const asset = requireString(args, 'asset')
  const descriptorRaw = requireString(args, 'descriptor')
  const attestedBy = requireString(args, 'attested-by')

  let descriptor: unknown
  try {
    descriptor = JSON.parse(descriptorRaw)
  } catch {
    fail(`--descriptor must be valid JSON (got: ${JSON.stringify(descriptorRaw)}).`)
  }

  const existing = await custodyAttestationRepository.findActive(recipientId, asset)
  console.log(`Proposed: attest custody for recipientId=${recipientId} asset=${asset} descriptor=${JSON.stringify(descriptor)}`)
  if (existing) {
    console.log(`This SUPERSEDES the currently active attestation (id=${existing.id}, attested ${existing.attestedAt.toISOString()}) — that row is retained, never deleted, and remains in history.`)
  }
  const attestation = await custodyAttestationRepository.create({ recipientId, asset, descriptor: descriptor as any, attestedBy })
  console.log(`Created: id=${attestation.id} attestationAuthority=${attestation.attestationAuthority}`)
  console.log(`AUDIT: action=attest-custody id=${attestation.id} recipientId=${recipientId} asset=${asset} timestamp=${timestamp}`)
  console.log('Reminder: this is an ATTESTED ASSOCIATION (an operator\'s own asserted claim), not cryptographic proof of custody control.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // Fail closed and loud — never a silent partial success. Error
    // messages from FeePolicyService/DistributionPolicyService/
    // DistributionRecipientRepository already carry no credentials/keys
    // (verified: their validation errors only ever echo policy field
    // values, never config.database.url or any secret material).
    console.error('FAILED:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
