// tests/integration/paymentAccountSigningAuthorityEvidence.test.ts
//
// Master Backlog R7A / #235-N1 — EVIDENCE ONLY (no production change). Pins who can sign a
// PaymentAccount today, through the real route (POST /v1/settlement/payment-accounts/:accountHash/sign)
// with real sessions from the real challenge-response login, and through the service it calls.
//
// Repository meaning of "signed" (RFC-021 D5, payment-account.service.ts, schema/DATABASE.md, the
// route and SDK comments): a peer — the counterparty or the assigned arbiter — attesting that a
// specific completed trade using this account finished without a chargeback; never the owner,
// never "this person is trustworthy". Signing moves computeTradeLimit() from 0.001 to 0.01 BTC.
// These assertions pin today's behavior (authenticated == authorized signer) pending the CTO decision.

import nacl from 'tweetnacl'
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { closeTestRedis } from './identityTestHelpers'

describe('R7A evidence — payment-account signing authority (real PostgreSQL + Redis, real route)', () => {
  jest.setTimeout(120_000)

  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient
  let app: FastifyInstance
  let paymentAccountService: any
  const ownedUserIds: string[] = []

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ paymentAccountService } = require('../../src/modules/open-settlement/payment-account.service'))
    const { buildApp } = require('../../src/app')
    app = await buildApp({ registerSwaggerUi: false })
    await app.ready()
  })

  afterAll(async () => {
    if (!pg.isAvailable()) return
    await app.close()
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM trades WHERE "buyerId" = ANY(${ownedUserIds}) OR "sellerId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM offers WHERE "userId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM payment_accounts WHERE "ownerId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM users WHERE id = ANY(${ownedUserIds})`
    }).catch((err: unknown) => console.warn('R7A evidence cleanup incomplete (owned rows only):', err))
    await prisma.$disconnect()
    await closeTestRedis()
  })

  /** A real participant: registered with proof of possession, logged in through the real challenge flow. */
  async function participant(label: string): Promise<{ id: string; token: string }> {
    const { identityService } = require('../../src/modules/open-identity/identity.service')
    const auth = require('../../src/common/middleware/auth')
    const keypair = nacl.sign.keyPair()
    const publicKey = Buffer.from(keypair.publicKey).toString('hex')
    const { challenge: regChallenge } = await auth.issueRegistrationChallenge(publicKey)
    const regSig = Buffer.from(nacl.sign.detached(auth.registrationProofMessage(regChallenge, label), keypair.secretKey)).toString('hex')
    const user = await identityService.register({ publicKey, signature: regSig, displayName: label })
    ownedUserIds.push(user.id)
    const { challenge } = await auth.issueChallenge(publicKey)
    const sig = Buffer.from(nacl.sign.detached(Buffer.from(challenge), keypair.secretKey)).toString('hex')
    const verdict = await auth.verifySignedChallenge(publicKey, sig)
    expect(verdict.verified).toBe(true)
    return { id: user.id, token: verdict.sessionToken }
  }

  async function ownedAccount(ownerId: string) {
    return paymentAccountService.getOrCreate(ownerId, `r7a-${randomBytes(8).toString('hex')}`, 'PIX')
  }

  const sign = (accountHash: string, token?: string, payload?: unknown) => app.inject({
    method: 'POST',
    url: `/v1/settlement/payment-accounts/${accountHash}/sign`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload ? { payload: payload as any } : {}),
  })

  const rowOf = (accountHash: string) => prisma.paymentAccount.findUniqueOrThrow({ where: { accountHash } })

  it('T0-A: the owner signs their OWN account through the real route — 200, signedBy = owner, 0.001 → 0.01 BTC', async () => {
    pg.requirePostgres('T0-A')
    const owner = await participant('r7a-owner')
    const account = await ownedAccount(owner.id)
    expect(await paymentAccountService.getTradeLimit(account.accountHash)).toBe('0.001')

    const res = await sign(account.accountHash, owner.token)

    expect(res.statusCode).toBe(200)
    const row = await rowOf(account.accountHash)
    expect([row.signed, row.signedBy, row.completedTrades, row.chargebacks]).toEqual([true, owner.id, 0, 0])
    expect(await paymentAccountService.getTradeLimit(account.accountHash)).toBe('0.01')
  })

  it('T0-B: an UNRELATED authenticated user signs someone else\'s account — 200, signedBy = stranger', async () => {
    pg.requirePostgres('T0-B')
    const owner = await participant('r7a-owner-b')
    const stranger = await participant('r7a-stranger')
    const account = await ownedAccount(owner.id)

    const res = await sign(account.accountHash, stranger.token)

    expect(res.statusCode).toBe(200)
    expect((await rowOf(account.accountHash)).signedBy).toBe(stranger.id)
    expect(await paymentAccountService.getTradeLimit(account.accountHash)).toBe('0.01')
  })

  it('T0-C: a counterparty of a COMPLETED trade with the owner gets the identical result — the relationship is never consulted', async () => {
    pg.requirePostgres('T0-C')
    const owner = await participant('r7a-owner-c')
    const counterparty = await participant('r7a-counterparty')
    const offer = await prisma.offer.create({ data: { userId: owner.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.0001', maxAmount: '1', paymentMethod: 'PIX' } })
    await prisma.trade.create({ data: { offerId: offer.id, sellerId: owner.id, buyerId: counterparty.id, asset: 'BTC', amount: '0.0005', priceUsd: '65000', totalUsd: '32.5', status: 'COMPLETED' } })
    const account = await ownedAccount(owner.id)

    const res = await sign(account.accountHash, counterparty.token)

    expect(res.statusCode).toBe(200)
    expect((await rowOf(account.accountHash)).signedBy).toBe(counterparty.id)
  })

  it('T0-D: unauthenticated / invalid session — 401, account unchanged', async () => {
    pg.requirePostgres('T0-D')
    const owner = await participant('r7a-owner-d')
    const account = await ownedAccount(owner.id)
    expect((await sign(account.accountHash)).statusCode).toBe(401)
    expect((await sign(account.accountHash, 'not-a-session')).statusCode).toBe(401)
    expect((await rowOf(account.accountHash)).signed).toBe(false)
  })

  it('T0-E: nonexistent account — 404, nothing created', async () => {
    pg.requirePostgres('T0-E')
    const caller = await participant('r7a-caller-e')
    const hash = `r7a-missing-${randomBytes(8).toString('hex')}`
    expect((await sign(hash, caller.token)).statusCode).toBe(404)
    expect(await prisma.paymentAccount.count({ where: { accountHash: hash } })).toBe(0)
  })

  it('identity binding: client-supplied signedBy/ownerId/participantId are ignored — signedBy is always the session principal', async () => {
    pg.requirePostgres('forgery')
    const owner = await participant('r7a-owner-f')
    const caller = await participant('r7a-caller-f')
    const account = await ownedAccount(owner.id)
    await sign(account.accountHash, caller.token, { signedBy: 'forged-arbiter', ownerId: 'x', participantId: 'y' })
    expect((await rowOf(account.accountHash)).signedBy).toBe(caller.id)
  })

  it('re-sign: a second signer after the first is a no-op — the first signedBy/signedAt stand (one-way flag)', async () => {
    pg.requirePostgres('re-sign')
    const owner = await participant('r7a-owner-g')
    const first = await participant('r7a-first')
    const second = await participant('r7a-second')
    const account = await ownedAccount(owner.id)
    await sign(account.accountHash, first.token)
    const before = await rowOf(account.accountHash)
    expect((await sign(account.accountHash, second.token)).statusCode).toBe(200)
    const after = await rowOf(account.accountHash)
    expect([after.signedBy, after.signedAt?.getTime()]).toEqual([first.id, before.signedAt?.getTime()])
  })

  it('concurrency: the one-way flag is check-then-write, not atomic — concurrent signers can each be told they signed, and the last write wins', async () => {
    pg.requirePostgres('race')
    const owner = await participant('r7a-owner-h')
    const signers = await Promise.all(Array.from({ length: 6 }, (_, i) => participant(`r7a-racer-${i}`)))
    let raced = false
    for (let attempt = 0; attempt < 5 && !raced; attempt++) {
      const account = await ownedAccount(owner.id)
      const results = await Promise.all(signers.map((s) => paymentAccountService.signPaymentAccount(account.accountHash, s.id)))
      const claimedSigners = new Set(results.map((r: any) => r.signedBy))
      if (claimedSigners.size > 1) {
        raced = true
        const final = await rowOf(account.accountHash)
        expect(claimedSigners.has(final.signedBy)).toBe(true)
      }
    }
    // Recorded, not required: whether the race is observed depends on scheduling. The code path itself
    // (findUnique → `if (account.signed) return` → update without a WHERE on `signed`) is the evidence.
    console.log(`R7A race observed: ${raced}`)
  })

  it('second node: a fresh service instance reads the same durable signature; authority is not process-local', async () => {
    pg.requirePostgres('node2')
    const owner = await participant('r7a-owner-i')
    const signer = await participant('r7a-signer-i')
    const account = await ownedAccount(owner.id)
    await sign(account.accountHash, signer.token)
    let node2: any
    jest.isolateModules(() => { node2 = require('../../src/modules/open-settlement/payment-account.service').paymentAccountService })
    const view = await node2.getPublicView(account.accountHash)
    expect([view.signed, view.tradeLimit]).toEqual([true, '0.01'])
  })
})
