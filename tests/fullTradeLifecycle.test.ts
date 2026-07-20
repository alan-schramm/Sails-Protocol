/**
 * Full trade lifecycle — end-to-end wiring validation (CTO-role follow-up
 * after RFC-018's validation pass: "validar o fluxo completo end-to-end
 * do Sails P2P Trading SDK com persistência real e integração dos
 * providers").
 *
 * What "persistência real" and "integração dos providers" cannot mean in
 * this sandboxed environment: there is no reachable Postgres/Docker
 * (confirmed earlier this same pass — same limitation TODO.md/RFC-018/
 * RFC-019 already document for Redis and live WDK/HyperDHT calls) and no
 * live WDK testnet or HyperDHT network. That validation is out of reach
 * here and stays the sócio dev's infra-pass job.
 *
 * What IS achievable, and the strongest substitute available without
 * live infra: every OTHER test file in this suite mocks at a single
 * service boundary (routes.test.ts mocks Prisma but stubs eventBus.emit
 * to a no-op so cross-module reactions never fire; reputationOutcome.test.ts
 * mocks intentEngine wholesale; settlementOrchestrator.test.ts mocks
 * escrowService entirely). None of them chains the REAL service layer
 * across every module in one continuous flow with the REAL event bus
 * actually dispatching to the REAL handlers.ts reactions. This file does:
 * only the database (an in-memory fake standing in for Prisma) and the
 * two genuinely-external providers (WDK/HyperDHT) are replaced — every
 * service singleton, the real eventBus (InMemoryEventStore, RFC-010's
 * always-available default — no Redis needed), and registerEventHandlers()
 * are the actual production code. This is exactly the kind of gap that
 * caught the Trade.escrowId bug fixed earlier this pass (a unit test
 * mocking dispute.service.ts's own database calls directly would never
 * have caught that createEscrow() never wrote the FK another module
 * needed — only a chain that runs escrow creation for real and then
 * asserts what raiseDispute() sees would).
 */
export {} // same reasoning as chatUnification.test.ts/reputationOutcome.test.ts's
// identical comment — forces this file to be a module so top-level consts
// don't leak into the global scope and collide with another test file's.

// ─── In-memory Prisma fake ─────────────────────────────────────────────────
// Every mutating call in the real chain (offer -> intent -> trade -> escrow
// -> dispute -> user) round-trips through these tables instead of a mocked
// return-value queue, so state a later step reads (e.g. dispute.service.ts's
// `if (!trade.escrowId)` guard) reflects what an EARLIER step's handler
// actually wrote — the exact property a per-call mock can't verify.
function makeTable(idPrefix: string, defaults: Record<string, unknown> = {}) {
  const rows = new Map<string, any>()
  let seq = 0
  return {
    rows,
    create: jest.fn(async ({ data }: any) => {
      const id = data.id ?? `${idPrefix}-${++seq}`
      const row = { id, createdAt: new Date(), updatedAt: new Date(), ...defaults, ...data }
      rows.set(id, row)
      return { ...row }
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const row = typeof where.id === 'string'
        ? rows.get(where.id)
        : [...rows.values()].find((r) => Object.entries(where).every(([k, v]) => r[k] === v))
      return row ? { ...row } : null
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.get(where.id)
      if (!row) throw new Error(`${idPrefix}: row ${where.id} not found`)
      const merged = { ...row }
      for (const [k, v] of Object.entries(data)) {
        merged[k] = v && typeof v === 'object' && 'increment' in (v as any)
          ? (merged[k] ?? 0) + (v as any).increment
          : v
      }
      merged.updatedAt = new Date()
      rows.set(where.id, merged)
      return { ...merged }
    }),
    findMany: jest.fn(async ({ where = {} }: any = {}) => {
      return [...rows.values()]
        .filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))
        .map((r) => ({ ...r }))
    }),
    findFirst: jest.fn(async ({ where = {} }: any = {}) => {
      const row = [...rows.values()].find((r) => Object.entries(where).every(([k, v]) => r[k] === v))
      return row ? { ...row } : null
    }),
  }
}

