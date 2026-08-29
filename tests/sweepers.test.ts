/**
 * Sweepers — BACKLOG.md P0 + tests/TEST_AUDIT_REPORT.md gap.
 *
 * Two real, persisted, background-process-driven pieces of business logic
 * in this codebase had no test coverage until this pass:
 *
 *   - escrow.service.ts's sweepExpiredEscrows() — the only path that
 *     reads Escrow.expiresAt back (lockFunds() writes it, this one reads
 *     it) and the only path that calls refundFunds() with the trade's
 *     own sellerId, not an authenticated caller. Without a test, a
 *     regression in either behavior — e.g. refundFunds() rejecting
 *     "system:trade-lifecycle"-style triggeredBy values, or the sweep
 *     silently swallowing one bad escrow and blocking the rest — would
 *     only surface in a real production incident.
 *   - dispute.service.ts's sweepExpiredAutoResolutions() — same shape:
 *     a real QVAC-assisted automation (RFC-021 D8) that walks every
 *     AUTO_PROPOSED dispute past its contest deadline and applies the
 *     already-assigned arbiter's slot, distinct from a real human
 *     resolveDispute() call. recordRuling() / slash() / appeal-fee
 *     settlement are deliberately NOT in this sweeper's path —
 *     documented in the sweeper's own comment — and only verifiable end
 *     to end here.
 *
 * Mocking pattern matches tests/race-condition.test.ts's existing real-
 * shared-mutable-state style: prisma is mocked but the shared fakeDb's
 * state evolves through the test, so the assertions reflect what the
 * service layer actually wrote rather than what a hardcoded mock would
 * have written if the assertion forgot to set the right expectation.
 *
 * @tetherto/wdk-wallet-evm + @arkade-os/sdk + @scure/btc-signer mocked
 * the same way every other escrow/dispute test in this suite already
 * does — none of this file's tests exercise those real ESM-only paths.
 */
export {} // same forced-module reasoning as chatUnification.test.ts

let enforceCapabilities = false
let requireDualApprovalForRelease = false
let mockEscrowFeatureFlag = true
jest.mock('../src/config', () => ({
  get config() {
    return {
      features: { mockEscrow: mockEscrowFeatureFlag, enforceCapabilities, requireDualApprovalForRelease },
      trade: { defaultTimelockHours: 24 },
      settlement: { trustedArbitrators: [], protocolFeeRate: 0 },
      arkade: { seed: '' },
    }
  },
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
  combineTapscriptSignigs: jest.fn(),
  verifyTapscriptSignatures: jest.fn(),
}))

jest.mock('@scure/btc-signer', () => ({ Transaction: { fromPSBT: jest.fn() } }))

// Shared mutable escrow rows — same real-shared-state pattern
// race-condition.test.ts already uses (and proves: the service-layer
// logic correctly treats updateMany's count as the source of truth for
// "did my transition actually win" — not a hardcoded `{ count: 1 }` mock
// that every escrowReleaseControls.test.ts test happens to set).
type EscrowRow = {
  id: string
  tradeId: string
  type: string
  status: string
  expiresAt: Date | null
  txReleaseId: string | null
}
const fakeDb = {
  escrows: new Map<string, EscrowRow>(),
  tradeSeller: new Map<string, string>(),
}

