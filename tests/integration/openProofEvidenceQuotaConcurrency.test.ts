// Issue #267 — real PostgreSQL evidence quota/idempotency proof.
// No mocked locks: independent Prisma clients contend in the database.
import { createPostgresIntegrationHarness } from './postgresTestHarness'

describe('OpenProof evidence quota admission (#267, real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let prisma: import('@prisma/client').PrismaClient
  let reserveEvidenceQuota: typeof import('../../src/modules/open-proof/evidence-quota').reserveEvidenceQuota

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ reserveEvidenceQuota } = require('../../src/modules/open-proof/evidence-quota'))
  })

  afterAll(async () => {
    if (pg.isAvailable()) await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  async function fixture() {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const uploader = await prisma.user.create({ data: { publicKey: `267-uploader-${suffix}` } })
    const claim = await prisma.claim.create({
      data: { claimedBy: uploader.id, claimType: 'issue-267-test', assertion: { test: true } },
    })
    const proof = await prisma.proof.create({
      data: {
        claimId: claim.id,
        evidence: { test: true },
        evidenceHash: 'a'.repeat(64),
        submittedBy: uploader.id,
      },
    })
    return { uploader, claim, proof }
  }

  async function cleanup(ids: { uploaderId: string; claimId: string; proofId: string }) {
    await prisma.evidenceUploadReservation.deleteMany({ where: { proofId: ids.proofId } })
    await prisma.evidenceReference.deleteMany({ where: { proofId: ids.proofId } })
    await prisma.proof.deleteMany({ where: { id: ids.proofId } })
    await prisma.claim.deleteMany({ where: { id: ids.claimId } })
    await prisma.user.deleteMany({ where: { id: ids.uploaderId } })
  }

  it('concurrent same-key admissions converge to one durable reservation', async () => {
    requirePostgres('issue #267 same-key convergence')
    const { uploader, claim, proof } = await fixture()
    try {
      const input = {
        proofId: proof.id,
        submittedBy: uploader.id,
        sizeBytes: 1024,
        operationKey: 'same-operation',
        mediaSha256: 'b'.repeat(64),
        mimeType: 'image',
      }
      const results = await Promise.all(Array.from({ length: 12 }, () => reserveEvidenceQuota(input)))
      expect(new Set(results.map((x) => x.id)).size).toBe(1)
      expect(await prisma.evidenceUploadReservation.count({ where: { proofId: proof.id } })).toBe(1)
    } finally {
      await cleanup({ uploaderId: uploader.id, claimId: claim.id, proofId: proof.id })
    }
  })

  it('serializes competing admissions so uploader+Proof byte quota cannot be overbooked', async () => {
    requirePostgres('issue #267 uploader quota concurrency')
    const { uploader, claim, proof } = await fixture()
    try {
      // CTO V1 uploader+Proof byte budget is 50 MiB. Two independent
      // 30 MiB operations cannot both be admitted even if they start together.
      const sizeBytes = 30 * 1024 * 1024
      const attempts = await Promise.allSettled([
        reserveEvidenceQuota({
          proofId: proof.id, submittedBy: uploader.id, sizeBytes,
          operationKey: 'quota-a', mediaSha256: 'c'.repeat(64), mimeType: 'video',
        }),
        reserveEvidenceQuota({
          proofId: proof.id, submittedBy: uploader.id, sizeBytes,
          operationKey: 'quota-b', mediaSha256: 'd'.repeat(64), mimeType: 'video',
        }),
      ])
      expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
      expect(attempts.filter((x) => x.status === 'rejected')).toHaveLength(1)
      const active = await prisma.evidenceUploadReservation.findMany({
        where: { proofId: proof.id, status: { in: ['RESERVED', 'UNKNOWN'] } },
      })
      expect(active).toHaveLength(1)
      expect(active[0].sizeBytes).toBe(sizeBytes)
    } finally {
      await cleanup({ uploaderId: uploader.id, claimId: claim.id, proofId: proof.id })
    }
  })

  it('UNKNOWN survives a fresh module/client read and still consumes quota', async () => {
    requirePostgres('issue #267 restart UNKNOWN accounting')
    const { uploader, claim, proof } = await fixture()
    try {
      const first = await reserveEvidenceQuota({
        proofId: proof.id, submittedBy: uploader.id, sizeBytes: 30 * 1024 * 1024,
        operationKey: 'unknown-a', mediaSha256: 'e'.repeat(64), mimeType: 'video',
      })
      await prisma.evidenceUploadReservation.update({
        where: { id: first.id },
        data: { status: 'UNKNOWN' },
      })

      await expect(reserveEvidenceQuota({
        proofId: proof.id, submittedBy: uploader.id, sizeBytes: 30 * 1024 * 1024,
        operationKey: 'after-restart', mediaSha256: 'f'.repeat(64), mimeType: 'video',
      })).rejects.toThrow('quota exceeded')

      expect(await prisma.evidenceUploadReservation.count({
        where: { proofId: proof.id, status: 'UNKNOWN' },
      })).toBe(1)
    } finally {
      await cleanup({ uploaderId: uploader.id, claimId: claim.id, proofId: proof.id })
    }
  })
})
