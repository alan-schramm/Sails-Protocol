import { SailsClient } from '@sails/sdk'
import type { AssetType } from '@sails/sdk'

const BASE_URL = process.env.SAILS_BASE_URL ?? 'http://127.0.0.1:3000'
const USER_COUNT = 100
const OFFER_COUNT = 300
const TRADE_COUNT = 120
const CHAT_COUNT = 80
const CANCEL_COUNT = 30
const DISPUTE_COUNT = 20
const CONCURRENCY = 10

interface UserAccount {
  participantId: string
  wallet: SailsClient
}

interface OfferWithSeller {
  offerId: string
  seller: UserAccount
  minAmount: string
  maxAmount: string
}

interface TradeWithParties {
  tradeId: string
  offerId: string
  buyer: UserAccount
  seller: UserAccount
  asset: AssetType
  amount: string
}

function randomElement<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function createUsers(): Promise<UserAccount[]> {
  const users: UserAccount[] = []
  const names = Array.from({ length: USER_COUNT }, (_, index) => `stress-user-${index + 1}`)

  const batches = chunkArray(names, CONCURRENCY)
  for (const batch of batches) {
    const results = await Promise.all(batch.map(async (name) => {
      const wallet = new SailsClient({ baseUrl: BASE_URL })
      const { participant, keypair } = await wallet.identity.create(undefined, name)
      await wallet.identity.authenticate(keypair)
      console.log(`registered/authenticated ${name} (${participant.id})`)
      return { participantId: participant.id, wallet }
    }))
    users.push(...results)
  }

  return users
}