const users = makeTable('user', { reputationScore: 0, totalTrades: 0, totalVolumeBtc: '0' })
const offers = makeTable('offer', { status: 'ACTIVE' })
// InternalOrderBook.getOffers() (liquidity.service.ts) always queries with
// `include: { user: { select: { reputationScore: true } } }` and
// mapOfferToLiquidityOffer() reads offer.user.reputationScore directly —
// the generic findMany above doesn't know about Prisma's `include`, so
// this nests the real (in-memory) user row onto each returned offer, the
// one place this flow needs it.
const originalOffersFindMany = offers.findMany
offers.findMany = jest.fn(async (args: any) => {
  const rows = await originalOffersFindMany(args)
  return rows.map((r: any) => ({ ...r, user: { reputationScore: users.rows.get(r.userId)?.reputationScore ?? 0 } }))
})
const trades = makeTable('trade', { status: 'PENDING', escrowId: null })
const escrows = makeTable('escrow', { status: 'CREATED' })
const escrowEvents = makeTable('escrowEvent')
const disputes = makeTable('dispute', { status: 'OPENED' })
const intents = makeTable('intent', { expiresAt: null })

// intentEvent's hash-chain (writeIntentEvent(), core/intent-engine.ts) needs
// findFirst ordered by createdAt desc, not just any match — the generic
// findFirst above returns array-scan order, which happens to be insertion
// order here (fine for prevHash chaining, but overridden explicitly for
// clarity since correctness here matters more than the generic helper).
const intentEventRows: any[] = []
let intentEventSeq = 0
const intentEvents = {
  create: jest.fn(async ({ data }: any) => {
    const row = { id: `intentEvent-${++intentEventSeq}`, createdAt: new Date(), ...data }
    intentEventRows.push(row)
    return { ...row }
  }),
  findFirst: jest.fn(async ({ where }: any) => {
    const matches = intentEventRows.filter((r) => r.intentId === where.intentId)
    return matches.length ? matches[matches.length - 1] : null
  }),
}

jest.mock('../src/common/database', () => ({
  prisma: {
    user: users,
    offer: offers,
    trade: trades,
    escrow: escrows,
    escrowEvent: escrowEvents,
    dispute: disputes,
    intent: intents,
    intentEvent: intentEvents,
  },
}))

// Same ESM-only-package problem every other test file mocking this import
// chain already documents (reputationOutcome.test.ts's identical comment):
// @tetherto/wdk-wallet-evm ships pure ESM, no CJS build. Never actually
// reached here regardless — config.features.mockEscrow defaults true
// (RT-001, config/index.ts), so escrow.service.ts's getProvider() always
// returns MockSettlementProvider no matter what EscrowType is requested.
jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

