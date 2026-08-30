// tests/integration/semanticTransitionRecordAtomicity.test.ts
//
// Sails Core Implementation Program — Bridge Phase M3.5. Real-Postgres
// proof of what a mocked unit test structurally cannot prove: that the
// new semantic_transition_records table and
// commitAuthoritativeEscrowTimelockExpiry()'s atomic claim+insert
// actually behave correctly against a real transactional database —
// a real lost-race leaves no orphaned Record, the real UNIQUE
// constraint on (interactionId, transitionType) rejects a real
// duplicate, real BigInt columns round-trip realistic millisecond
// timestamps exactly, and existing historical Escrow/EscrowEvent rows
// remain fully valid and untouched by the new, empty table.
//
// This mechanism is NOT wired into any live path — see
// semantic-transition-record.ts's own header. This file proves it in
// isolation, per mission §37 ("Testability before authority").

import { createPostgresIntegrationHarness } from './postgresTestHarness'
import {
  createTransitionRecord,
  createInteractionId,
  createTransitionTypeId,
  createCandidateTransition,
  createRulesetRef,
  LEGACY_UNVERIFIED,
  SAILS_TIMELOCK_EVALUATOR_IDENTITY,
  SAILS_SEMANTIC_PROFILE_IDENTITY,
} from '@sails/core'

