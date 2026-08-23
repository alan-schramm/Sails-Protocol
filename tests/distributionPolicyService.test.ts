/**
 * distribution-policy.service.ts — Missão 11 Fase 6.3A economic accounting
 * foundation. Structural validation only (weight bounds, exact 100% sum,
 * DRAFT-only publish, non-empty recipient set) — no real recipient set or
 * split is chosen anywhere in this file; every value below is an
 * explicitly-labeled fixture. Fake-repo DI, same pattern as
 * tests/feePolicyService.test.ts (no jest.mock('../src/common/database', ...)
 * needed).
 */
import { DistributionPolicyService } from '../src/modules/open-settlement/distribution-policy.service'
import type { DistributionPolicyRepository } from '../src/modules/open-settlement/distribution-policy-repository'

function fixturePolicy(overrides: Record<string, any> = {}) {
  return {
    id: 'policy-fixture-1',
    label: 'fixture-policy',
    status: 'DRAFT',
    createdBy: 'test-fixture',
    createdAt: new Date(),
    publishedAt: null,
    retiredAt: null,
    recipients: [],
    ...overrides,
  }
}

function fixtureRecipientRow(recipientId: string, weightPct: string) {
  return { id: `dpr-${recipientId}`, policyVersionId: 'policy-fixture-1', recipientId, weightPct, createdAt: new Date() }
}

function fakeRepo(overrides: Partial<jest.Mocked<DistributionPolicyRepository>> = {}): jest.Mocked<DistributionPolicyRepository> {
  return {
    createDraft: jest.fn(),
    addRecipient: jest.fn(),
    findById: jest.fn().mockResolvedValue(null),
    findPublished: jest.fn().mockResolvedValue([]),
    publish: jest.fn(),
    retire: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<DistributionPolicyRepository>
}

describe('DistributionPolicyService.publish() — structural validation only', () => {
  it('publishes a policy whose single recipient has weightPct=100 (the bootstrap-direction shape — NOT activated by this test)', async () => {
    const policy = fixturePolicy({ recipients: [fixtureRecipientRow('treasury-1', '100')] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy), publish: jest.fn().mockResolvedValue({ ...policy, status: 'PUBLISHED' }) })
    const service = new DistributionPolicyService(repo)

    const result = await service.publish('policy-fixture-1')
    expect(result.status).toBe('PUBLISHED')
    expect(repo.publish).toHaveBeenCalledWith('policy-fixture-1')
  })

  it('publishes a policy with a fractional multi-recipient split summing exactly to 100 (illustrative fixture, e.g. 33.33/66.67)', async () => {
    const policy = fixturePolicy({ recipients: [fixtureRecipientRow('a', '33.33'), fixtureRecipientRow('b', '66.67')] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy), publish: jest.fn().mockResolvedValue({ ...policy, status: 'PUBLISHED' }) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('policy-fixture-1')).resolves.toMatchObject({ status: 'PUBLISHED' })
  })

  it('rejects a policy whose weights sum to less than 100', async () => {
    const policy = fixturePolicy({ recipients: [fixtureRecipientRow('a', '99')] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('policy-fixture-1')).rejects.toThrow(/not exactly 100/)
    expect(repo.publish).not.toHaveBeenCalled()
  })

  it('rejects a policy whose weights sum to more than 100', async () => {
    const policy = fixturePolicy({ recipients: [fixtureRecipientRow('a', '60'), fixtureRecipientRow('b', '60')] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('policy-fixture-1')).rejects.toThrow(/not exactly 100/)
  })

  it('rejects a zero-weight recipient (no schema reason identified to permit it)', async () => {
    const policy = fixturePolicy({ recipients: [fixtureRecipientRow('a', '100'), fixtureRecipientRow('b', '0')] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('policy-fixture-1')).rejects.toThrow(/strictly greater than 0/)
  })

  it('rejects a negative weight', async () => {
    const policy = fixturePolicy({ recipients: [fixtureRecipientRow('a', '110'), fixtureRecipientRow('b', '-10')] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('policy-fixture-1')).rejects.toThrow(/strictly greater than 0/)
  })

  it('rejects an empty policy (no recipients at all) — no implicit Treasury fallback', async () => {
    const policy = fixturePolicy({ recipients: [] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('policy-fixture-1')).rejects.toThrow(/no recipients/)
  })

  it('rejects publishing a policy that is not DRAFT', async () => {
    const policy = fixturePolicy({ status: 'PUBLISHED', recipients: [fixtureRecipientRow('a', '100')] })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('policy-fixture-1')).rejects.toThrow(/cannot be published from status PUBLISHED/)
  })

  it('rejects publishing a nonexistent policy', async () => {
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(null) })
    const service = new DistributionPolicyService(repo)

    await expect(service.publish('does-not-exist')).rejects.toThrow(/not found/)
  })
})

describe('DistributionPolicyService.retire()', () => {
  it('retires a PUBLISHED policy', async () => {
    const policy = fixturePolicy({ status: 'PUBLISHED' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy), retire: jest.fn().mockResolvedValue({ ...policy, status: 'RETIRED' }) })
    const service = new DistributionPolicyService(repo)

    const result = await service.retire('policy-fixture-1')
    expect(result.status).toBe('RETIRED')
  })

  it('rejects retiring a non-PUBLISHED policy', async () => {
    const policy = fixturePolicy({ status: 'DRAFT' })
    const repo = fakeRepo({ findById: jest.fn().mockResolvedValue(policy) })
    const service = new DistributionPolicyService(repo)

    await expect(service.retire('policy-fixture-1')).rejects.toThrow(/cannot be retired from status DRAFT/)
  })
})

describe('DistributionPolicyService.findLivePolicy()', () => {
  it('returns null when no policy is PUBLISHED (no implicit Treasury fallback)', async () => {
    const repo = fakeRepo({ findPublished: jest.fn().mockResolvedValue([]) })
    const service = new DistributionPolicyService(repo)

    expect(await service.findLivePolicy()).toBeNull()
  })

  it('returns the most-recently-published policy when multiple exist', async () => {
    const repo = fakeRepo({ findPublished: jest.fn().mockResolvedValue([fixturePolicy({ id: 'newest' }), fixturePolicy({ id: 'older' })]) })
    const service = new DistributionPolicyService(repo)

    const live = await service.findLivePolicy()
    expect(live?.id).toBe('newest')
  })
})
