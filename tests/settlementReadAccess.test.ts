/**
 * GET /v1/settlement/escrow/:id and GET /v1/settlement/disputes/:id —
 * access control (Missão 06.8).
 *
 * Real HTTP round-trips via app.inject() through the real Fastify routes
 * and the real requireAuth middleware, same discipline
 * tests/proofBundleAccess.test.ts already established for the equivalent
 * Missão 06.6 fix (redisStore-backed redis mock so a real session token
 * round-trips through the real requireAuth code path, not a bypassed
 * mock). Isolated file, not added to tests/routes.test.ts's shared
 * app/rate-limit budget.
 */
import type { FastifyInstance } from 'fastify'

jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

jest.mock('@arkade-os/sdk', () => ({
  SeedIdentity: { fromSeed: jest.fn() },
  MultisigTapscript: { encode: jest.fn() },
  CSVMultisigTapscript: { encode: jest.fn() },
  VtxoScript: class FakeVtxoScript {},
  RestArkProvider: class FakeRestArkProvider {},
  RestIndexerProvider: class FakeRestIndexerProvider {},
  buildOffchainTx: jest.fn(),
  combineTapscriptSigs: jest.fn(),
  verifyTapscriptSignatures: jest.fn(),
}))

jest.mock('@scure/btc-signer', () => ({ Transaction: { fromPSBT: jest.fn() } }))

jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: { start: jest.fn(), stop: jest.fn(), get: jest.fn(), getStatus: jest.fn() },
}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined), on: jest.fn(), onDurable: jest.fn() },
}))

const BUYER_ID = 'buyer-1'
const SELLER_ID = 'seller-1'
const ARBITER_ID = 'arbiter-1'
const OTHER_ARBITER_ID = 'arbiter-2'
const OUTSIDER_ID = 'outsider-1'
const TRADE_ID = 'trade-1'
const ESCROW_ID = 'escrow-1'
const DISPUTE_ID = 'dispute-1'

const TRADE_ROW = { id: TRADE_ID, buyerId: BUYER_ID, sellerId: SELLER_ID, status: 'ACTIVE', escrowId: ESCROW_ID }
const DISPUTE_ROW = {
  id: DISPUTE_ID, tradeId: TRADE_ID, escrowId: ESCROW_ID, openedBy: BUYER_ID,
  reason: 'Seller never sent PIX confirmation', evidence: [], arbiterId: ARBITER_ID,
  status: 'OPENED', ruling: null, resolvedAt: null,
}
const ESCROW_ROW = {
  id: ESCROW_ID, tradeId: TRADE_ID, type: 'MOCK', status: 'DISPUTED', lockedAmount: '0.01', asset: 'BTC',
  events: [], disputes: [DISPUTE_ROW],
}
const PENDING_TX_ROW = {
  id: 'pending-tx-1', escrowId: ESCROW_ID, unsignedPsbtBase64: 'cHNidP8BA...', toAddress: 'bc1qoutsider-cannot-see-this',
  requiredSigners: [BUYER_ID, SELLER_ID], signatures: [],
}
const RELEASE_APPROVAL_ROWS = [{ id: 'approval-1', escrowId: ESCROW_ID, participantId: BUYER_ID, approvedAt: new Date() }]

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === TRADE_ID ? TRADE_ROW : null)),
    },
    escrow: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === ESCROW_ID ? ESCROW_ROW : null)),
    },
    dispute: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === DISPUTE_ID ? DISPUTE_ROW : null)),
    },
    // Missão 07.6 — pending-transaction / release-approvals IDOR fix coverage
    escrowPendingTransaction: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(where.escrowId === ESCROW_ID ? PENDING_TX_ROW : null)),
    },
    escrowReleaseApproval: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(where.escrowId === ESCROW_ID ? RELEASE_APPROVAL_ROWS : [])),
      count: jest.fn(({ where }: any) => Promise.resolve(where.escrowId === ESCROW_ID ? RELEASE_APPROVAL_ROWS.length : 0)),
    },
  },
}))

const redisStore = new Map<string, string>()
jest.mock('../src/common/redis', () => ({
  redis: {
    get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value)
      return Promise.resolve('OK')
    }),
    del: jest.fn((key: string) => {
      redisStore.delete(key)
      return Promise.resolve(1)
    }),
    ping: jest.fn().mockResolvedValue('PONG'),
  },
}))

