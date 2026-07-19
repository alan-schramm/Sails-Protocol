/**
 * Builds a Trade from the offer + amount a user actually picked in
 * OfferDetail — fixes a real UX bug: `handleStartTrade()` used to
 * navigate straight to a hardcoded `MOCK_TRADE`, so a user browsing any
 * offer landed on a trade screen showing a different asset/amount/
 * counterparty than what they'd just selected. This constructs a
 * Trade-shaped object from the real offer instead, client-side — a real
 * backend would do this server-side (`POST /v1/openp2p/trades`) and
 * return the authoritative Trade; this is the honest mock equivalent,
 * not a claim that persistence happens anywhere.
 */
import type { Escrow, EscrowEvent, Message, Offer, Trade, User } from '../types'
import { formatByCurrency } from './currency'

let tradeMsgCounter = 1

export function buildTradeFromOffer(offer: Offer, amount: number, currentUser: User): Trade {
  const offerOwnerIsSeller = offer.side === 'SELL'
  const buyer = offerOwnerIsSeller ? currentUser : offer.user
  const seller = offerOwnerIsSeller ? offer.user : currentUser

  const totalUsd = amount * offer.priceUsd
  // Trade's total in the offer's own fiat currency — reuses the
  // `totalBrl` field name for the same reason Offer.priceFiat
  // generalizes Offer.priceBrl (see types.ts's own comment on Offer);
  // not a claim the real schema supports non-BRL trades yet.
  const totalFiat = amount * offer.priceFiat
  const now = new Date().toISOString()

  const events: EscrowEvent[] = [
    { status: 'CREATED', timestamp: now, actor: 'system', note: 'Escrow initialized' },
    { status: 'FUNDS_LOCKED', timestamp: now, actor: seller.displayName ?? seller.id, note: 'Funds locked by seller' },
  ]

  const escrow: Escrow = {
    id: `esc-${offer.id}`,
    tradeId: `trade-${offer.id}`,
    type: 'MOCK',
    status: 'FUNDS_LOCKED',
    lockedAmount: amount,
    asset: offer.asset,
    timelockHours: 24,
    txLockId: `mock-lock-${offer.id}`,
    txReleaseId: null,
    expiresAt: null,
    events,
  }

  const totalLabel = formatByCurrency(totalFiat, offer.fiatCurrency)
  const messages: Message[] = [
    {
      id: `sys-${tradeMsgCounter++}`,
      senderId: null,
      sender: null,
      content: `🔒 Trade iniciado. Escrow ativado. ${amount} ${offer.asset} travados pelo vendedor.`,
      type: 'SYSTEM',
      createdAt: now,
    },
    {
      id: `m-${tradeMsgCounter++}`,
      senderId: seller.id,
      sender: seller,
      content: `Olá! Os fundos estão em escrow. Envie o pagamento via ${offer.paymentMethod} no valor de ${totalLabel}.`,
      type: 'TEXT',
      createdAt: now,
    },
  ]

  return {
    id: `trade-${offer.id}`,
    offerId: offer.id,
    offer,
    buyer,
    seller,
    asset: offer.asset,
    amount,
    priceUsd: offer.priceUsd,
    totalUsd,
    totalBrl: totalFiat,
    status: 'ACTIVE',
    network: offer.network,
    createdAt: now,
    escrow,
    messages,
  }
}