// pear.service.ts's real HyperDHT/Hyperswarm classes need a live P2P
// network to do anything real — not exercised here (negotiation.service.ts's
// open() only touches Prisma/eventBus; HumanChatChannel.sendEvent(), the
// method that actually needs pearNodeRegistry, is never called by this
// flow), stubbed out same as routes.test.ts/reputationOutcome.test.ts.
jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: {
    get: jest.fn().mockReturnValue(undefined),
    start: jest.fn().mockResolvedValue('fake-peer-id'),
    stop: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../src/modules/open-p2p/reconciliation.service', () => ({
  reconciliationService: { reconcilePeerPair: jest.fn().mockResolvedValue([]) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { liquidityRouter } = require('../src/modules/open-liquidity/liquidity.service')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tradeService } = require('../src/modules/open-p2p/trade.service')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { escrowService } = require('../src/modules/open-settlement/escrow.service')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeSettlement } = require('../src/modules/open-settlement/settlement-orchestrator')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DisputeService } = require('../src/modules/open-settlement/dispute.service')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TrustedArbitratorProvider } = require('../src/modules/open-settlement/arbitration-provider')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerEventHandlers } = require('../src/common/events/handlers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { eventBus } = require('../src/common/events/event-bus')

// The real eventBus (InMemoryEventStore, RFC-010's always-available
// default) — genuinely dispatches to registerEventHandlers()'s real
// listeners synchronously within emit()'s call, but a listener's own
// internal awaits resolve on later microtask ticks it doesn't block
// emit() on (Node's EventEmitter is fire-and-forget for async listeners —
// a real characteristic of this architecture, not something introduced
// by this test). flush() drains the microtask queue via a macrotask
// boundary so assertions after a mutating call see the reaction's
// completed effect, not a half-finished one.
const flush = () => new Promise((resolve) => setImmediate(resolve))

function seedUsers() {
  users.rows.clear()
  users.rows.set('buyer-1', { id: 'buyer-1', reputationScore: 0, totalTrades: 0, totalVolumeBtc: '0' })
  users.rows.set('seller-1', { id: 'seller-1', reputationScore: 0, totalTrades: 0, totalVolumeBtc: '0' })
}

beforeAll(() => {
  registerEventHandlers()
})

beforeEach(() => {
  jest.clearAllMocks()
  ;[users, offers, trades, escrows, escrowEvents, disputes, intents].forEach((t) => t.rows.clear())
  intentEventRows.length = 0
  seedUsers()
})

describe('Full trade lifecycle — Intent born -> Offer -> discovery -> Trade -> escrow -> settlement -> reputation', () => {
  it('walks a real happy-path trade through every real service, end to end', async () => {
    // 1-2. Wallet A (seller) creates an Intent + publishes an Offer.
    const offer = await liquidityRouter.createOffer({
      userId: 'seller-1',
      asset: 'USDT_ERC20',
      side: 'SELL',
      priceUsd: '1.00',
      minAmount: '10',
      maxAmount: '100',
      paymentMethod: 'PIX',
    })
    expect(offer.intentId).toBeTruthy()
    expect(intents.rows.get(offer.intentId)?.status).toBe('COORDINATED')

    // 3. Wallet B (buyer) discovers it — the real order-book aggregation,
    // not a hand-picked fixture. getAggregatedOffers(asset, side) filters
    // by the offer's OWN side (InternalOrderBook.getOffers()) — a SELL
    // offer is an "ask", found by querying the SELL side, same as
    // getOrderBook()'s own bids/asks split.
    const { offers: discovered } = await liquidityRouter.getAggregatedOffers('USDT_ERC20', 'SELL')
    expect(discovered.map((o: any) => o.id)).toContain(offer.id)

    // 4-5. Trade is born from the discovered Offer — walks the Intent
    // DISCOVERING -> MATCHED -> NEGOTIATING (trade.service.ts) and opens
    // the negotiation channel (negotiation.service.ts).
    const trade = await tradeService.createTrade({
      offerId: offer.id,
      counterpartyId: 'buyer-1',
      amount: '20',
    })
    expect(trade.intentId).toBe(offer.intentId)
    expect(intents.rows.get(offer.intentId)?.status).toBe('NEGOTIATING')

    // 6-8. Escrow locks, (emulated) PIX payment happens, settlement
    // finalizes — the real orchestrator, the same function
    // common/events/handlers.ts wires to openp2p.trade.created when
    // AUTO_SETTLE_ON_MATCH=true, called directly here exactly like the
    // demo script and settlement.routes.ts's own callers do.
    const result = await executeSettlement({
      tradeId: trade.id,
      buyerReceivingAddress: '0xBuyerTestnetAddress',
    })
    await flush()

    // The bug fixed earlier this pass: Trade.escrowId must actually be
    // the escrow createEscrow() just made — this is the FK
    // dispute.service.ts's raiseDispute() depends on, and until today's
    // fix nothing in the real flow ever wrote it.
    expect(trades.rows.get(trade.id)?.escrowId).toBe(result.escrowId)
    expect(escrows.rows.get(result.escrowId)?.status).toBe('COMPLETED')
    expect(trades.rows.get(trade.id)?.status).toBe('COMPLETED')

    // 9. Reputation updates — both parties credited, no dispute in this
    // path (RFC-007 D8/D9).
    expect(users.rows.get('buyer-1')?.reputationScore).toBe(2)
    expect(users.rows.get('seller-1')?.reputationScore).toBe(2)
    expect(users.rows.get('buyer-1')?.totalTrades).toBe(1)
    expect(users.rows.get('seller-1')?.totalTrades).toBe(1)

    // The Intent this whole chain started from reached its own real
    // terminal state — not left behind by any of the 4 modules it passed
    // through (RFC-018's entire point).
    expect(intents.rows.get(offer.intentId)?.status).toBe('FULFILLED')
  })

  it('a dispute raised after escrow locks resolves through the real chain — proves the Trade.escrowId fix end to end', async () => {
    const offer = await liquidityRouter.createOffer({
      userId: 'seller-1',
      asset: 'USDT_ERC20',
      side: 'SELL',
      priceUsd: '1.00',
      minAmount: '10',
      maxAmount: '100',
      paymentMethod: 'PIX',
    })
    const trade = await tradeService.createTrade({
      offerId: offer.id,
      counterpartyId: 'buyer-1',
      amount: '20',
    })

    const escrow = await escrowService.createEscrow({
      tradeId: trade.id,
      lockedAmount: '20',
      asset: 'USDT_ERC20',
    })
    await flush()
    // Before today's fix this would still be null against a real database
    // — nothing ever wrote it. Asserted explicitly here, not just implied
    // by the raiseDispute() call below succeeding.
    expect(trades.rows.get(trade.id)?.escrowId).toBe(escrow.id)

    await escrowService.lockFunds(escrow.id, 'seller-1')
    await flush()
    expect(intents.rows.get(offer.intentId)?.status).toBe('COMMITTED')

    const disputeService = new DisputeService(new TrustedArbitratorProvider(['arbiter-1']))
    const dispute = await disputeService.raiseDispute(trade.id, 'buyer-1', 'PIX payment never arrived')
    expect(dispute.arbiterId).toBe('arbiter-1')
    expect(escrows.rows.get(escrow.id)?.status).toBe('DISPUTED')

    const resolved = await disputeService.resolveDispute(dispute.id, 'arbiter-1', 'REFUND')
    await flush()

    expect(resolved.status).toBe('RESOLVED')
    expect(escrows.rows.get(escrow.id)?.status).toBe('REFUNDED')
    expect(trades.rows.get(trade.id)?.status).toBe('CANCELLED')
    expect(intents.rows.get(offer.intentId)?.status).toBe('FAILED')

    // RFC-007 D9 — a REFUND ruling means the seller won, the buyer lost.
    expect(users.rows.get('seller-1')?.reputationScore).toBe(2)
    expect(users.rows.get('buyer-1')?.reputationScore).toBe(-5)
  })
})

// Security-validation round (2026-07-19, "replay de evento / idempotência"
// scenario): InMemoryEventStore (event-store.ts, RFC-010's always-available
// default) is a plain EventEmitter — it never redelivers an event on its
// own, so neither of the two behaviors below is reachable through any real
// code path in this reference implementation TODAY. They matter because
// RFC-010 already anticipates swapping in a durable backend
// (RedisStreamsEventStore, still unbuilt per BACKLOG.md), and durable
// queues commonly redeliver on at-least-once semantics — these tests put
// that future requirement under pressure now, before it's built, rather
// than discovering it live.
describe('Event replay / idempotency stress test — not reachable today, a real requirement before any durable EventStore ships', () => {
  // registerEventHandlers() already ran once in this file's top-level
  // beforeAll (above) — eventBus is a module-level singleton shared by
  // every describe block in this file, so calling it again here would
  // double-register every listener (EventEmitter.on() has no dedup),
  // making a single emit() fire each reaction twice on its own — a test
  // bug that would fake the exact "double-count" this block exists to
  // isolate for real, found the hard way while writing this test.

  beforeEach(() => {
    jest.clearAllMocks()
    ;[users, offers, trades, escrows, escrowEvents, disputes, intents].forEach((t) => t.rows.clear())
    intentEventRows.length = 0
    seedUsers()
  })

  it('GOOD: a duplicate settlement.escrow.locked is naturally rejected by the Intent state machine — COMMITTED is not re-enterable', async () => {
    const offer = await liquidityRouter.createOffer({
      userId: 'seller-1', asset: 'USDT_ERC20', side: 'SELL', priceUsd: '1.00', minAmount: '10', maxAmount: '100', paymentMethod: 'PIX',
    })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: 'buyer-1', amount: '20' })
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, lockedAmount: '20', asset: 'USDT_ERC20' })
    await escrowService.lockFunds(escrow.id, 'seller-1')
    await flush()
    expect(intents.rows.get(offer.intentId)?.status).toBe('COMMITTED')

    // Redeliver the exact same event a second time — simulates a durable
    // queue's at-least-once retry, not something this test fabricates
    // beyond what actually flows through escrow.service.ts's transition().
    await eventBus.emit('settlement.escrow.locked', {
      escrowId: escrow.id, tradeId: trade.id, from: 'CREATED', to: 'FUNDS_LOCKED', triggeredBy: 'seller-1',
    }, trade.id)
    await flush()

    // core/state-machine.ts's VALID_TRANSITIONS has no COMMITTED -> COMMITTED
    // entry — intent-engine.ts's transition() throws, event-store.ts's
    // subscribe() catches and logs it (console.error, expected in this
    // test's output), and the Intent is left exactly where it was.
    // Protected by construction, not by anything built for this test.
    expect(intents.rows.get(offer.intentId)?.status).toBe('COMMITTED')
  })

  it('BAD (known, tracked gap — not fixed here): a duplicate settlement.escrow.released double-counts reputation', async () => {
    const offer = await liquidityRouter.createOffer({
      userId: 'seller-1', asset: 'USDT_ERC20', side: 'SELL', priceUsd: '1.00', minAmount: '10', maxAmount: '100', paymentMethod: 'PIX',
    })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: 'buyer-1', amount: '20' })
    const result = await executeSettlement({ tradeId: trade.id, buyerReceivingAddress: '0xBuyerTestnetAddress' })
    await flush()
    expect(users.rows.get('buyer-1')?.reputationScore).toBe(2)
    expect(users.rows.get('seller-1')?.reputationScore).toBe(2)

    // Redeliver settlement.escrow.released — unlike the Intent side above,
    // nothing here checks "have I already recorded this outcome."
    // reputation.service.ts's recordOutcome() is a bare increment with no
    // idempotency key (no eventId tracked, no "already applied" guard).
    await eventBus.emit('settlement.escrow.released', {
      escrowId: result.escrowId, tradeId: trade.id, from: 'PAYMENT_PENDING', to: 'COMPLETED', triggeredBy: 'seller-1',
    }, trade.id)
    await flush()

    // This IS the bug the "replay de evento" scenario predicted — asserted
    // here deliberately, as documentation of a real, currently-unreachable
    // risk (docs/BACKLOG.md), not as an accepted outcome. Before any
    // durable, redelivering EventStore ships, recordOutcome()'s callers
    // need an idempotency key (eventId) check first.
    expect(users.rows.get('buyer-1')?.reputationScore).toBe(4)
    expect(users.rows.get('seller-1')?.reputationScore).toBe(4)
  })
})
