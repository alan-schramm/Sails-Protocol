// tests/integration/paymentAccountLimitEvidence.test.ts
//
// Master Backlog R7 / Issue #235 — EVIDENCE ONLY (no production change). Documents the CURRENT
// behavior so the CTO gate decides on facts: the RFC-021 D5 payment-account trade-limit ramp
// (payment-account.service.ts computeTradeLimit(): unsigned 0.001 / signed 0.01 / established 0.05 /
// trusted unlimited, in BTC) is computed and displayed, but no economic transition reads it.
//
// These assertions pin today's behavior. They are expected to change once the CTO freezes the
// policy questions this evidence raises (which party's account, how it binds to a trade, units for
// non-BTC assets, current-vs-snapshot) — at that point this file is rewritten as the enforcement test.
//
// Real PostgreSQL, through the real server-side services the HTTP routes call
// (POST /v1/openp2p/trades → tradeService.createTrade; POST /v1/settlement/escrow →
// escrowService.createEscrow; POST .../lock → lockFunds). No UI, no SDK.

import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import { createPostgresIntegrationHarness } from './postgresTestHarness'
import { closeTestRedis } from './identityTestHelpers'

describe('R7 / #235 evidence — payment-account trade limit is computed, not enforced (real PostgreSQL)', () => {
  jest.setTimeout(120_000)

  const pg = createPostgresIntegrationHarness()
  let prisma: PrismaClient
  let tradeService: any
  let escrowService: any
  let paymentAccountService: any
  let UNSIGNED_TRADE_LIMIT: string
  const ownedUserIds: string[] = []

  beforeAll(async () => {
    await pg.probe()
    if (!pg.isAvailable()) return
    ;({ prisma } = require('../../src/common/database'))
    require('../../src/common/events/handlers').registerEventHandlers()
    ;({ tradeService } = require('../../src/modules/open-p2p/trade.service'))
    ;({ escrowService } = require('../../src/modules/open-settlement/escrow.service'))
    ;({ paymentAccountService, UNSIGNED_TRADE_LIMIT } = require('../../src/modules/open-settlement/payment-account.service'))
  })

  afterAll(async () => {
    if (!pg.isAvailable()) return
    const trades = await prisma.trade.findMany({ where: { OR: [{ buyerId: { in: ownedUserIds } }, { sellerId: { in: ownedUserIds } }] }, select: { id: true } })
    const tradeIds = trades.map((t) => t.id)
    const escrows = await prisma.escrow.findMany({ where: { tradeId: { in: tradeIds } }, select: { id: true } })
    const escrowIds = escrows.map((e) => e.id)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM semantic_transition_records WHERE "interactionId" = ANY(${escrowIds})`
      await tx.$executeRaw`DELETE FROM escrow_events WHERE "escrowId" = ANY(${escrowIds})`
      await tx.$executeRaw`UPDATE trades SET "escrowId" = NULL WHERE id = ANY(${tradeIds})`
      await tx.$executeRaw`DELETE FROM escrows WHERE id = ANY(${escrowIds})`
      await tx.$executeRaw`DELETE FROM messages WHERE "tradeId" = ANY(${tradeIds})`
      await tx.$executeRaw`DELETE FROM trades WHERE id = ANY(${tradeIds})`
      await tx.$executeRaw`DELETE FROM offers WHERE "userId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM payment_accounts WHERE "ownerId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM intents WHERE "participantId" = ANY(${ownedUserIds})`
      await tx.$executeRaw`DELETE FROM users WHERE id = ANY(${ownedUserIds})`
    }).catch((err: unknown) => console.warn('R7 evidence cleanup incomplete (owned rows only):', err))
    await prisma.$disconnect()
    await closeTestRedis()
  })

  /** Seller with a SELL offer, buyer with nothing — each holding ONE fresh, unsigned PIX payment account. */
  async function fixture(asset: 'BTC' | 'USDT_LIQUID', maxAmount: string) {
    const tag = randomBytes(6).toString('hex')
    const seller = await prisma.user.create({ data: { publicKey: `pk-r7-seller-${tag}` } })
    const buyer = await prisma.user.create({ data: { publicKey: `pk-r7-buyer-${tag}` } })
    ownedUserIds.push(seller.id, buyer.id)
    const sellerAccount = await paymentAccountService.getOrCreate(seller.id, `r7-seller-${tag}`, 'PIX')
    const buyerAccount = await paymentAccountService.getOrCreate(buyer.id, `r7-buyer-${tag}`, 'PIX')
    const offer = await prisma.offer.create({
      data: { userId: seller.id, asset, side: 'SELL', priceUsd: asset === 'BTC' ? '65000' : '1', minAmount: '0.00000001', maxAmount, paymentMethod: 'PIX' },
    })
    return { seller, buyer, sellerAccount, buyerAccount, offer }
  }

  it('T0: both payment accounts are at the unsigned floor (0.001 BTC) — the ramp IS computed', async () => {
    pg.requirePostgres('T0')
    const { sellerAccount, buyerAccount } = await fixture('BTC', '10')
    expect(await paymentAccountService.getTradeLimit(sellerAccount.accountHash)).toBe(UNSIGNED_TRADE_LIMIT)
    expect(await paymentAccountService.getTradeLimit(buyerAccount.accountHash)).toBe('0.001')
  })

  it.each([
    ['T0-A below the limit', '0.0009'],
    ['T0-B exactly the limit', '0.001'],
    ['T0-C one satoshi above the limit', '0.00100001'],
    ['T0-D 1000x the limit', '1'],
  ])('%s (%s BTC): a Trade is created — nothing reads the account limit', async (_label, amount) => {
    pg.requirePostgres('T0-A..D')
    const { buyer, offer } = await fixture('BTC', '10')
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount })
    const row = await prisma.trade.findUniqueOrThrow({ where: { id: trade.id } })
    expect(row.amount.toString()).toBe(amount)
  })

  it('T0-E: direct server path — a 1 BTC trade on two unsigned (0.001 BTC) accounts reaches FUNDS_LOCKED', async () => {
    pg.requirePostgres('T0-E')
    const { seller, buyer, offer } = await fixture('BTC', '10')
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '1' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MOCK', lockedAmount: '1', asset: 'BTC' }, buyer.id)
    await escrowService.lockFunds(escrow.id, seller.id)
    const row = await prisma.escrow.findUniqueOrThrow({ where: { id: escrow.id } })
    expect(row.status).toBe('FUNDS_LOCKED')
    expect(row.lockedAmount.toString()).toBe('1')
  })

  it('amount binding: a direct createEscrow() may lock 10,000x the Trade amount — a limit checked on Trade.amount alone would not bound the escrow', async () => {
    pg.requirePostgres('amount binding')
    const { seller, buyer, offer } = await fixture('BTC', '10')
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.0005' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MOCK', lockedAmount: '5', asset: 'BTC' }, buyer.id)
    await escrowService.lockFunds(escrow.id, seller.id)
    const row = await prisma.escrow.findUniqueOrThrow({ where: { id: escrow.id } })
    expect([trade.amount.toString(), row.lockedAmount.toString(), row.status]).toEqual(['0.0005', '5', 'FUNDS_LOCKED'])
  })

  it('units: the ramp is in BTC, but a USDT trade has no comparable unit — 50,000 USDT is created on unsigned accounts', async () => {
    pg.requirePostgres('units')
    const { buyer, offer } = await fixture('USDT_LIQUID', '100000')
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '50000' })
    expect(trade.asset).toBe('USDT_LIQUID')
  })

  it('binding: no Trade/Offer/Escrow column references a PaymentAccount — there is no "account being used" to check', () => {
    const { Prisma } = require('@prisma/client')
    const fieldsOf = (model: string) => Prisma.dmmf.datamodel.models.find((m: any) => m.name === model).fields.map((f: any) => f.name)
    for (const model of ['Trade', 'Offer', 'Escrow']) {
      expect(fieldsOf(model).filter((f: string) => /paymentAccount|accountHash/i.test(f))).toEqual([])
    }
  })

  it('NEW FINDING: an owner can sign their OWN payment account (no counterparty, no completed trade) — 0.001 → 0.01 BTC', async () => {
    pg.requirePostgres('self-sign')
    const { seller, sellerAccount } = await fixture('BTC', '10')
    const signed = await paymentAccountService.signPaymentAccount(sellerAccount.accountHash, seller.id)
    expect(signed.signed).toBe(true)
    expect(signed.signedBy).toBe(seller.id)
    expect(await paymentAccountService.getTradeLimit(sellerAccount.accountHash)).toBe('0.01')
  })
})
