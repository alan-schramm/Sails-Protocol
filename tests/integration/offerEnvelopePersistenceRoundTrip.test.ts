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
})
