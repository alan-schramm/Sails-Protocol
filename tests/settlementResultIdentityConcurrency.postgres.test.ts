/**
 * #252 — real PostgreSQL evidence for settlement-result identity write-once.
 * The DB CAS, not a Jest mock, arbitrates concurrent result identity.
 */
import { prisma } from '../src/common/database'
import { escrowRepository } from '../src/modules/open-settlement/escrow-repository'
import { createPostgresIntegrationHarness } from './integration/postgresTestHarness'

const harness = createPostgresIntegrationHarness()
const escrowId = 'settlement-result-identity-race-test'
const tradeId = `${escrowId}-trade`
const offerId = `${escrowId}-offer`
const buyerId = `${escrowId}-buyer`
const sellerId = `${escrowId}-seller`

async function resetEscrow(status: 'COMPLETED' | 'REFUNDED' | 'SPLIT' = 'COMPLETED') {
  await prisma.escrow.deleteMany({ where: { id: escrowId } })
  await prisma.escrow.create({ data: { id: escrowId, tradeId, type: 'WDK_USDT_EVM', status, lockedAmount: '1', asset: 'USDT_ERC20', txReleaseId: null } })
}

describe('Settlement result identity write-once — PostgreSQL', () => {
  beforeAll(async () => {
    await harness.probe()
    await prisma.escrow.deleteMany({ where: { id: escrowId } })
    await prisma.trade.deleteMany({ where: { id: tradeId } })
    await prisma.offer.deleteMany({ where: { id: offerId } })
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } })
    await prisma.user.createMany({ data: [{ id: buyerId, publicKey: `${buyerId}-key` }, { id: sellerId, publicKey: `${sellerId}-key` }] })
    await prisma.offer.create({ data: { id: offerId, userId: sellerId, asset: 'USDT_ERC20', side: 'SELL', priceUsd: '1', minAmount: '1', maxAmount: '1', paymentMethod: 'CRYPTO_DIRECT' } })
    await prisma.trade.create({ data: { id: tradeId, offerId, buyerId, sellerId, asset: 'USDT_ERC20', amount: '1', priceUsd: '1', totalUsd: '1' } })
  })

  beforeEach(async () => {
    harness.requirePostgres('Settlement result identity write-once')
    await resetEscrow()
  })

  afterAll(async () => {
    await prisma.escrow.deleteMany({ where: { id: escrowId } })
    await prisma.trade.deleteMany({ where: { id: tradeId } })
    await prisma.offer.deleteMany({ where: { id: offerId } })
    await prisma.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } })
  })

  it('A/A: concurrent same identity converges idempotently', async () => {
    const releasedAt = new Date()
    const results = await Promise.allSettled([
      escrowRepository.updateSignatureCollectionResult(escrowId, { txReleaseId: 'tx-A', releasedAt }),
      escrowRepository.updateSignatureCollectionResult(escrowId, { txReleaseId: 'tx-A', releasedAt }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
    expect((await prisma.escrow.findUnique({ where: { id: escrowId } }))?.txReleaseId).toBe('tx-A')
  })

  it('A/B: concurrent different identities permits one winner and rejects the loser', async () => {
    const releasedAt = new Date()
    const results = await Promise.allSettled([
      escrowRepository.updateSignatureCollectionResult(escrowId, { txReleaseId: 'tx-A', releasedAt }),
      escrowRepository.updateSignatureCollectionResult(escrowId, { txReleaseId: 'tx-B', releasedAt }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    const winner = (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value.txReleaseId
    const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(String(loser.reason?.message ?? loser.reason)).toMatch(/Settlement result integrity conflict/)
    expect((await prisma.escrow.findUnique({ where: { id: escrowId } }))?.txReleaseId).toBe(winner)
  })

  it('reconciler A then delayed live worker B cannot overwrite truth', async () => {
    await escrowRepository.updateSignatureCollectionResult(escrowId, { txReleaseId: 'reconciled-A', releasedAt: new Date() })
    await expect(escrowRepository.updateSignatureCollectionResult(escrowId, { txReleaseId: 'delayed-live-B', releasedAt: new Date() })).rejects.toThrow(/Settlement result integrity conflict/)
    expect((await prisma.escrow.findUnique({ where: { id: escrowId } }))?.txReleaseId).toBe('reconciled-A')
  })

  it('missing escrow fails closed', async () => {
    await prisma.escrow.delete({ where: { id: escrowId } })
    await expect(escrowRepository.updateSignatureCollectionResult(escrowId, { txReleaseId: 'tx-missing', releasedAt: new Date() })).rejects.toThrow(/not found while persisting settlement result/)
    expect(await prisma.escrow.findUnique({ where: { id: escrowId } })).toBeNull()
  })

  it('RELEASE, REFUND and SPLIT share the write-once invariant', async () => {
    const releasedAt = new Date()
    await escrowRepository.updateReleaseResult(escrowId, { txReleaseId: 'release-A', releasedAt, feeCharged: null })
    await expect(escrowRepository.updateReleaseResult(escrowId, { txReleaseId: 'release-B', releasedAt, feeCharged: null })).rejects.toThrow(/Settlement result integrity conflict/)

    await resetEscrow('REFUNDED')
    await escrowRepository.updateRefundResult(escrowId, 'refund-A')
    await expect(escrowRepository.updateRefundResult(escrowId, 'refund-B')).rejects.toThrow(/Settlement result integrity conflict/)

    await resetEscrow('SPLIT')
    await escrowRepository.updateSplitResult(escrowId, { txReleaseId: 'split-A', releasedAt })
    await expect(escrowRepository.updateSplitResult(escrowId, { txReleaseId: 'split-B', releasedAt })).rejects.toThrow(/Settlement result integrity conflict/)
    expect((await prisma.escrow.findUnique({ where: { id: escrowId } }))?.txReleaseId).toBe('split-A')
  })
})
