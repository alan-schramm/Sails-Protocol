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
const BUYER_PUBKEY_HEX = '02' + 'a1'.repeat(32)
const SELLER_PUBKEY_HEX = '03' + 'b2'.repeat(32)
const PARTICIPANT_KEY_ROWS = [
  { id: 'pk-buyer', escrowId: ESCROW_ID, role: 'buyer', participantId: BUYER_ID, pubkey: BUYER_PUBKEY_HEX, createdAt: new Date() },
  { id: 'pk-seller', escrowId: ESCROW_ID, role: 'seller', participantId: SELLER_ID, pubkey: SELLER_PUBKEY_HEX, createdAt: new Date() },
]
const ESCROW_ROW = {
  id: ESCROW_ID, tradeId: TRADE_ID, type: 'MOCK', status: 'DISPUTED', lockedAmount: '0.01', asset: 'BTC',
  events: [], disputes: [DISPUTE_ROW], participantKeys: PARTICIPANT_KEY_ROWS,
}
const PENDING_TX_ROW = {
  id: 'pending-tx-1', escrowId: ESCROW_ID, unsignedPsbtBase64: 'cHNidP8BA...', toAddress: 'bc1qoutsider-cannot-see-this',
  requiredSigners: [BUYER_ID, SELLER_ID], signatures: [],
}
const RELEASE_APPROVAL_ROWS = [{ id: 'approval-1', escrowId: ESCROW_ID, participantId: BUYER_ID, approvedAt: new Date() }]