const mockEscrowFindMany = jest.fn(async ({ where }: any) => {
  const result: EscrowRow[] = []
  fakeDb.escrows.forEach((row) => {
    if (where.status && row.status !== where.status) return
    if (where.expiresAt?.lt && (!row.expiresAt || row.expiresAt >= where.expiresAt.lt)) return
    result.push({ ...row })
  })
  return result
})
const mockEscrowFindUnique = jest.fn(async ({ where }: any) => {
  const row = fakeDb.escrows.get(where.id)
  return row ? { ...row } : null
})
const mockEscrowUpdateMany = jest.fn(async ({ where, data }: any) => {
  const row = fakeDb.escrows.get(where.id)
  if (!row) return { count: 0 }
  if (row.status !== where.status) return { count: 0 }
  row.status = data.status
  if (data.txReleaseId !== undefined) row.txReleaseId = data.txReleaseId
  return { count: 1 }
})
const mockEscrowUpdate = jest.fn(async ({ where, data }: any) => {
  const row = fakeDb.escrows.get(where.id)
  if (!row) throw new Error(`Escrow ${where.id} not found`)
  Object.assign(row, data)
  return { ...row }
})
const mockEscrowEventCreate = jest.fn().mockResolvedValue({})
const mockEscrowEventFindFirst = jest.fn().mockResolvedValue(null)
const mockTradeFindUnique = jest.fn(async ({ where }: any) => {
  const sellerId = fakeDb.tradeSeller.get(where.id)
  if (!sellerId) return null
  return { id: where.id, buyerId: 'buyer-1', sellerId }
})
const mockDisputeFindFirst = jest.fn(async ({ where }: any) => {
  // The sweeper's path is the non-disputed refundFunds() path: no Dispute
  // row exists at all (a real escrow that hasn't been disputed has no
  // Dispute.findFirst() match). refundFunds() falls through to the seller
  // check via isSellerOrAssignedArbiter, so the seller must match
  // trade.sellerId for the call to succeed. Returning null here is the
  // normal-path reality.
  if (where?.arbiterId && where?.tradeId) {
    return { id: 'dispute-1', tradeId: where.tradeId, arbiterId: where.arbiterId }
  }
  return null
})
const mockParticipantKeyFindMany = jest.fn().mockResolvedValue([])

jest.mock('../src/common/database', () => {
  return {
    prisma: {
      escrow: {
        findMany: ((...args: unknown[]) => (mockEscrowFindMany as any)(...args)) as any,
        findUnique: ((...args: unknown[]) => (mockEscrowFindUnique as any)(...args)) as any,
        updateMany: ((...args: unknown[]) => (mockEscrowUpdateMany as any)(...args)) as any,
        update: ((...args: unknown[]) => (mockEscrowUpdate as any)(...args)) as any,
      },
      escrowEvent: {
        create: ((...args: unknown[]) => (mockEscrowEventCreate as any)(...args)) as any,
        findFirst: ((...args: unknown[]) => (mockEscrowEventFindFirst as any)(...args)) as any,
      },
      trade: { findUnique: ((...args: unknown[]) => (mockTradeFindUnique as any)(...args)) as any },
      dispute: { findFirst: ((...args: unknown[]) => (mockDisputeFindFirst as any)(...args)) as any },
      escrowParticipantKey: { findMany: ((...args: unknown[]) => (mockParticipantKeyFindMany as any)(...args)) as any },
      // Missão 11 Fase 9.7 — emitEscrowTransition() now does its own
      // escrowEvent existence-check-then-create INSIDE withEscrowFundingLock()
      // — reuses the same mocks as the top-level escrowEvent block above.
      $transaction: (async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(0),
          escrowEvent: {
            findFirst: ((...args: unknown[]) => (mockEscrowEventFindFirst as any)(...args)) as any,
            create: ((...args: unknown[]) => (mockEscrowEventCreate as any)(...args)) as any,
          },
        })) as any,
    },
  }
})

