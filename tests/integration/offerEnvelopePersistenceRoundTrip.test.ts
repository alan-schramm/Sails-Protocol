// tests/integration/offerEnvelopePersistenceRoundTrip.test.ts
//
// PR #100 CTO Gate correction (2026-09-09), Property E — persistence
// round-trip. docs/PORTABLE_SIGNED_OFFERS_EVIDENCE.md carries the full
// narrative; this file is the real, executable proof against an actual
// Postgres instance, not a mock.
//
// The concern this closes: `tests/offerEnvelope.test.ts` mocks
// `prisma.offerEnvelope.findFirst`/`create` entirely, so it can prove
// `ingest()`'s decision logic (owner continuity, revision ordering,
// signature verification) but it CANNOT prove that a value actually
// round-trips through real Postgres storage without silently changing
// bytes. The concrete risk: `Prisma.Decimal` strips trailing zeros on
// its own `.toString()` (confirmed directly: `new
// Prisma.Decimal('1.00000000').toString()` returns `"1"`, not
// `"1.00000000"`) — a naive reconstruction of a signed envelope from a
// DB row would silently produce different canonical bytes than what was
// originally signed, making a genuinely valid envelope look forged
// after nothing more than a save-and-reload.
//
// This test proves the full chain against a real database:
//   sign → ingest() → real Postgres row → reconstructSignedEnvelope()
//   → canonical bytes identical to the original → signature still verifies.

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import nacl from 'tweetnacl'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import {
  canonicalizeOfferEnvelope,
  signOfferEnvelope,
  verifyOfferEnvelope,
  type OfferEnvelopeContent,
} from '../../src/modules/open-liquidity/offer-envelope'
import { OfferEnvelopeRepository } from '../../src/modules/open-liquidity/offer-envelope-repository'

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function makeKeypair() {
  const kp = nacl.sign.keyPair()
  return { publicKeyHex: hex(kp.publicKey), secretKeyHex: hex(kp.secretKey) }
}

