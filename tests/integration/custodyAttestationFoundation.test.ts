// tests/integration/custodyAttestationFoundation.test.ts
//
// Missão 11 Fase 7.3.2 §3 (CTO-approved design: Option 2, append-only
// custody attestation) — real-Postgres proof of every requirement the
// CTO's own design brief named: append-only/historical, rotation does
// not rewrite history, deterministic historical lookup, DB-enforced
// single-active-per-recipient-asset, and the auditable escrow
// cross-reference. No private key, no payout/claim, no Treasury key
// generation, no distribution activation is exercised anywhere here.

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

describe('CustodyAttestation (Missão 11 Fase 7.3.2 §3, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: import('@prisma/client').PrismaClient
  let custodyAttestationRepository: typeof import('../../src/modules/open-settlement/custody-attestation-repository').custodyAttestationRepository
  let distributionRecipientRepository: typeof import('../../src/modules/open-settlement/distribution-recipient-repository').distributionRecipientRepository

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ custodyAttestationRepository } = require('../../src/modules/open-settlement/custody-attestation-repository'))
    ;({ distributionRecipientRepository } = require('../../src/modules/open-settlement/distribution-recipient-repository'))
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  function suffix() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

  async function fixtureRecipient() {
    const s = suffix()
    return distributionRecipientRepository.create({
      class: `CUSTODY_FIXTURE_${s.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
      label: 'custody-attestation-fixture-recipient',
    })
  }

  it('create() writes the first attestation as active (supersededAt null), defaulting to BOOTSTRAP_OPERATOR_ATTESTED', async () => {
    requirePostgres('first attestation')
    const recipient = await fixtureRecipient()

    const attestation = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC',
      descriptor: { address: 'bc1qexamplefixtureaddress', custodian: 'Satsails Treasury cold wallet' },
      attestedBy: 'fase7-3-2-test',
    })

    expect(attestation.supersededAt).toBeNull()
    expect(attestation.attestationAuthority).toBe('BOOTSTRAP_OPERATOR_ATTESTED')
    const active = await custodyAttestationRepository.findActive(recipient.id, 'BTC')
    expect(active?.id).toBe(attestation.id)
  })

  it('rotation: a second create() for the same recipient+asset supersedes the first without deleting it — both remain in history', async () => {
    requirePostgres('rotation')
    const recipient = await fixtureRecipient()

    const first = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qold' }, attestedBy: 'fase7-3-2-test',
    })
    const second = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qnew' }, attestedBy: 'fase7-3-2-test',
    })

    const active = await custodyAttestationRepository.findActive(recipient.id, 'BTC')
    expect(active?.id).toBe(second.id)

    const history = await custodyAttestationRepository.listHistory(recipient.id, 'BTC')
    expect(history.map((h) => h.id).sort()).toEqual([first.id, second.id].sort())
    const firstAfterRotation = history.find((h) => h.id === first.id)!
    expect(firstAfterRotation.supersededAt).not.toBeNull()
    expect(firstAfterRotation.descriptor).toEqual({ address: 'bc1qold' }) // never rewritten
  })

  it('findActiveAt() is a real deterministic historical lookup, not "whatever is active now"', async () => {
    requirePostgres('historical lookup')
    const recipient = await fixtureRecipient()

    const first = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qold' }, attestedBy: 'fase7-3-2-test',
    })
    const between = new Date()
    await new Promise((r) => setTimeout(r, 10))
    await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qnew' }, attestedBy: 'fase7-3-2-test',
    })

    const atFirst = await custodyAttestationRepository.findActiveAt(recipient.id, 'BTC', between)
    expect(atFirst?.id).toBe(first.id)
    const atNow = await custodyAttestationRepository.findActiveAt(recipient.id, 'BTC', new Date())
    expect(atNow?.descriptor).toEqual({ address: 'bc1qnew' })
  })

  it('rail-agnostic: the same recipient can have independent, non-interfering attestations per asset', async () => {
    requirePostgres('rail-agnostic')
    const recipient = await fixtureRecipient()

    await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qbtc' }, attestedBy: 'fase7-3-2-test',
    })
    await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'USDT_ERC20', descriptor: { evmAddress: '0xabc', chainId: 1 }, attestedBy: 'fase7-3-2-test',
    })

    const btc = await custodyAttestationRepository.findActive(recipient.id, 'BTC')
    const usdt = await custodyAttestationRepository.findActive(recipient.id, 'USDT_ERC20')
    expect(btc?.descriptor).toEqual({ address: 'bc1qbtc' })
    expect(usdt?.descriptor).toEqual({ evmAddress: '0xabc', chainId: 1 }) // never forced into address semantics
  })

  // ─── DB-native immutability (real trigger, not app-level convention) ─────
  it('DB trigger rejects editing any column of an existing row directly', async () => {
    requirePostgres('reject direct edit')
    const recipient = await fixtureRecipient()
    const row = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qoriginal' }, attestedBy: 'fase7-3-2-test',
    })

    await expect(
      prisma.$executeRawUnsafe(`UPDATE custody_attestations SET descriptor = '{"address":"bc1qhacked"}' WHERE id = $1`, row.id)
    ).rejects.toThrow(/immutable once written/)
  })

  it('DB trigger rejects deleting a row outright', async () => {
    requirePostgres('reject delete')
    const recipient = await fixtureRecipient()
    const row = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qoriginal' }, attestedBy: 'fase7-3-2-test',
    })

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM custody_attestations WHERE id = $1`, row.id)
    ).rejects.toThrow(/append-only and may never be deleted/)
  })

  it('DB trigger rejects un-superseding a row (setting supersededAt back to NULL)', async () => {
    requirePostgres('reject un-supersede')
    const recipient = await fixtureRecipient()
    const first = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qold' }, attestedBy: 'fase7-3-2-test',
    })
    await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qnew' }, attestedBy: 'fase7-3-2-test',
    })

    await expect(
      prisma.$executeRawUnsafe(`UPDATE custody_attestations SET "supersededAt" = NULL WHERE id = $1`, first.id)
    ).rejects.toThrow(/immutable once written/)
  })

  it('DB trigger rejects re-superseding an already-superseded row', async () => {
    requirePostgres('reject double-supersede')
    const recipient = await fixtureRecipient()
    const first = await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qold' }, attestedBy: 'fase7-3-2-test',
    })
    await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qnew' }, attestedBy: 'fase7-3-2-test',
    })

    await expect(
      prisma.$executeRawUnsafe(`UPDATE custody_attestations SET "supersededAt" = now() WHERE id = $1`, first.id)
    ).rejects.toThrow(/immutable once written/)
  })

  it('the partial unique index rejects two simultaneously-active rows for the same recipient+asset, even bypassing the repository', async () => {
    requirePostgres('exclusivity index')
    const recipient = await fixtureRecipient()
    await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qfirst' }, attestedBy: 'fase7-3-2-test',
    })

    // Direct raw insert, bypassing create()'s own supersede-first logic —
    // proves the DB itself refuses this, not just the repository's own
    // discipline.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO custody_attestations (id, "recipientId", asset, descriptor, "attestedBy") VALUES (gen_random_uuid(), $1, 'BTC', '{"address":"bc1qsecond"}', 'raw-bypass-test')`,
        recipient.id
      )
    ).rejects.toThrow()
  })

  // ─── Auditable escrow cross-reference ────────────────────────────────────
  it('CustodyAttestationService cross-references an escrow\'s frozen collection generations against the applicable custody attestation', async () => {
    requirePostgres('escrow cross-reference')
    const s = suffix()
    const recipient = await distributionRecipientRepository.create({
      class: `CUSTODY_XREF_${s.toUpperCase().replace(/[^A-Z0-9]/g, '')}`, label: 'xref-fixture-recipient',
    })
    await custodyAttestationRepository.create({
      recipientId: recipient.id, asset: 'BTC', descriptor: { address: 'bc1qxreftest' }, attestedBy: 'fase7-3-2-test',
    })

    const { distributionPolicyService } = require('../../src/modules/open-settlement/distribution-policy.service')
    const live = await distributionPolicyService.findLivePolicy()
    if (live) await distributionPolicyService.retire(live.id)
    const draft = await distributionPolicyService.createDraft({ label: `xref-policy-${s}`, createdBy: 'fase7-3-2-test' })
    await distributionPolicyService.addRecipient(draft.id, recipient.id, '100')
    await distributionPolicyService.publish(draft.id)

    // Real fee-obligation + collection-recognition fixture, same pattern
    // as atomicCollectionRecognition.test.ts's own fixtureObligation().
    const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-xref-${s}` } })
    const seller = await prisma.user.create({ data: { publicKey: `pk-seller-xref-${s}` } })
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' } })
    const trade = await prisma.trade.create({ data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.001', priceUsd: '65000', totalUsd: '65' } })
    const feePolicy = await prisma.feePolicyVersion.create({
      data: { label: `xref-feepolicy-${s}`, railScope: `XREF_RAIL-${s}`, status: 'PUBLISHED', publishedAt: new Date(), protocolFeeRate: '0.004', payerModel: 'SELLER_PAYS', economicBasis: 'SELLER_DELIVERED_VALUE', requiredConfirmations: 1, createdBy: 'fase7-3-2-test' },
    })
    const escrow = await prisma.escrow.create({ data: { tradeId: trade.id, type: 'MOCK', asset: 'BTC', lockedAmount: '0.001', snapshotFeeCollectionAddress: 'bc1qtherealcollectionaddress' } })
    const obligation = await prisma.feeObligation.create({
      data: { escrowId: escrow.id, feePolicyVersionId: feePolicy.id, economicDetermination: 'OWED', collectionStatus: 'PENDING_COLLECTION', basisAmount: '0.001', computedFee: '0.00000500', asset: 'BTC' },
    })
    const txid = require('crypto').createHash('sha256').update(obligation.id + s).digest('hex')
    const { feeCollectionRecognitionService } = require('../../src/modules/open-settlement/fee-collection-recognition.service')
    await feeCollectionRecognitionService.recordBroadcastAndAdvance(obligation.id, { txid, vout: 1, scriptPubKey: 'deadbeef', amountSats: 1 })
    await feeCollectionRecognitionService.recognizeConfirmation(obligation.id, txid, 800000)

    const { custodyAttestationService } = require('../../src/modules/open-settlement/custody-attestation-service')
    const xref = await custodyAttestationService.findAttestationsForEscrow(escrow.id)

    expect(xref.frozenCollectionAddress).toBe('bc1qtherealcollectionaddress')
    expect(xref.generations).toHaveLength(1)
    expect(xref.generations[0].recipients).toHaveLength(1)
    expect(xref.generations[0].recipients[0].recipientId).toBe(recipient.id)
    expect(xref.generations[0].recipients[0].custodyAttestation?.descriptor).toEqual({ address: 'bc1qxreftest' })

    await distributionPolicyService.retire(draft.id)
  })

  // ─── Operator CLI ─────────────────────────────────────────────────────────
  it('attest-custody CLI action creates a real, immediately-queryable attestation', async () => {
    requirePostgres('CLI attest-custody')
    const recipient = await fixtureRecipient()

    const result = await runCli([
      '--action', 'attest-custody', '--recipient-id', recipient.id, '--asset', 'BTC',
      '--descriptor', JSON.stringify({ address: 'bc1qclitest', custodian: 'CLI fixture' }),
      '--attested-by', 'fase7-3-2-cli-test', '--confirm-draft-creation',
    ])
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/ATTESTED ASSOCIATION/)

    const active = await custodyAttestationRepository.findActive(recipient.id, 'BTC')
    expect(active?.descriptor).toEqual({ address: 'bc1qclitest', custodian: 'CLI fixture' })
  })

  it('attest-custody CLI refuses invalid JSON in --descriptor', async () => {
    requirePostgres('CLI invalid descriptor')
    const result = await runCli([
      '--action', 'attest-custody', '--recipient-id', 'x', '--asset', 'BTC',
      '--descriptor', 'not-json', '--attested-by', 'test', '--confirm-draft-creation',
    ])
    expect(result.code).not.toBe(0)
    expect(result.stdout + result.stderr).toMatch(/REFUSED.*--descriptor must be valid JSON/)
  })
})
