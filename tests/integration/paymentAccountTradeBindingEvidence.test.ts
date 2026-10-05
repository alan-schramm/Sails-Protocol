// tests/integration/paymentAccountTradeBindingEvidence.test.ts
//
// Master Backlog R7B / #235 — EVIDENCE ONLY (no production change). Complements the R7 and R7A
// evidence suites (fix/235-payment-account-trade-limit-enforcement, fix/235-payment-account-signing-
// authority) with the binding-specific cases: there is no durable Trade ↔ PaymentAccount relationship,
// so attestation can target an account that never took part in any interaction, through a trade that
// never completed, on a payment method the trade never used.
//
// Real PostgreSQL, real services (tradeService.createTrade, paymentAccountService.signPaymentAccount —
// the function POST /v1/settlement/payment-accounts/:accountHash/sign calls with the session principal).

import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { closeTestRedis } from './identityTestHelpers'

describe('R7B evidence — no Trade ↔ PaymentAccount binding (real PostgreSQL)', () => {
  jest.setTimeout(120_000)

  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient
  let tradeService: any
  let paymentAccountService: any
  const ownedUserIds: string[] = []

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
    require('../../src/common/events/handlers').registerEventHandlers()
    ;({ tradeService } = require('../../src/modules/open-p2p/trade.service'))
    ;({ paymentAccountService } = require('../../src/modules/open-settlement/payment-account.service'))
  })

  afterAll(async () => {
    if (!pg.isAvailable()) return
    await prisma.$transaction(async (tx) => {
      const trades = await tx.trade.findMany({ where: { OR: [{ buyerId: { in: ownedUserIds } }, { sellerId: { in: ownedUserIds } }] }, select: { id: true } })
      const tradeIds = trades.map((t) => t.id)
      await tx.$executeRaw`DELETE FROM messages WHERE "tradeId" = ANY(${tradeIds})`
      await tx.$executeRaw`DELETE FROM trades WHERE id = ANY(${tradeIds})`
      await tx.$executeRaw`DELETE FROM offers WHERE "userId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM payment_accounts WHERE "ownerId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM vouches WHERE "voucherId" = ANY(${ownedUserIds}) OR "voucheeId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM intents WHERE "participantId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM users WHERE id = ANY(${ownedUserIds})`
    }).catch((err: unknown) => console.warn('R7B evidence cleanup incomplete (owned rows only):', err))
    await prisma.$disconnect()
    await closeTestRedis()
  })

  async function users() {
    const tag = randomBytes(6).toString('hex')
    const seller = await prisma.user.create({ data: { publicKey: `pk-r7b-seller-${tag}` } })
    const buyer = await prisma.user.create({ data: { publicKey: `pk-r7b-buyer-${tag}` } })
    ownedUserIds.push(seller.id, buyer.id)
    return { seller, buyer, tag }
  }

  it('T0-A: a Trade is created through the real path with no PaymentAccount anywhere — none registered, none referenced', async () => {
    pg.requirePostgres('T0-A')
    const { seller, buyer } = await users()
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.0001', maxAmount: '1', paymentMethod: 'PIX', paymentDetails: 'free-text PIX key, never hashed' } })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.0005' })
    expect(await prisma.paymentAccount.count({ where: { ownerId: { in: [seller.id, buyer.id] } } })).toBe(0)
    const { Prisma } = require('@prisma/client')
    const tradeFields = Prisma.dmmf.datamodel.models.find((m: any) => m.name === 'Trade').fields.map((f: any) => f.name)
    expect(tradeFields.filter((f: string) => /paymentAccount|accountHash/i.test(f))).toEqual([])
    expect(trade.status).toBe('PENDING')
  })

  it('T0-F substitution: the counterparty of a CANCELLED PIX trade attests the owner\'s never-used TED account — accepted, tier rises', async () => {
    pg.requirePostgres('T0-F')
    const { seller, buyer, tag } = await users()
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.0001', maxAmount: '1', paymentMethod: 'PIX' } })
    await prisma.trade.create({ data: { offerId: offer.id, sellerId: seller.id, buyerId: buyer.id, asset: 'BTC', amount: '0.0005', priceUsd: '65000', totalUsd: '32.5', status: 'CANCELLED' } })
    const pixAccount = await paymentAccountService.getOrCreate(seller.id, `r7b-pix-${tag}`, 'PIX')
    const tedAccount = await paymentAccountService.getOrCreate(seller.id, `r7b-ted-${tag}`, 'TED')

    const signed = await paymentAccountService.signPaymentAccount(tedAccount.accountHash, buyer.id)

    expect([signed.signed, signed.signedBy, signed.paymentMethod]).toEqual([true, buyer.id, 'TED'])
    expect(await paymentAccountService.getTradeLimit(tedAccount.accountHash)).toBe('0.01')
    // The account actually tied to the (cancelled) trade's payment method is untouched — the attestation
    // landed on a different account the trade never involved.
    expect((await prisma.paymentAccount.findUniqueOrThrow({ where: { accountHash: pixAccount.accountHash } })).signed).toBe(false)
  })

  it('provenance: a D7 voucher-signed account and a peer-signed account are indistinguishable in durable state', async () => {
    pg.requirePostgres('provenance')
    const { seller, buyer, tag } = await users()
    const voucher = await prisma.user.create({ data: { publicKey: `pk-r7b-voucher-${tag}` } })
    ownedUserIds.push(voucher.id)
    await prisma.vouch.create({ data: { voucherId: voucher.id, voucheeId: buyer.id } })
    const vouched = await paymentAccountService.getOrCreate(buyer.id, `r7b-vouched-${tag}`, 'PIX')
    const peerAccount = await paymentAccountService.getOrCreate(seller.id, `r7b-peer-${tag}`, 'PIX')
    const peerSigned = await paymentAccountService.signPaymentAccount(peerAccount.accountHash, buyer.id)
    const shape = (a: any) => Object.keys(a).filter((k) => /sign|vouch|provenance|source/i.test(k)).sort()
    expect(shape(vouched)).toEqual(shape(peerSigned))
    expect([vouched.signed, vouched.signedBy]).toEqual([true, voucher.id])
    expect([peerSigned.signed, peerSigned.signedBy]).toEqual([true, buyer.id])
  })
})