describe('OfferEnvelope — persistence round-trip against real Postgres (Property E)', () => {
  jest.setTimeout(60_000)
  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: PrismaClient
  let repo: OfferEnvelopeRepository

  // Every row this suite creates carries this prefix so cleanup can
  // target exactly (and only) its own rows, regardless of what else
  // may exist in this database.
  const TEST_LOGICAL_ID_PREFIX = 'offer-envelope-roundtrip-test-'

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (dbAvailable) {
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: pg.getUrl() }) })
      // Repository under test talks to the shared `prisma` singleton
      // (src/common/database) — this suite instead drives Prisma
      // directly against the real test DB and calls
      // repo.reconstructSignedEnvelope() (a pure function, no DB access
      // of its own) on the rows it reads back, so it exercises the real
      // reconstruction logic without needing to swap the shared
      // singleton's connection.
      repo = new OfferEnvelopeRepository()
    }
  })

  afterAll(async () => {
    if (!dbAvailable) return
    await prisma.offerEnvelope.deleteMany({ where: { logicalOfferId: { startsWith: TEST_LOGICAL_ID_PREFIX } } })
    await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  it('a signed envelope with canonical, non-trivial-scale amounts round-trips to byte-identical canonical form and a still-valid signature', async () => {
    requirePostgres('offer envelope persistence round-trip')
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const logicalOfferId = `${TEST_LOGICAL_ID_PREFIX}${Date.now()}-a`

    const content: OfferEnvelopeContent = {
      logicalOfferId,
      ownerPublicKey: publicKeyHex,
      asset: 'BTC',
      side: 'SELL',
      // Deliberately a value whose canonical form has trailing zeros —
      // exactly the case Prisma.Decimal.toString() would silently
      // mangle if reconstruction used it directly instead of
      // formatCanonicalDecimal()'s .toFixed(8).
      priceUsd: '65000.00000000',
      minAmount: '0.00100000',
      maxAmount: '0.50000000',
      paymentMethod: 'PIX',
      revision: 1,
      createdAt: '2026-09-09T00:00:00.000Z',
      revisedAt: '2026-09-09T00:00:00.000Z',
      expiresAt: '2026-09-10T00:00:00.000Z',
      status: 'ACTIVE',
    }
    const signature = signOfferEnvelope(content, secretKeyHex)
    const signed = { ...content, signature }
    const originalCanonicalBytes = canonicalizeOfferEnvelope(content)

    // Insert directly (mirrors ingest()'s own create() call exactly —
    // this suite is proving the storage layer's fidelity, independent
    // of ingest()'s convergence/ownership decision logic, which is
    // already covered by tests/offerEnvelope.test.ts's mocked suite).
    await prisma.offerEnvelope.create({
      data: {
        logicalOfferId: signed.logicalOfferId,
        ownerPublicKey: signed.ownerPublicKey,
        asset: signed.asset,
        side: signed.side,
        priceUsd: signed.priceUsd,
        minAmount: signed.minAmount,
        maxAmount: signed.maxAmount,
        paymentMethod: signed.paymentMethod,
        revision: signed.revision,
        createdAt: new Date(signed.createdAt),
        revisedAt: new Date(signed.revisedAt),
        expiresAt: new Date(signed.expiresAt),
        status: signed.status,
        signature: signed.signature,
      },
    })

    const row = await prisma.offerEnvelope.findFirst({ where: { logicalOfferId } })
    expect(row).not.toBeNull()

    const reconstructed = repo.reconstructSignedEnvelope(row!)

    // The actual claim: reconstructed canonical bytes are IDENTICAL to
    // what was originally signed, not merely "close" or "numerically
    // equal" — byte equality is what a signature verification depends on.
    const reconstructedCanonicalBytes = canonicalizeOfferEnvelope(reconstructed)
    expect(reconstructedCanonicalBytes.equals(originalCanonicalBytes)).toBe(true)

    // And, as the end-to-end consequence of that byte identity: the
    // ORIGINAL signature still verifies against the RECONSTRUCTED
    // content read back from real Postgres.
    expect(verifyOfferEnvelope(reconstructed)).toEqual({ valid: true })
  })

  it('a value whose Prisma.Decimal.toString() would strip trailing zeros still reconstructs to the exact original canonical decimal string', async () => {
    requirePostgres('decimal trailing-zero round-trip')
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const logicalOfferId = `${TEST_LOGICAL_ID_PREFIX}${Date.now()}-b`

    const content: OfferEnvelopeContent = {
      logicalOfferId,
      ownerPublicKey: publicKeyHex,
      asset: 'USDT_TRC20',
      side: 'BUY',
      // "1.00000000" is the exact case confirmed by hand to collapse to
      // "1" under Prisma.Decimal's own bare .toString().
      priceUsd: '1.00000000',
      minAmount: '10.00000000',
      maxAmount: '100.00000000',
      paymentMethod: 'TED',
      revision: 1,
      createdAt: '2026-09-09T00:00:00.000Z',
      revisedAt: '2026-09-09T00:00:00.000Z',
      expiresAt: '2026-09-10T00:00:00.000Z',
      status: 'ACTIVE',
    }
    const signature = signOfferEnvelope(content, secretKeyHex)

    await prisma.offerEnvelope.create({
      data: {
        logicalOfferId: content.logicalOfferId,
        ownerPublicKey: content.ownerPublicKey,
        asset: content.asset,
        side: content.side,
        priceUsd: content.priceUsd,
        minAmount: content.minAmount,
        maxAmount: content.maxAmount,
        paymentMethod: content.paymentMethod,
        revision: content.revision,
        createdAt: new Date(content.createdAt),
        revisedAt: new Date(content.revisedAt),
        expiresAt: new Date(content.expiresAt),
        status: content.status,
        signature,
      },
    })

    const row = await prisma.offerEnvelope.findFirst({ where: { logicalOfferId } })
    expect(row).not.toBeNull()

    // Prove the risk this test guards against is real, not hypothetical:
    // the RAW Prisma.Decimal read back from this exact row really does
    // strip the trailing zeros if you call bare .toString() on it.
    expect(row!.priceUsd.toString()).toBe('1')

    // ...yet the repository's reconstruction still recovers the
    // original signed canonical form.
    const reconstructed = repo.reconstructSignedEnvelope(row!)
    expect(reconstructed.priceUsd).toBe('1.00000000')
    expect(verifyOfferEnvelope({ ...reconstructed, signature })).toEqual({ valid: true })
  })

  it('ingest() itself, run against real Postgres end to end, produces a row that reconstructs and re-verifies', async () => {
    requirePostgres('ingest() end-to-end against real Postgres')
    const { publicKeyHex, secretKeyHex } = makeKeypair()
    const logicalOfferId = `${TEST_LOGICAL_ID_PREFIX}${Date.now()}-c`

    const content: OfferEnvelopeContent = {
      logicalOfferId,
      ownerPublicKey: publicKeyHex,
      asset: 'LN_BTC',
      side: 'SELL',
      priceUsd: '65123.45000000',
      minAmount: '0.00050000',
      maxAmount: '0.25000000',
      paymentMethod: 'LIGHTNING_DIRECT',
      revision: 1,
      createdAt: '2026-09-09T00:00:00.000Z',
      revisedAt: '2026-09-09T00:00:00.000Z',
      expiresAt: '2026-09-10T00:00:00.000Z',
      status: 'ACTIVE',
    }
    const signed = { ...content, signature: signOfferEnvelope(content, secretKeyHex) }

    // ingest() uses the shared `prisma` singleton (src/common/database),
    // which — outside of the mocked unit-test file — is the same real
    // database this harness just proved reachable via config.database.url.
    const result = await repo.ingest(signed)
    expect(result.accepted).toBe(true)

    const row = await prisma.offerEnvelope.findFirst({ where: { logicalOfferId } })
    expect(row).not.toBeNull()
    const reconstructed = repo.reconstructSignedEnvelope(row!)
    expect(canonicalizeOfferEnvelope(reconstructed).equals(canonicalizeOfferEnvelope(content))).toBe(true)
    expect(verifyOfferEnvelope(reconstructed)).toEqual({ valid: true })
  })

  it('Property H (real DB): two different owners using the identical logicalOfferId both persist without a unique-constraint violation, and ingest() converges each independently against real Postgres', async () => {
    requirePostgres('Property H composite uniqueness against real Postgres')
    const alice = makeKeypair()
    const mallory = makeKeypair()
    // Deliberately the SAME logicalOfferId for two different owners —
    // this is the exact case the corrected `@@unique([ownerPublicKey,
    // logicalOfferId, revision])` constraint (prisma/schema.prisma) must
    // allow; the old `@@unique([logicalOfferId, revision])` constraint
    // would have thrown a real Postgres unique-violation on the second
    // insert.
    const logicalOfferId = `${TEST_LOGICAL_ID_PREFIX}${Date.now()}-shared`

    const aliceContent: OfferEnvelopeContent = {
      logicalOfferId,
      ownerPublicKey: alice.publicKeyHex,
      asset: 'BTC',
      side: 'SELL',
      priceUsd: '65000.00000000',
      minAmount: '0.00100000',
      maxAmount: '0.50000000',
      paymentMethod: 'PIX',
      revision: 0,
      createdAt: '2026-09-09T00:00:00.000Z',
      revisedAt: '2026-09-09T00:00:00.000Z',
      expiresAt: '2026-09-10T00:00:00.000Z',
      status: 'ACTIVE',
    }
    const malloryContent: OfferEnvelopeContent = { ...aliceContent, ownerPublicKey: mallory.publicKeyHex }
    const aliceSigned = { ...aliceContent, signature: signOfferEnvelope(aliceContent, alice.secretKeyHex) }
    const mallorySigned = { ...malloryContent, signature: signOfferEnvelope(malloryContent, mallory.secretKeyHex) }

    const aliceResult = await repo.ingest(aliceSigned)
    const malloryResult = await repo.ingest(mallorySigned)

    expect(aliceResult.accepted).toBe(true)
    expect(malloryResult.accepted).toBe(true)

    const aliceLatest = await repo.getLatest(alice.publicKeyHex, logicalOfferId)
    const malloryLatest = await repo.getLatest(mallory.publicKeyHex, logicalOfferId)
    expect(aliceLatest.status).toBe('RESOLVED')
    expect(malloryLatest.status).toBe('RESOLVED')
    expect((aliceLatest as { row: { ownerPublicKey: string } }).row.ownerPublicKey).toBe(alice.publicKeyHex)
    expect((malloryLatest as { row: { ownerPublicKey: string } }).row.ownerPublicKey).toBe(mallory.publicKeyHex)
  })

  it('Property J (real DB): two genuinely different signed envelopes from the same owner at the identical revision both persist without a unique-constraint violation, and getLatest() reports EQUIVOCATED against real Postgres', async () => {
    requirePostgres('Property J composite uniqueness (incl. signature) against real Postgres')
    const alice = makeKeypair()
    const logicalOfferId = `${TEST_LOGICAL_ID_PREFIX}${Date.now()}-equivocation`

    const e1Content: OfferEnvelopeContent = {
      logicalOfferId,
      ownerPublicKey: alice.publicKeyHex,
      asset: 'BTC',
      side: 'SELL',
      priceUsd: '65000.00000000',
      minAmount: '0.00100000',
      maxAmount: '0.50000000',
      paymentMethod: 'PIX',
      revision: 0,
      createdAt: '2026-09-09T00:00:00.000Z',
      revisedAt: '2026-09-09T00:00:00.000Z',
      expiresAt: '2026-09-10T00:00:00.000Z',
      status: 'ACTIVE',
    }
    // Same identity, same revision, deliberately different price —
    // owner equivocation. `signature` necessarily differs (Ed25519
    // signing is deterministic; different content always produces a
    // different signature), which is exactly what the corrected
    // 4-column unique constraint (prisma/schema.prisma) allows to
    // coexist — the old 3-column constraint would have rejected this
    // node from ever storing E2 at all.
    const e2Content: OfferEnvelopeContent = { ...e1Content, priceUsd: '70000.00000000' }
    const e1 = { ...e1Content, signature: signOfferEnvelope(e1Content, alice.secretKeyHex) }
    const e2 = { ...e2Content, signature: signOfferEnvelope(e2Content, alice.secretKeyHex) }

    const r1 = await repo.ingest(e1)
    const r2 = await repo.ingest(e2)
    expect(r1.accepted).toBe(true)
    expect(r2).toEqual(expect.objectContaining({ accepted: true, equivocationDetected: true }))

    const latest = await repo.getLatest(alice.publicKeyHex, logicalOfferId)
    expect(latest.status).toBe('EQUIVOCATED')
    const prices = new Set((latest as { rows: { priceUsd: { toString(): string } }[] }).rows.map((row) => row.priceUsd.toString()))
    expect(prices).toEqual(new Set(['65000', '70000']))
  })

  it('CONVERGENCE TEST (real DB): two arrival orders of the identical equivocating facts, plus a resolving higher revision, converge to the identical final state against real Postgres', async () => {
    requirePostgres('Property J/L convergence against real Postgres')
    const alice = makeKeypair()

    function makeContent(logicalOfferId: string, revision: number, priceUsd: string): OfferEnvelopeContent {
      return {
        logicalOfferId,
        ownerPublicKey: alice.publicKeyHex,
        asset: 'BTC',
        side: 'SELL',
        priceUsd,
        minAmount: '0.00100000',
        maxAmount: '0.50000000',
        paymentMethod: 'PIX',
        revision,
        createdAt: '2026-09-09T00:00:00.000Z',
        revisedAt: '2026-09-09T00:00:00.000Z',
        expiresAt: '2026-09-10T00:00:00.000Z',
        status: 'ACTIVE',
      }
    }

    // History A: E1, E2, rev6 (a different logicalOfferId than History B, so the two histories don't interfere with each other in the shared real database).
    const idA = `${TEST_LOGICAL_ID_PREFIX}${Date.now()}-converge-a`
    const e1A = { ...makeContent(idA, 5, '65000.00000000') }
    const e2A = { ...makeContent(idA, 5, '70000.00000000') }
    const rev6A = { ...makeContent(idA, 6, '68000.00000000') }
    const signedE1A = { ...e1A, signature: signOfferEnvelope(e1A, alice.secretKeyHex) }
    const signedE2A = { ...e2A, signature: signOfferEnvelope(e2A, alice.secretKeyHex) }
    const signedRev6A = { ...rev6A, signature: signOfferEnvelope(rev6A, alice.secretKeyHex) }
    await repo.ingest(signedE1A)
    await repo.ingest(signedE2A)
    await repo.ingest(signedRev6A)
    const finalA = await repo.getLatest(alice.publicKeyHex, idA)

    // History B: the SAME facts (same logicalOfferId content this time, different id so it's an independent real row-set), opposite arrival order for the equivocating pair.
    const idB = `${TEST_LOGICAL_ID_PREFIX}${Date.now()}-converge-b`
    const e1B = { ...makeContent(idB, 5, '65000.00000000') }
    const e2B = { ...makeContent(idB, 5, '70000.00000000') }
    const rev6B = { ...makeContent(idB, 6, '68000.00000000') }
    const signedE1B = { ...e1B, signature: signOfferEnvelope(e1B, alice.secretKeyHex) }
    const signedE2B = { ...e2B, signature: signOfferEnvelope(e2B, alice.secretKeyHex) }
    const signedRev6B = { ...rev6B, signature: signOfferEnvelope(rev6B, alice.secretKeyHex) }
    await repo.ingest(signedE2B)
    await repo.ingest(signedE1B)
    await repo.ingest(signedRev6B)
    const finalB = await repo.getLatest(alice.publicKeyHex, idB)

    expect(finalA.status).toBe('RESOLVED')
    expect(finalB.status).toBe('RESOLVED')
    expect((finalA as { row: { priceUsd: { toString(): string } } }).row.priceUsd.toString()).toBe('68000')
    expect((finalB as { row: { priceUsd: { toString(): string } } }).row.priceUsd.toString()).toBe('68000')
  })
})
