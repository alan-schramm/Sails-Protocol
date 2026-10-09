// tests/integration/economicFixtures.ts
//
// #235 R7H-E3 — fixture preconditions for escrows on a governed rail (MULTISIG/BTC under the trade-limit policy).
//
// Since R7H-E3 the database and the escrow service refuse an escrow on a governed rail unless, under the policy
// version in force: the trade's seller created it, the trade is bound to a PaymentAccount that seller owns, the
// account's method is the offer's method, and that method is eligible (V1: PIX). These helpers build exactly those
// preconditions, explicitly, so a suite written before E3 keeps proving its own invariant on a trade E3 accepts.
// They grant nothing: every row goes through the same guards as production data.
//
//   const acct = await sellerPixAccount(prisma, seller.id)
//   offer:  liquidityRouter.createOffer({ ..., ...boundOfferInput(acct) })      (service, SELL offer)
//           prisma.offer.create({ data: { ..., ...boundOfferRow(acct) } })      (row)
//   trade:  tradeService.createTrade(...)  inherits the binding from a SELL offer; for a row:
//           prisma.trade.create({ data: { ..., ...boundTradeRow(acct) } })
//   escrow: escrowService.createEscrow(input, trade.sellerId)                     (the seller, never the buyer)
//   cleanup: await deleteFixtureAccounts(prisma, userIds) after trades and offers, before users.

import { randomBytes } from 'crypto'

type AccountRow = { id: string; accountHash: string }
type Db = {
  paymentAccount: { create(args: { data: Record<string, unknown> }): Promise<AccountRow> }
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>
}

/** A PIX PaymentAccount owned by `sellerId`: the account a governed-rail trade must be bound to. */
export function sellerPixAccount(db: Db, sellerId: string): Promise<AccountRow> {
  return db.paymentAccount.create({ data: { ownerId: sellerId, accountHash: `fixture-pix-${randomBytes(12).toString('hex')}`, paymentMethod: 'PIX' } })
}

/** liquidityRouter.createOffer() input binding `account` (SELL offer: the trade taken from it inherits the binding). */
export const boundOfferInput = (account: AccountRow) => ({ paymentMethod: 'PIX' as const, paymentAccountHash: account.accountHash })

/** prisma.offer.create() data binding `account`. */
export const boundOfferRow = (account: AccountRow) => ({ paymentMethod: 'PIX' as const, paymentAccountId: account.id })

/** prisma.trade.create() data binding `account` (write-once: only at creation). */
export const boundTradeRow = (account: AccountRow) => ({ sellerPaymentAccountId: account.id })

/** Fixture accounts are removed after the trades and offers that reference them, before their owners. */
export async function deleteFixtureAccounts(db: Db, ownerIds: string[]): Promise<void> {
  await db.$executeRaw`DELETE FROM payment_accounts WHERE "ownerId" = ANY(${ownerIds})`
}