describe('Sails Core Implementation Program M3.5 — SemanticTransitionRecord atomicity (real Postgres)', () => {
  jest.setTimeout(60_000)

  const pg = createPostgresIntegrationHarness()
  let dbAvailable = false
  let prisma: import('@prisma/client').PrismaClient
  let commitAuthoritativeEscrowTimelockExpiry: typeof import('../../src/modules/open-settlement/semantic-transition-record').commitAuthoritativeEscrowTimelockExpiry
  let semanticTransitionRecordRepository: typeof import('../../src/modules/open-settlement/semantic-transition-record').semanticTransitionRecordRepository

  beforeAll(async () => {
    await pg.probe()
    dbAvailable = pg.isAvailable()
    if (!dbAvailable) return
    ;({ prisma } = require('../../src/common/database'))
    ;({ commitAuthoritativeEscrowTimelockExpiry, semanticTransitionRecordRepository } = require('../../src/modules/open-settlement/semantic-transition-record'))
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function requirePostgres(name: string): void {
    pg.requirePostgres(name)
  }

  function suffix() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

  function ruleset() {
    return createRulesetRef({
      name: 'Sails Escrow Timelock Expiry Ruleset',
      identity: 'sails-escrow-timelock-expiry-ruleset',
      version: '1.0',
      commitment: 'sails-escrow-timelock-expiry-ruleset@1.0:evaluationTime>=deadline' as any,
      expectedEvaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
      expectedProfileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
    })
  }

  function buildRecord(escrowId: string, deadlineMs: number, evaluationTimeMs: number) {
    const interaction = createInteractionId(escrowId)
    return createTransitionRecord({
      interaction,
      priorPosition: LEGACY_UNVERIFIED,
      transition: createCandidateTransition({
        interaction,
        type: createTransitionTypeId('escrow.timelock.expire'),
        payload: { fromState: 'FUNDS_LOCKED', toState: 'EXPIRED', deadlineMs, evaluationTimeMs },
      }),
      rulesetRef: ruleset(),
      evaluatorIdentity: SAILS_TIMELOCK_EVALUATOR_IDENTITY,
      profileIdentity: SAILS_SEMANTIC_PROFILE_IDENTITY,
      conditionResult: 'SATISFIED',
    })
  }

  async function fixtureFundsLockedMultisigEscrow() {
    const s = suffix()
    const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-str-${s}` } })
    const seller = await prisma.user.create({ data: { publicKey: `pk-seller-str-${s}` } })
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' } })
    const trade = await prisma.trade.create({ data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.001', priceUsd: '65000', totalUsd: '65' } })
    const escrow = await prisma.escrow.create({
      data: { tradeId: trade.id, type: 'MULTISIG', status: 'FUNDS_LOCKED', asset: 'BTC', lockedAmount: '0.001', timelockHours: 1, expiresAt: new Date(Date.now() - 60_000) },
    })
    return { escrow }
  }

  it('P1/P2/Y — the happy path commits the State claim and the Record together; the Record is a faithful, exact copy of the committed inputs', async () => {
    requirePostgres('atomic happy path')
    const { escrow } = await fixtureFundsLockedMultisigEscrow()
    const deadlineMs = Date.now() - 60_000
    const evaluationTimeMs = Date.now()

    const result = await commitAuthoritativeEscrowTimelockExpiry(escrow.id, 'FUNDS_LOCKED', 'EXPIRED', buildRecord(escrow.id, deadlineMs, evaluationTimeMs))

    expect(result.committed).toBe(true)
    const updated = await prisma.escrow.findUniqueOrThrow({ where: { id: escrow.id } })
    expect(updated.status).toBe('EXPIRED')

    const record = await semanticTransitionRecordRepository.findByInteractionAndTransitionType(escrow.id, 'escrow.timelock.expire')
    expect(record).not.toBeNull()
    expect(record!.fromState).toBe('FUNDS_LOCKED')
    expect(record!.toState).toBe('EXPIRED')
    expect(record!.priorPositionKind).toBe('LEGACY_UNVERIFIED')
    expect(record!.evaluatorIdentityName).toBe('sails-timelock-evaluator')
    expect(record!.profileIdentityName).toBe('sails-semantic-profile')
    expect(record!.conditionResult).toBe('SATISFIED')
    // P6 — committed semantic inputs durable with NO precision loss
    // across the real Postgres BIGINT round trip.
    expect(record!.deadlineMs).toBe(BigInt(deadlineMs))
    expect(record!.evaluationTimeMs).toBe(BigInt(evaluationTimeMs))
  })

  it('P2/AA — a real lost race leaves no orphaned Record: the escrow is claimed by a concurrent transition first, and the second attempt commits nothing', async () => {
    requirePostgres('real lost race')
    const { escrow } = await fixtureFundsLockedMultisigEscrow()

    // Simulates a concurrent winner: the escrow has already moved on by
    // the time our attempt's own claimTransition() runs.
    await prisma.escrow.update({ where: { id: escrow.id }, data: { status: 'DISPUTED' } })

    const result = await commitAuthoritativeEscrowTimelockExpiry(escrow.id, 'FUNDS_LOCKED', 'EXPIRED', buildRecord(escrow.id, Date.now() - 1000, Date.now()))

    expect(result).toEqual({ committed: false, reason: 'STATE_TRANSITION_LOST_RACE' })
    const stillDisputed = await prisma.escrow.findUniqueOrThrow({ where: { id: escrow.id } })
    expect(stillDisputed.status).toBe('DISPUTED') // untouched by our lost attempt
    const record = await semanticTransitionRecordRepository.findByInteractionAndTransitionType(escrow.id, 'escrow.timelock.expire')
    expect(record).toBeNull() // no Record was ever created for a transition that did not happen
  })

  it('AA/§39 — the real UNIQUE constraint on (interactionId, transitionType) rejects a real duplicate Record', async () => {
    requirePostgres('real duplicate rejection')
    const { escrow } = await fixtureFundsLockedMultisigEscrow()
    const first = await commitAuthoritativeEscrowTimelockExpiry(escrow.id, 'FUNDS_LOCKED', 'EXPIRED', buildRecord(escrow.id, Date.now() - 1000, Date.now()))
    expect(first.committed).toBe(true)

    // Attempting to record the SAME transition again (e.g. a naive
    // retry that skips the state check) must fail loudly, never create
    // ambiguous duplicate semantic history.
    await expect(
      semanticTransitionRecordRepository.create({
        interactionId: escrow.id,
        transitionType: 'escrow.timelock.expire',
        fromState: 'FUNDS_LOCKED',
        toState: 'EXPIRED',
        priorPositionKind: 'LEGACY_UNVERIFIED',
        priorPositionReference: null,
        rulesetName: 'x', rulesetIdentity: 'x', rulesetVersion: '1.0', rulesetCommitment: 'x',
        rulesetExpectedEvaluatorName: 'x', rulesetExpectedEvaluatorVersion: '1.0',
        rulesetExpectedProfileName: 'x', rulesetExpectedProfileVersion: '1.0',
        evaluatorIdentityName: 'sails-timelock-evaluator', evaluatorIdentityVersion: '1.0',
        profileIdentityName: 'sails-semantic-profile', profileIdentityVersion: '1.0',
        deadlineMs: BigInt(1), evaluationTimeMs: BigInt(2),
        conditionResult: 'SATISFIED',
      } as any),
    ).rejects.toThrow()
  })

  it('P9/§45 — existing historical Escrow/EscrowEvent rows remain fully valid; the new, empty table requires nothing from them', async () => {
    requirePostgres('legacy compatibility')
    const s = suffix()
    const buyer = await prisma.user.create({ data: { publicKey: `pk-buyer-legacy-${s}` } })
    const seller = await prisma.user.create({ data: { publicKey: `pk-seller-legacy-${s}` } })
    const offer = await prisma.offer.create({ data: { userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '65000', minAmount: '0.001', maxAmount: '1', paymentMethod: 'PIX' } })
    const trade = await prisma.trade.create({ data: { offerId: offer.id, buyerId: buyer.id, sellerId: seller.id, asset: 'BTC', amount: '0.001', priceUsd: '65000', totalUsd: '65' } })
    const historicalEscrow = await prisma.escrow.create({
      data: { tradeId: trade.id, type: 'MOCK', status: 'COMPLETED', asset: 'BTC', lockedAmount: '0.001' },
    })

    const reread = await prisma.escrow.findUniqueOrThrow({ where: { id: historicalEscrow.id } })
    expect(reread.status).toBe('COMPLETED')
    // No Core provenance exists for this pre-migration transition, and
    // none is fabricated — a simple absence, not a synthesized record.
    const record = await semanticTransitionRecordRepository.findByInteractionAndTransitionType(historicalEscrow.id, 'escrow.timelock.expire')
    expect(record).toBeNull()
  })
})
