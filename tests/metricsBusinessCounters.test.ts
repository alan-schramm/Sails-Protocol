/**
 * Business counters — CTO_DUE_DILIGENCE_REPORT.md B-OPS-01, closed
 * 2026-08-08. metrics.ts's own comment explains why these exist beyond
 * generic HTTP metrics ("trades/segundo, escrows ativos" — the report's
 * own example). Deliberately does NOT mock ../src/common/events/event-bus
 * (unlike every other test file in this repo) — the point here is that
 * the real handlers.ts reactions actually run and increment the counter,
 * not that a mocked .on() was called with the right arguments.
 */
export {} // same reasoning as fullTradeLifecycle.test.ts/chatUnification.test.ts's
// identical comment — forces this file to be a module so its top-level
// consts (mockDurableEventRecordDelegate, mockTransaction, added in
// Missão 05.8) don't leak into the shared global scope and collide with
// another test file's identically-named ones.
const mockDurableEventRecordDelegate = {
  findFirst: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation(async ({ data }: any) => data),
  findMany: jest.fn().mockResolvedValue([]),
}
// PostgresEventStore.publish() (Missão 05.8) wraps its write in a real
// Postgres transaction (pg_advisory_xact_lock-serialized per
// correlationId) — a trivial passthrough is enough here since this file
// doesn't test concurrency.
const mockTransaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
  callback({ durableEventRecord: mockDurableEventRecordDelegate, $executeRaw: jest.fn().mockResolvedValue(0) })
)

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { update: jest.fn().mockResolvedValue({ id: 'trade-1', intentId: null, buyerId: 'buyer-1', sellerId: 'seller-1' }) },
    // eventBus's default store is PostgresEventStore as of Missão 05.7 —
    // eventBus.emit() below now writes through here too, not just the
    // handlers.ts reactions this file's own header comment describes.
    durableEventRecord: mockDurableEventRecordDelegate,
    $transaction: (...args: unknown[]) => mockTransaction(...(args as [any])),
  },
}))

jest.mock('../src/common/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) },
}))

jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: { start: jest.fn(), stop: jest.fn(), get: jest.fn(), getStatus: jest.fn() },
}))

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

describe('Business counters (real event bus + real handlers.ts reactions)', () => {
  it('increments sails_escrows_created_total when settlement.escrow.created fires', async () => {
    const { eventBus } = require('../src/common/events/event-bus')
    const { registerEventHandlers } = require('../src/common/events/handlers')
    const { metricsRegistry } = require('../src/common/metrics')
    registerEventHandlers()

    await eventBus.emit('settlement.escrow.created', {
      escrowId: 'escrow-1',
      tradeId: 'trade-1',
      type: 'MULTISIG',
      lockedAmount: '0.01',
      asset: 'BTC',
    }, 'trade-1')

    const metric = await metricsRegistry.getSingleMetricAsString('sails_escrows_created_total')
    expect(metric).toMatch(/sails_escrows_created_total 1/)
  })

  it('increments sails_disputes_opened_total when dispute.opened fires', async () => {
    const { eventBus } = require('../src/common/events/event-bus')
    const { metricsRegistry } = require('../src/common/metrics')
    // registerEventHandlers() already called once per module instance in
    // the test above — this file's handlers/event-bus/metrics singletons
    // are shared across both `it`s (no jest.resetModules() between them),
    // matching how registerEventHandlers() is really only ever called
    // once per process in src/app.ts.

    await eventBus.emit('dispute.opened', {
      disputeId: 'dispute-1',
      settlementId: 'escrow-1',
      triggeredBy: 'user-1',
      tradeId: 'trade-1',
      arbiterId: 'arbiter-1',
      reason: 'test',
    }, 'trade-1')

    const metric = await metricsRegistry.getSingleMetricAsString('sails_disputes_opened_total')
    expect(metric).toMatch(/sails_disputes_opened_total 1/)
  })
})