// M10 SDK Adapter fixtures — GET .../semantic-record. Deliberately
// picks values that DIFFER from both the "expected" ruleset columns
// (rulesetExpectedEvaluatorName/Version) and from the real, current
// in-memory DISPUTE_RULING_RULESET constant (packages'
// dispute-outcome.ts: version '1.0') — so a test asserting the
// response matches THESE fixture values, not the constant's or the
// "expected" columns', proves the route reads actual/persisted data,
// never the current constant or the merely-expected identity.
const SEMANTIC_RECORD_ROUND_0 = {
  id: 'str-round-0',
  interactionId: ESCROW_ID,
  transitionType: 'ESCROW_DISPUTE_RULING',
  fromState: 'DISPUTED',
  toState: 'RESOLVED',
  priorPositionKind: 'LEGACY_UNVERIFIED',
  priorPositionReference: null,
  rulesetName: 'Sails Mission13 Dispute Ruling Ruleset',
  rulesetIdentity: 'sails-mission13-dispute-ruling-ruleset',
  // Deliberately NOT '1.0' (the current DISPUTE_RULING_RULESET
  // constant's real version) — proves the route reads the persisted
  // column, not the constant.
  rulesetVersion: '0.9-HISTORICAL',
  rulesetCommitment: 'sails-mission13-dispute-ruling-ruleset@0.9-HISTORICAL:attributed-decision+economic-outcome',
  rulesetExpectedEvaluatorName: 'expected-evaluator-NEVER-RETURNED',
  rulesetExpectedEvaluatorVersion: '9.9',
  rulesetExpectedProfileName: 'expected-profile-NEVER-RETURNED',
  rulesetExpectedProfileVersion: '9.9',
  evaluatorIdentityName: 'sails-attribution-evaluator',
  evaluatorIdentityVersion: '1.0',
  profileIdentityName: 'sails-semantic-profile',
  profileIdentityVersion: '1.0',
  deadlineMs: 0n,
  evaluationTimeMs: 0n,
  conditionResult: 'SATISFIED',
  // Deliberately NOT the dispute's current arbiterId (ARBITER_ID) — a
  // different actor, proving neither the current arbiter nor this
  // record's own historical actor gets implicit read access.
  attributionActor: OTHER_ARBITER_ID,
  attributionRawProof: 'aa'.repeat(64),
  attributionResolvedIdentity: SELLER_PUBKEY_HEX,
  outcomeContent: {
    ruling: 'RELEASE',
    totalUnits: '1000000',
    asset: 'BTC',
    allocations: [{ beneficiary: BUYER_ID, basisPoints: 10000 }],
    remainderBeneficiary: BUYER_ID,
  },
  outcomeDestinationBinding: [{ beneficiary: BUYER_ID, destination: 'bc1qround0destination' }],
  createdAt: new Date('2026-08-30T00:00:00Z'),
  appealRound: 0,
}
const SEMANTIC_RECORD_ROUND_1 = {
  ...SEMANTIC_RECORD_ROUND_0,
  id: 'str-round-1',
  attributionActor: ARBITER_ID,
  attributionRawProof: 'bb'.repeat(64),
  outcomeContent: {
    ...SEMANTIC_RECORD_ROUND_0.outcomeContent,
    ruling: 'REFUND',
    asset: 'DIFFERENT_ASSET_ROUND_1',
  },
  outcomeDestinationBinding: [{ beneficiary: SELLER_ID, destination: 'bc1qround1destination' }],
  appealRound: 1,
}

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
    // M10 SDK Adapter — mirrors loadDisputeRulingRecord()'s own real
    // where-shape exactly (interactionId_transitionType_appealRound).
    // appealRound 2 (and any other escrow/round pair) deliberately has
    // no fixture — real absence, not a stubbed-in null — to prove the
    // route's 404 path is reachable, not just theoretically distinct.
    semanticTransitionRecord: {
      findUnique: jest.fn(({ where }: any) => {
        const key = where.interactionId_transitionType_appealRound
        if (!key || key.interactionId !== ESCROW_ID) return Promise.resolve(null)
        if (key.appealRound === 0) return Promise.resolve(SEMANTIC_RECORD_ROUND_0)
        if (key.appealRound === 1) return Promise.resolve(SEMANTIC_RECORD_ROUND_1)
        return Promise.resolve(null)
      }),
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
    // M9.10-R root cause: config/index.ts reads TRUSTED_ARBITRATORS exactly
    // once, at first import, into dispute.service.ts's lazy singleton
    // (getDisputeService()), which then throws ValidationError('No trusted
    // arbitrators configured') on every call for the rest of the process
    // if it was empty at that first construction. Locally this was always
    // silently satisfied by a gitignored .env (TRUSTED_ARBITRATORS=k6-test-arbiter);
    // CI never sets it. Set explicitly here, before the dynamic require
    // below, so this test's outcome never depends on ambient environment —
    // same pattern tests/cors.test.ts already established for this exact
    // class of bug. Includes both arbiter fixtures since OTHER_ARBITER_ID
    // is exercised as a real, legitimately-trusted arbiter who simply isn't
    // assigned to this dispute.
    process.env.TRUSTED_ARBITRATORS = `${ARBITER_ID},${OTHER_ARBITER_ID}`
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

    // Missão 10, Fase 6.11 — participantKeys additive exposure, gated by
    // the SAME authorization this whole route already enforces. Backend
    // half of Level 2 (server registration integrity) verification.
    describe('participantKeys (Missão 10, Fase 6.11 — additive, same authorization gate)', () => {
      const expectedShape = [
        { participantId: BUYER_ID, role: 'buyer', publicKeyHex: BUYER_PUBKEY_HEX },
        { participantId: SELLER_ID, role: 'seller', publicKeyHex: SELLER_PUBKEY_HEX },
      ]

      it('buyer (authorized) sees participantKeys with the exact persisted pubkeys', async () => {
        const token = await authedSession(BUYER_ID)
        const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
        const body = JSON.parse(res.body)
        expect(body.data.participantKeys).toEqual(expectedShape)
      })

      it('seller (authorized) sees the same participantKeys', async () => {
        const token = await authedSession(SELLER_ID)
        const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
        const body = JSON.parse(res.body)
        expect(body.data.participantKeys).toEqual(expectedShape)
      })

      it('the assigned arbiter (authorized via the dispute) sees participantKeys too', async () => {
        const token = await authedSession(ARBITER_ID)
        const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
        const body = JSON.parse(res.body)
        expect(res.statusCode).toBe(200)
        expect(body.data.participantKeys).toEqual(expectedShape)
      })

      it('an authenticated outsider still gets 403 — never reaches a body containing participantKeys', async () => {
        const token = await authedSession(OUTSIDER_ID)
        const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
        expect(res.statusCode).toBe(403)
        expect(res.body).not.toContain(BUYER_PUBKEY_HEX)
        expect(res.body).not.toContain(SELLER_PUBKEY_HEX)
      })

      it('an unauthenticated request still gets 401 — never reaches a body containing participantKeys', async () => {
        const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}` })
        expect(res.statusCode).toBe(401)
        expect(res.body).not.toContain(BUYER_PUBKEY_HEX)
      })

      it('the wire field is publicKeyHex, not the raw DB column name pubkey — and no private key/seed material appears anywhere in the response', async () => {
        const token = await authedSession(BUYER_ID)
        const res = await app.inject({ method: 'GET', url: `/v1/settlement/escrow/${ESCROW_ID}`, headers: { authorization: `Bearer ${token}` } })
        expect(res.body).toContain('publicKeyHex')
        expect(res.body).not.toMatch(/"pubkey":/)
        expect(res.body.toLowerCase()).not.toMatch(/privatekey|"seed"|xprv/)
      })

      it('no reverse lookup surface exists — this route is scoped by escrowId only, no pubkey-keyed query parameter is accepted', async () => {
        const token = await authedSession(BUYER_ID)
        const res = await app.inject({
          method: 'GET',
          url: `/v1/settlement/escrow/${ESCROW_ID}?pubkey=${BUYER_PUBKEY_HEX}`,
          headers: { authorization: `Bearer ${token}` },
        })
        // A stray query param is simply ignored by this route (it only
        // ever reads :id from params) — same 200/scoped response as
        // without it, proving no pubkey-based filtering/lookup exists.
        expect(res.statusCode).toBe(200)
        const body = JSON.parse(res.body)
        expect(body.data.id).toBe(ESCROW_ID)
      })
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

  // M10 SDK Adapter — historical semantic read surface.
  describe('GET /v1/settlement/disputes/:id/semantic-record', () => {
    async function getRecord(callerId: string, appealRound: number | undefined) {
      const token = await authedSession(callerId)
      const url = appealRound === undefined
        ? `/v1/settlement/disputes/${DISPUTE_ID}/semantic-record`
        : `/v1/settlement/disputes/${DISPUTE_ID}/semantic-record?appealRound=${appealRound}`
      return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } })
    }

    it('1. buyer can read — ALLOW', async () => {
      const res = await getRecord(BUYER_ID, 0)
      expect(res.statusCode).toBe(200)
    })

    it('2. seller can read — ALLOW', async () => {
      const res = await getRecord(SELLER_ID, 0)
      expect(res.statusCode).toBe(200)
    })

    it('3. an unrelated authenticated user is rejected — DENY', async () => {
      const res = await getRecord(OUTSIDER_ID, 0)
      expect(res.statusCode).toBe(403)
    })

    it('4. the current arbiter (dispute.arbiterId) receives NO implicit privilege — DENY', async () => {
      // ARBITER_ID is DISPUTE_ROW.arbiterId (current), but is NOT
      // SEMANTIC_RECORD_ROUND_0.attributionActor (OTHER_ARBITER_ID) —
      // proves reading the current arbiter field grants nothing here.
      const res = await getRecord(ARBITER_ID, 0)
      expect(res.statusCode).toBe(403)
    })

    it("5. the historical record's own attributionActor receives NO implicit privilege — DENY", async () => {
      // OTHER_ARBITER_ID actually decided round 0 (per the fixture) but
      // is not a trade party — proves economic authority to decide ≠
      // information access authority to read about the decision.
      const res = await getRecord(OTHER_ARBITER_ID, 0)
      expect(res.statusCode).toBe(403)
    })

    it('6. explicit appealRound selects the correct historical record, not a different one', async () => {
      const round0 = await getRecord(BUYER_ID, 0)
      const round1 = await getRecord(BUYER_ID, 1)
      const body0 = JSON.parse(round0.body).data
      const body1 = JSON.parse(round1.body).data
      expect(body0.appealRound).toBe(0)
      expect(body1.appealRound).toBe(1)
      expect(body0.outcome.asset).toBe('BTC')
      expect(body1.outcome.asset).toBe('DIFFERENT_ASSET_ROUND_1')
      expect(body0.attribution.actor).toBe(OTHER_ARBITER_ID)
      expect(body1.attribution.actor).toBe(ARBITER_ID)
    })

    it('7. a round with no persisted record — 404, not fabricated content', async () => {
      const res = await getRecord(BUYER_ID, 2)
      expect(res.statusCode).toBe(404)
    })

    it("8. absence (404) is never representable as conditionResult: 'UNKNOWN' — the two are structurally different facts", async () => {
      const absent = await getRecord(BUYER_ID, 2)
      expect(absent.statusCode).toBe(404)
      const body = JSON.parse(absent.body)
      // A 404 body must never carry a conditionResult field at all —
      // if it did, a careless caller could mistake absence for
      // uncertainty. UNKNOWN only ever appears inside a 200 body for a
      // record that genuinely exists.
      expect(body.data?.conditionResult).toBeUndefined()
      const present = await getRecord(BUYER_ID, 0)
      expect(present.statusCode).toBe(200)
      expect(JSON.parse(present.body).data.conditionResult).toBe('SATISFIED')
    })

    it('9. persisted evaluator identity survives unchanged', async () => {
      const res = await getRecord(BUYER_ID, 0)
      const body = JSON.parse(res.body).data
      expect(body.evaluatorIdentity).toEqual({ name: 'sails-attribution-evaluator', version: '1.0' })
    })

    it('10. persisted profile identity survives unchanged', async () => {
      const res = await getRecord(BUYER_ID, 0)
      const body = JSON.parse(res.body).data
      expect(body.profileIdentity).toEqual({ name: 'sails-semantic-profile', version: '1.0' })
    })

    it('11. persisted ruleset identity survives unchanged — never the current in-memory constant, never the merely-expected identity', async () => {
      const res = await getRecord(BUYER_ID, 0)
      const body = JSON.parse(res.body).data
      // '0.9-HISTORICAL' is the fixture's PERSISTED version — deliberately
      // NOT '1.0' (DISPUTE_RULING_RULESET's real current constant).
      expect(body.rulesetIdentity).toEqual({ name: 'sails-mission13-dispute-ruling-ruleset', version: '0.9-HISTORICAL' })
      // The "expected" columns (rulesetExpectedEvaluatorName/Version)
      // must never leak into the response as if they were actual.
      expect(JSON.stringify(body)).not.toContain('expected-evaluator-NEVER-RETURNED')
      expect(JSON.stringify(body)).not.toContain('expected-profile-NEVER-RETURNED')
    })

    it('12. the exact attribution signature survives unchanged', async () => {
      const res = await getRecord(BUYER_ID, 0)
      const body = JSON.parse(res.body).data
      expect(body.attribution).toEqual({
        actor: OTHER_ARBITER_ID,
        signatureHex: 'aa'.repeat(64),
        resolvedIdentityReference: SELLER_PUBKEY_HEX,
      })
    })

    it('13. Outcome survives field-complete', async () => {
      const res = await getRecord(BUYER_ID, 0)
      const body = JSON.parse(res.body).data
      expect(body.outcome).toMatchObject({
        ruling: 'RELEASE',
        totalUnits: '1000000',
        asset: 'BTC',
        allocations: [{ beneficiary: BUYER_ID, basisPoints: 10000 }],
        remainderBeneficiary: BUYER_ID,
      })
    })

    it('14. DestinationBinding survives field-complete', async () => {
      const res = await getRecord(BUYER_ID, 0)
      const body = JSON.parse(res.body).data
      expect(body.outcome.destinations).toEqual([{ beneficiary: BUYER_ID, destination: 'bc1qround0destination' }])
    })

    it('an unauthenticated request is rejected — DENY', async () => {
      const res = await app.inject({ method: 'GET', url: `/v1/settlement/disputes/${DISPUTE_ID}/semantic-record?appealRound=0` })
      expect(res.statusCode).toBe(401)
    })

    it('a missing appealRound query param is rejected — 400, never silently defaulted', async () => {
      const res = await getRecord(BUYER_ID, undefined)
      expect(res.statusCode).toBe(400)
    })
  })
})