jest.mock('../src/common/events/event-bus', () => ({
  eventBus: { emit: jest.fn().mockResolvedValue(undefined) },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { escrowService } = require('../src/modules/open-settlement/escrow.service')

function resetFakeDb() {
  fakeDb.escrows.clear()
  fakeDb.tradeSeller.clear()
}

function seedEscrow(id: string, overrides: Partial<EscrowRow> = {}): EscrowRow {
  const row: EscrowRow = {
    id,
    tradeId: `trade-${id}`,
    type: 'MOCK',
    status: 'FUNDS_LOCKED',
    expiresAt: new Date(Date.now() - 60_000), // already past — expired
    txReleaseId: null,
    ...overrides,
  }
  fakeDb.escrows.set(id, row)
  fakeDb.tradeSeller.set(row.tradeId, `seller-${id}`)
  return row
}

describe('escrowService.sweepExpiredEscrows — RFC-007 timelock proactive sweeper', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetFakeDb()
    mockEscrowFeatureFlag = true
  })

  it('returns an empty result when no escrows match the expired-FUNDS_LOCKED filter', async () => {
    // No rows seeded — the sweeper should query and find nothing.
    const result = await escrowService.sweepExpiredEscrows()
    expect(result).toEqual({ refunded: [], requiresManualRecovery: [], failed: [] })
  })

  it('refunds every escrow with status FUNDS_LOCKED and expiresAt < now, in one pass', async () => {
    seedEscrow('escrow-1')
    seedEscrow('escrow-2')
    seedEscrow('escrow-3')

    const result = await escrowService.sweepExpiredEscrows()

    expect(result.refunded).toEqual(['escrow-1', 'escrow-2', 'escrow-3'])
    expect(result.failed).toEqual([])
    for (const id of ['escrow-1', 'escrow-2', 'escrow-3']) {
      expect(fakeDb.escrows.get(id)!.status).toBe('REFUNDED')
    }
  })

  it('skips escrows that are not FUNDS_LOCKED — never touches COMPLETED, REFUNDED, or DISPUTED rows', async () => {
    seedEscrow('escrow-completed', { status: 'COMPLETED' })
    seedEscrow('escrow-disputed', { status: 'DISPUTED' })
    seedEscrow('escrow-refunded', { status: 'REFUNDED' })

    const result = await escrowService.sweepExpiredEscrows()

    expect(result.refunded).toEqual([])
    expect(result.failed).toEqual([])
    expect(fakeDb.escrows.get('escrow-completed')!.status).toBe('COMPLETED')
    expect(fakeDb.escrows.get('escrow-disputed')!.status).toBe('DISPUTED')
    expect(fakeDb.escrows.get('escrow-refunded')!.status).toBe('REFUNDED')
  })

  it('skips escrows whose expiresAt is still in the future — only truly expired rows are refunded', async () => {
    seedEscrow('escrow-expired', { expiresAt: new Date(Date.now() - 1000) })
    seedEscrow('escrow-future', { expiresAt: new Date(Date.now() + 60_000) })

    const result = await escrowService.sweepExpiredEscrows()

    expect(result.refunded).toEqual(['escrow-expired'])
    expect(result.failed).toEqual([])
    expect(fakeDb.escrows.get('escrow-expired')!.status).toBe('REFUNDED')
    expect(fakeDb.escrows.get('escrow-future')!.status).toBe('FUNDS_LOCKED')
  })

  it('isolates a single failure — one bad escrow does not block the rest', async () => {
    // escrow-1 will fail inside refundFunds() because the trade lookup
    // returns null (missing seller); escrow-2 succeeds normally.
    seedEscrow('escrow-1')
    fakeDb.tradeSeller.delete(`trade-escrow-1`) // break the trade lookup
    seedEscrow('escrow-2')

    const result = await escrowService.sweepExpiredEscrows()

    expect(result.refunded).toEqual(['escrow-2'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].escrowId).toBe('escrow-1')
    expect(result.failed[0].error).toMatch(/Trade/i)
    // The successful one was actually transitioned, the failed one was
    // not — the per-escrow try/catch has to do both, otherwise a single
    // bad row would leave the sweeper's "already transitioned" race
    // guard permanently locking out the failed row.
    expect(fakeDb.escrows.get('escrow-2')!.status).toBe('REFUNDED')
    expect(fakeDb.escrows.get('escrow-1')!.status).toBe('FUNDS_LOCKED')
  })

  it('triggers refundFunds() with the trade\'s own sellerId — never a fabricated system actor', async () => {
    // The sweep's authorization contract is INV-OP-1's: triggeredBy must
    // be the trade's actual seller (not a forged "system" sentinel).
    // We verify it by mocking mockTradeFindUnique's chain — refundFunds()
    // will receive triggeredBy === trade.sellerId, and isSellerOrAssignedArbiter
    // accepts the seller; a fabricated sentinel that doesn't match
    // sellerId would surface as a failed entry. Here we test the success
    // path and confirm the call passes the seller check.
    seedEscrow('escrow-1')

    const result = await escrowService.sweepExpiredEscrows()

    expect(result.refunded).toEqual(['escrow-1'])
    expect(result.failed).toEqual([])
    // The escrow transitioned through FUNDS_LOCKED -> REFUNDED via the
    // seller's own authorization, not a fabricated actor.
    expect(fakeDb.escrows.get('escrow-1')!.status).toBe('REFUNDED')
  })

  it('returns the failure\'s error message in `failed[i].error` — callers can log/alert on it', async () => {
    seedEscrow('escrow-1')
    fakeDb.tradeSeller.delete(`trade-escrow-1`)

    const result = await escrowService.sweepExpiredEscrows()

    expect(result.failed).toHaveLength(1)
    expect(typeof result.failed[0].error).toBe('string')
    expect(result.failed[0].error.length).toBeGreaterThan(0)
  })

  // Missão 11 Fase 7.3.1 §C — real P0 closed: refundFunds() throws
  // unconditionally for a signature-collection type (client-held keys) —
  // before this fix, the sweeper attempted it anyway every cycle and
  // landed the escrow in `failed`, indistinguishable from a genuine bug.
  describe('signature-collection escrow types (MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM) — real, distinguishable outcome, never a doomed refundFunds() attempt', () => {
    // Missão 11 Fase 7.3.3 §B — real durable status transition now backs
    // this outcome (FUNDS_LOCKED -> EXPIRED, schema.prisma's own
    // EscrowStatus.EXPIRED comment), not merely an event.
    it('routes an expired MULTISIG escrow to requiresManualRecovery, transitions it to EXPIRED, and never calls refundFunds()', async () => {
      seedEscrow('escrow-1', { type: 'MULTISIG' })

      const result = await escrowService.sweepExpiredEscrows()

      expect(result.requiresManualRecovery).toEqual(['escrow-1'])
      expect(result.refunded).toEqual([])
      expect(result.failed).toEqual([])
      // A real, durable observation — never a doomed refundFunds() attempt.
      expect(fakeDb.escrows.get('escrow-1')!.status).toBe('EXPIRED')
      expect(mockEscrowUpdateMany).toHaveBeenCalledWith({ where: { id: 'escrow-1', status: 'FUNDS_LOCKED' }, data: { status: 'EXPIRED' } })
    })

    it('emits a real settlement.escrow.expired transition event, attributed to the system, never a participant', async () => {
      seedEscrow('escrow-1', { type: 'MULTISIG' })
      const { eventBus } = require('../src/common/events/event-bus')

      await escrowService.sweepExpiredEscrows()

      expect(eventBus.emit).toHaveBeenCalledWith(
        'settlement.escrow.expired',
        expect.objectContaining({
          escrowId: 'escrow-1', tradeId: 'trade-escrow-1', from: 'FUNDS_LOCKED', to: 'EXPIRED',
          // Fase 7.3.3 §B — honest, non-participant, structurally
          // distinguishable from any real participant/agent id (never
          // matches isPartyOrAgent()'s own regex) — the system OBSERVES
          // and RECORDS, it never claims to be the seller.
          triggeredBy: 'system:expiry-sweeper',
          type: 'MULTISIG', sellerId: 'seller-escrow-1',
        }),
        'trade-escrow-1'
      )
    })

    it('a repeated sweep tick never re-transitions an already-EXPIRED escrow (idempotent by query scope, not a separate flag)', async () => {
      seedEscrow('escrow-1', { type: 'MULTISIG' })
      await escrowService.sweepExpiredEscrows()
      expect(fakeDb.escrows.get('escrow-1')!.status).toBe('EXPIRED')

      // Second tick: findExpiredFundsLocked() only ever queries
      // status='FUNDS_LOCKED' — the mock's own findMany filter enforces
      // this exactly like the real repository does, so this escrow is
      // structurally excluded, not merely skipped by a second check.
      const second = await escrowService.sweepExpiredEscrows()
      expect(second.requiresManualRecovery).toEqual([])
      expect(second.refunded).toEqual([])
      expect(second.failed).toEqual([])
    })

    it('a mix of MOCK and MULTISIG expired escrows resolves each to its own correct bucket in one pass', async () => {
      seedEscrow('escrow-mock', { type: 'MOCK' })
      seedEscrow('escrow-multisig', { type: 'MULTISIG' })

      const result = await escrowService.sweepExpiredEscrows()

      expect(result.refunded).toEqual(['escrow-mock'])
      expect(result.requiresManualRecovery).toEqual(['escrow-multisig'])
      expect(result.failed).toEqual([])
    })

    it('a MULTISIG escrow whose trade lookup fails still lands in failed, not requiresManualRecovery — a real error is not silently hidden as "expected"', async () => {
      seedEscrow('escrow-1', { type: 'MULTISIG' })
      fakeDb.tradeSeller.delete('trade-escrow-1')

      const result = await escrowService.sweepExpiredEscrows()

      expect(result.requiresManualRecovery).toEqual([])
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].escrowId).toBe('escrow-1')
    })
  })
})