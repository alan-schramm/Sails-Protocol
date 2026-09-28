/**
 * app.ts's real startServer() — proves the production boot path starts the settlement / M9-R C4 recovery
 * schedule, follows the same on-by-default policy outside production, honours the explicit opt-out, and
 * stops the schedule on graceful shutdown. startServer() is the only place the recovery tick is started
 * (buildApp() never schedules anything), so it is booted for real here: real buildApp(), real config
 * gates, a real listen() on an ephemeral port. Only external connections (Postgres, Redis, P2P, wallet
 * SDKs) and the schedule module itself are replaced, so the assertion is about wiring, not about what a
 * tick does (tests/settlementRecoverySchedule.test.ts and the real-PostgreSQL integration tests cover that).
 */
jest.mock('dotenv/config', () => ({}))

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: {
    emit: jest.fn().mockResolvedValue(undefined), on: jest.fn(), onDurable: jest.fn(),
    enableCrossInstanceFanout: jest.fn(), disableCrossInstanceFanout: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('../src/infrastructure/p2p/pear.service', () => ({
  pearNodeRegistry: { start: jest.fn(), stop: jest.fn(), get: jest.fn(), getStatus: jest.fn() },
}))
jest.mock('@tetherto/wdk-wallet-evm', () => ({ __esModule: true, default: class FakeWalletManagerEvm {} }))
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

const PROD_ENV = {
  NODE_ENV: 'production',
  MOCK_ESCROW: 'false',
  MOCK_SETTLEMENT: 'false',
  ENFORCE_CAPABILITIES: 'true',
  DATABASE_URL: 'postgresql://real-host/sails_protocol',
  REDIS_URL: 'redis://real-host:6379',
  MULTISIG_NETWORK: 'testnet',
  EVIDENCE_PROVIDER: 's3',
  EVIDENCE_S3_BUCKET: 'real-evidence-bucket',
  EVIDENCE_S3_ACCESS_KEY_ID: 'real-access-key',
  EVIDENCE_S3_SECRET_ACCESS_KEY: 'real-secret-key',
}

describe('startServer() — settlement / C4 recovery wiring', () => {
  jest.setTimeout(60_000)
  const ORIGINAL_ENV = process.env
  let exitSpy: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  })
  afterEach(() => {
    process.removeAllListeners('SIGTERM')
    process.removeAllListeners('SIGINT')
    exitSpy.mockRestore()
    process.env = ORIGINAL_ENV
  })

  async function boot(env: Record<string, string | undefined>) {
    process.env = { PORT: '0', HOST: '127.0.0.1' }
    for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v
    const stop = jest.fn()
    const startSettlementRecoverySchedule = jest.fn(() => ({ stop }))
    jest.doMock('../src/modules/open-settlement/settlement-recovery-schedule', () => ({ startSettlementRecoverySchedule }))
    const prisma = { $queryRaw: jest.fn(), $disconnect: jest.fn().mockResolvedValue(undefined) }
    const redis = { ping: jest.fn(), quit: jest.fn().mockResolvedValue('OK') }
    jest.doMock('../src/common/database', () => ({ prisma, connectDatabase: jest.fn().mockResolvedValue(undefined) }))
    jest.doMock('../src/common/redis', () => ({ redis, connectRedis: jest.fn().mockResolvedValue(undefined) }))
    const { config } = require('../src/config')
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined) // boot banner
    try {
      await require('../src/app').startServer()
    } finally {
      logSpy.mockRestore()
    }
    return { config, startSettlementRecoverySchedule, stop, prisma, redis }
  }

  async function shutdown(): Promise<void> {
    process.emit('SIGTERM' as any)
    for (let i = 0; i < 200 && exitSpy.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10))
    expect(exitSpy).toHaveBeenCalledWith(0)
  }

  // Each boot is a full cold require of the app graph, so this file keeps to the three genuinely distinct
  // boots (production, non-production, opted out); the default interval value is covered by
  // tests/configProductionGates.test.ts.
  it('PRODUCTION: startup schedules the recovery tick once, at the configured interval, with the app logger; SIGTERM stops it before closing the server and disconnecting Postgres/Redis', async () => {
    const { config, startSettlementRecoverySchedule, stop, prisma, redis } = await boot({ ...PROD_ENV, ESCROW_SETTLEMENT_RECONCILE_INTERVAL_MS: '15000' })
    try {
      expect(config.isProduction).toBe(true)
      expect(startSettlementRecoverySchedule).toHaveBeenCalledTimes(1)
      const [log, intervalMs] = (startSettlementRecoverySchedule.mock.calls[0] as unknown) as [any, number]
      expect(intervalMs).toBe(15000)
      expect(typeof log.warn).toBe('function')
      expect(typeof log.error).toBe('function')
      expect(stop).not.toHaveBeenCalled()
    } finally {
      await shutdown()
    }
    expect(stop).toHaveBeenCalledTimes(1)
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(prisma.$disconnect.mock.invocationCallOrder[0])
    expect(redis.quit).toHaveBeenCalled()
  })

  it('NON-PRODUCTION: the same on-by-default policy applies (the flag is not production-only)', async () => {
    const { config, startSettlementRecoverySchedule } = await boot({ NODE_ENV: 'development' })
    try {
      expect(config.isProduction).toBe(false)
      expect(startSettlementRecoverySchedule).toHaveBeenCalledTimes(1)
    } finally {
      await shutdown()
    }
  })

  it('ESCROW_SETTLEMENT_RECONCILER=false is the only way to not schedule it', async () => {
    const { startSettlementRecoverySchedule } = await boot({ ...PROD_ENV, ESCROW_SETTLEMENT_RECONCILER: 'false' })
    try {
      expect(startSettlementRecoverySchedule).not.toHaveBeenCalled()
    } finally {
      await shutdown()
    }
  })
})
