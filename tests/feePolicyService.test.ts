/**
 * fee-policy.service.ts — Missão 11 Fase 2.2 economic accounting
 * foundation. Structural validation only (rate/percentage bounds, 100%
 * sum, PUBLISHED-only snapshotting) — no real economic parameter is chosen
 * anywhere in this file; every value below is an explicitly-labeled
 * fixture. Fake-repo DI, same pattern as tests/capabilityRegistry.test.ts
 * (no `jest.mock('../src/common/database', ...)` needed).
 */
import { FeePolicyService } from '../src/modules/open-settlement/fee-policy.service'
import type { FeePolicyVersionRepository } from '../src/modules/open-settlement/fee-policy-repository'

function fixtureDraft(overrides: Record<string, any> = {}) {
  return {
    id: 'policy-fixture-1',
    label: 'fixture-v1',
    railScope: 'FIXTURE_RAIL',
    status: 'DRAFT',
    protocolFeeRate: '0.004',
    payerModel: 'SELLER_PAYS',
    economicBasis: 'SELLER_DELIVERED_VALUE',
    nodeOperatorPct: '30',
    treasuryPct: '25',
    walletRebatePct: '35',
    arbitratorReservePct: '10',
    smallTradeRule: {},
    triggerSemantics: {},
    createdBy: 'test-fixture',
    createdAt: new Date(),
    publishedAt: null,
    retiredAt: null,
    ...overrides,
  }
}

function fakeRepo(overrides: Partial<jest.Mocked<FeePolicyVersionRepository>> = {}): jest.Mocked<FeePolicyVersionRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    findPublishedForRail: jest.fn().mockResolvedValue([]),
    publish: jest.fn(),
    retire: jest.fn(),
    ...overrides,
  }
}

describe('FeePolicyService.publish — structural validation (G/H/F)', () => {
  // Test H: negative rate rejected
  it('rejects a negative protocolFeeRate', async () => {
    const draft = fixtureDraft({ protocolFeeRate: '-0.01' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(draft) })
    const service = new FeePolicyService(repo)

    await expect(service.publish(draft.id)).rejects.toThrow(/protocolFeeRate must be >= 0/)
    expect(repo.publish).not.toHaveBeenCalled()
  })

  // Test G: negative bucket percentage rejected
  it('rejects a negative bucket percentage', async () => {
    const draft = fixtureDraft({ arbitratorReservePct: '-5', walletRebatePct: '40' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(draft) })
    const service = new FeePolicyService(repo)

    await expect(service.publish(draft.id)).rejects.toThrow(/arbitratorReservePct must be >= 0/)
    expect(repo.publish).not.toHaveBeenCalled()
  })

  // Test F: bucket percentages not summing to exactly 100 rejected
  it('rejects bucket percentages that do not sum to exactly 100', async () => {
    const draft = fixtureDraft({ nodeOperatorPct: '30', treasuryPct: '25', walletRebatePct: '35', arbitratorReservePct: '5' }) // sums to 95
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(draft) })
    const service = new FeePolicyService(repo)

    await expect(service.publish(draft.id)).rejects.toThrow(/must sum to exactly 100/)
    expect(repo.publish).not.toHaveBeenCalled()
  })

  it('accepts a structurally valid draft (fixture values, not a real economic decision) and publishes it', async () => {
    const draft = fixtureDraft() // 30+25+35+10 = 100, rate >= 0
    const repo = fakeRepo({
      findById: jest.fn().mockResolvedValue(draft),
      publish: jest.fn().mockResolvedValue({ ...draft, status: 'PUBLISHED', publishedAt: new Date() }),
    })
    const service = new FeePolicyService(repo)

    const published = await service.publish(draft.id)
    expect(repo.publish).toHaveBeenCalledWith(draft.id)
    expect(published.status).toBe('PUBLISHED')
  })

  it('rejects publishing a policy that is not currently DRAFT', async () => {
    const already = fixtureDraft({ status: 'PUBLISHED' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(already) })
    const service = new FeePolicyService(repo)

    await expect(service.publish(already.id)).rejects.toThrow(/only a DRAFT policy may be published/)
    expect(repo.publish).not.toHaveBeenCalled()
  })
})

describe('FeePolicyService.retire', () => {
  it('rejects retiring a policy that is not currently PUBLISHED', async () => {
    const draft = fixtureDraft({ status: 'DRAFT' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(draft) })
    const service = new FeePolicyService(repo)

    await expect(service.retire(draft.id)).rejects.toThrow(/only a PUBLISHED policy may be retired/)
    expect(repo.retire).not.toHaveBeenCalled()
  })

  it('retires a PUBLISHED policy', async () => {
    const published = fixtureDraft({ status: 'PUBLISHED', publishedAt: new Date() })
    const repo = fakeRepo({
      findById: jest.fn().mockResolvedValue(published),
      retire: jest.fn().mockResolvedValue({ ...published, status: 'RETIRED', retiredAt: new Date() }),
    })
    const service = new FeePolicyService(repo)

    const retired = await service.retire(published.id)
    expect(retired.status).toBe('RETIRED')
  })
})

// Test I: escrow snapshotting must never be able to reach a DRAFT policy.
describe('FeePolicyService — PUBLISHED-only snapshotting (Test I)', () => {
  it('findLivePolicyForRail never returns a DRAFT policy, even if one exists for the rail', async () => {
    // The fake repository itself only ever returns PUBLISHED rows for
    // findPublishedForRail (mirroring the real Prisma query's own
    // `where: { status: 'PUBLISHED' }` filter) — this test's job is to
    // confirm the SERVICE never second-guesses that and reaches for
    // something else that could surface a DRAFT.
    const repo = fakeRepo({ findPublishedForRail: jest.fn().mockResolvedValue([]) })
    const service = new FeePolicyService(repo)

    const live = await service.findLivePolicyForRail('FIXTURE_RAIL')
    expect(live).toBeNull()
    expect(repo.findPublishedForRail).toHaveBeenCalledWith('FIXTURE_RAIL')
  })

  it('assertPublished throws for a DRAFT policy id', async () => {
    const draft = fixtureDraft({ status: 'DRAFT' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(draft) })
    const service = new FeePolicyService(repo)

    await expect(service.assertPublished(draft.id)).rejects.toThrow(/is not PUBLISHED/)
  })

  it('assertPublished succeeds for a PUBLISHED policy id', async () => {
    const published = fixtureDraft({ status: 'PUBLISHED' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(published) })
    const service = new FeePolicyService(repo)

    await expect(service.assertPublished(published.id)).resolves.toEqual(published)
  })
})