async function authedSession(participantId: string): Promise<string> {
  const token = `session-${participantId}`
  redisStore.set(`auth:session:${token}`, participantId)
  return token
}

describe('GET /v1/settlement/escrow/:id and /disputes/:id — access control (Missão 06.8)', () => {
  jest.setTimeout(30_000)
  let app: FastifyInstance

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildApp } = require('../src/app')
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('GET /v1/settlement/escrow/:id', () => {
    it('buyer can read their own escrow — ALLOW', async () => {
      const token = await authedSession(BUYER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('seller can also read the same escrow — ALLOW', async () => {
      const token = await authedSession(SELLER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('an authenticated outsider is rejected — DENY', async () => {
      const token = await authedSession(OUTSIDER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
    })

    it('an unauthenticated request is rejected — DENY', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}` })
      expect(res.statusCode).toBe(401)
    })

    it('an invalid session token is rejected — DENY', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: 'Bearer not-a-real-token' } })
      expect(res.statusCode).toBe(401)
    })

    it("the escrow's own returned shape for an authorized party is unchanged", async () => {
      const token = await authedSession(BUYER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.data).toMatchObject({ id: ESCROW_ID, tradeId: TRADE_ID, status: 'DISPUTED', asset: 'BTC' })
    })
  })

  describe('GET /v1/settlement/disputes/:id', () => {
    it('buyer (who opened the dispute) can read it — ALLOW', async () => {
      const token = await authedSession(BUYER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('seller (the other trade party) can also read it — ALLOW', async () => {
      const token = await authedSession(SELLER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('the assigned arbiter can read it — ALLOW', async () => {
      const token = await authedSession(ARBITER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('an authenticated outsider is rejected — DENY', async () => {
      const token = await authedSession(OUTSIDER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
    })

    it('a real arbiter who is NOT assigned to this specific dispute is rejected — DENY', async () => {
      const token = await authedSession(OTHER_ARBITER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
    })

    it('an unauthenticated request is rejected — DENY', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}` })
      expect(res.statusCode).toBe(401)
    })

    it('an invalid session token is rejected — DENY', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}`, headers: { authorization: 'Bearer not-a-real-token' } })
      expect(res.statusCode).toBe(401)
    })

    it('the dispute\'s own returned shape (reason/evidence included) for an authorized reader is unchanged', async () => {
      const token = await authedSession(ARBITER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}`, headers: { authorization: `Bearer ${token}` } })
      const body = JSON.parse(res.body)
      expect(body.success).toBe(true)
      expect(body.data).toMatchObject({
        id: DISPUTE_ID, tradeId: TRADE_ID, reason: 'Seller never sent PIX confirmation', arbiterId: ARBITER_ID,
      })
    })
  })

  // Missão 07.6 release-readiness audit — these two routes had NO
  // requireAuth at all (found live, not from a prior report): anyone who
  // knew or guessed an escrowId could read the unsigned PSBT, destination
  // address, and submitted signatures for a live multisig release/refund/
  // split, plus who had approved a dual-approval release. Same fix shape
  // and same test shape as the GET /v1/settlement/escrow/:id suite above.
  describe('GET /v1/settlement/escrow/:id/pending-transaction', () => {
    it('buyer can read it — ALLOW', async () => {
      const token = await authedSession(BUYER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/pending-transaction`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('seller can also read it — ALLOW', async () => {
      const token = await authedSession(SELLER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/pending-transaction`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('the assigned arbiter can read it — ALLOW', async () => {
      const token = await authedSession(ARBITER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/pending-transaction`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('an authenticated outsider is rejected — DENY', async () => {
      const token = await authedSession(OUTSIDER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/pending-transaction`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
    })

    it('an unauthenticated request is rejected — DENY (this was the real gap: used to be 200)', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/pending-transaction` })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /v1/settlement/escrow/:id/release-approvals', () => {
    it('buyer can read it — ALLOW', async () => {
      const token = await authedSession(BUYER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/release-approvals`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(200)
    })

    it('an authenticated outsider is rejected — DENY', async () => {
      const token = await authedSession(OUTSIDER_ID)
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/release-approvals`, headers: { authorization: `Bearer ${token}` } })
      expect(res.statusCode).toBe(403)
    })

    it('an unauthenticated request is rejected — DENY (this was the real gap: used to be 200)', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}/release-approvals` })
      expect(res.statusCode).toBe(401)
    })
  })
})