async function createOffers(users: UserAccount[]): Promise<OfferWithSeller[]> {
  const created: OfferWithSeller[] = []
  const assets = ['USDT_ERC20', 'BTC', 'LN_BTC'] as const
  const paymentMethods = ['PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT'] as const

  const batches = chunkArray(Array.from({ length: OFFER_COUNT }, (_, index) => index), CONCURRENCY)
  for (const batch of batches) {
    const results = await Promise.all(batch.map(async () => {
      const seller = randomElement(users)
      const asset = randomElement(assets)
      const priceUsd = (0.5 + Math.random() * 4).toFixed(2)
      const minAmount = asset === 'USDT_ERC20' ? '1' : '0.001'
      const maxAmount = asset === 'USDT_ERC20' ? '100' : '1'
      const offer = await seller.wallet.liquidity.publish({
        asset,
        side: 'SELL',
        priceUsd,
        minAmount,
        maxAmount,
        paymentMethod: randomElement(paymentMethods),
        paymentDetails: `stress-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      console.log(`offer published ${offer.id} by ${seller.participantId}`)
      return { offerId: offer.id, seller, minAmount: offer.minAmount, maxAmount: offer.maxAmount }
    }))
    created.push(...results)
  }

  return created
}

async function createTrades(offers: OfferWithSeller[], users: UserAccount[]): Promise<TradeWithParties[]> {
  const trades: TradeWithParties[] = []
  const selectedOffers = offers.slice(0, Math.min(TRADE_COUNT, offers.length))
  const batches = chunkArray(selectedOffers, CONCURRENCY)

  for (const batch of batches) {
    const results = await Promise.all(batch.map(async (offer) => {
      const availableBuyers = users.filter((user) => user.participantId !== offer.seller.participantId)
      if (availableBuyers.length === 0) {
        console.warn(`no available buyer for offer ${offer.offerId}`)
        return null
      }
      const buyer = randomElement(availableBuyers)
      const amount = offer.minAmount
      try {
        const trade = await buyer.wallet.openp2p.trade(offer.offerId, amount)
        console.log(`trade created ${trade.id} on offer ${offer.offerId}`)
        return {
          tradeId: trade.id,
          offerId: offer.offerId,
          buyer,
          seller: offer.seller,
          asset: trade.asset,
          amount: trade.amount,
        }
      } catch (err) {
        console.error(`failed to create trade for offer ${offer.offerId}:`, err instanceof Error ? err.message : err)
        return null
      }
    }))
    trades.push(...results.filter((result): result is TradeWithParties => result !== null))
  }

  return trades
}

async function waitForChatOpen(channel: { onConnectionStateChange: (handler: (state: string) => void) => void }, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('chat open timed out'))
      }
    }, timeoutMs)

    channel.onConnectionStateChange((state) => {
      if (state === 'open' && !settled) {
        settled = true
        clearTimeout(timer)
        resolve()
      }
      if (state === 'closed' && !settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error('chat closed before opening'))
      }
    })
  })
}

async function openChats(trades: TradeWithParties[]): Promise<void> {
  const toChat = trades.slice(0, CHAT_COUNT)
  for (const trade of toChat) {
    const buyerChat = trade.buyer.wallet.openp2p.chat(trade.tradeId)
    const sellerChat = trade.seller.wallet.openp2p.chat(trade.tradeId)

    const messagePromise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`chat timeout for trade ${trade.tradeId}`)), 30000)
      sellerChat.onMessage((msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
    })

    try {
      await Promise.all([
        waitForChatOpen(buyerChat, 15000),
        waitForChatOpen(sellerChat, 15000),
      ])
      await sleep(300)
      buyerChat.send({ content: `Hello seller — this is buyer ${trade.buyer.participantId} for trade ${trade.tradeId}` })

      const message = await messagePromise
      console.log(`trade ${trade.tradeId} chat received by seller: ${JSON.stringify(message).slice(0, 120)}`)
      sellerChat.send({ content: `Received your message on trade ${trade.tradeId}` })
      await sleep(100)
    } catch (err) {
      console.error(`chat failed for trade ${trade.tradeId}:`, err instanceof Error ? err.message : err)
    } finally {
      buyerChat.close()
      sellerChat.close()
    }
  }
}

async function cancelTrades(trades: TradeWithParties[]): Promise<void> {
  const selected = trades.slice(0, Math.min(CANCEL_COUNT, trades.length))
  for (const trade of selected) {
    try {
      await trade.buyer.wallet.openp2p.updateTradeStatus(trade.tradeId, 'CANCELLED')
      console.log(`trade cancelled ${trade.tradeId} by buyer ${trade.buyer.participantId}`)
    } catch (err) {
      console.error(`failed to cancel trade ${trade.tradeId}:`, err instanceof Error ? err.message : err)
    }
  }
}

async function disputeTrades(trades: TradeWithParties[]): Promise<void> {
  const selected = trades.slice(0, Math.min(DISPUTE_COUNT, trades.length))
  for (const trade of selected) {
    try {
      const escrow = await trade.seller.wallet.settlement.create({
        tradeId: trade.tradeId,
        lockedAmount: trade.amount,
        asset: trade.asset,
      })
      console.log(`escrow created ${escrow.id} for trade ${trade.tradeId}`)

      await trade.seller.wallet.settlement.lock(escrow.id)
      console.log(`escrow locked ${escrow.id}`)

      await trade.buyer.wallet.settlement.markPaymentSent(escrow.id)
      console.log(`payment marked sent for escrow ${escrow.id}`)

      const dispute = await trade.buyer.wallet.settlement.dispute(escrow.id, `Dispute opened by buyer ${trade.buyer.participantId}`)
      console.log(`dispute opened ${dispute.id} for escrow ${escrow.id}`)
    } catch (err) {
      console.error(`failed dispute for trade ${trade.tradeId}:`, err instanceof Error ? err.message : err)
    }
  }
}

async function main(): Promise<void> {
  console.log(`SDK pressure test starting against ${BASE_URL}`)
  const users = await createUsers()
  console.log(`created ${users.length} users`)

  const offers = await createOffers(users)
  console.log(`created ${offers.length} offers`)

  const trades = await createTrades(offers, users)
  console.log(`created ${trades.length} trades`)

  await openChats(trades)
  console.log(`opened and exchanged chat messages on ${Math.min(CHAT_COUNT, trades.length)} trades`)

  await cancelTrades(trades)
  await disputeTrades(trades)

  console.log('\nSDK pressure test complete.')
  console.log(`users=${users.length} offers=${offers.length} trades=${trades.length} chats=${Math.min(CHAT_COUNT, trades.length)} cancelled=${Math.min(CANCEL_COUNT, trades.length)} disputed=${Math.min(DISPUTE_COUNT, trades.length)}`)
}

main().catch((err) => {
  console.error('Pressure test failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
