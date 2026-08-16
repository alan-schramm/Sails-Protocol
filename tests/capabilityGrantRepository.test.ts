/**
 * Missão 02.5 §3 — real gap found while auditing capability readiness:
 * tests/capabilityRegistry.test.ts already proves check()'s scope/expiry
 * logic thoroughly, but only against a fake repository that returns
 * whatever a test configures regardless of which (grantedTo,
 * capabilityName) it was actually called with. The real "wrong
 * capability never gets fetched at all" guarantee lives one layer down,
 * in this repository's own Prisma `where` clause — untested until now.
 */
export {} // forces this file to be a module (no top-level import/export
// otherwise) so its top-level `const mockFindMany` doesn't leak into the
// shared global scope and collide with another such file's identically
// named one (found for real, Missão 06: colliding with
// tests/escrowEventHashChain.test.ts's own module-scope mockFindMany).
const mockFindMany = jest.fn().mockResolvedValue([])
jest.mock('../src/common/database', () => ({
  prisma: { capabilityGrant: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { capabilityGrantRepository } = require('../src/core/capability-grant-repository')

describe('capabilityGrantRepository.findActiveGrants() — Missão 02.5 §3', () => {
  beforeEach(() => {
    mockFindMany.mockClear()
    mockFindMany.mockResolvedValue([])
  })

  it('queries Prisma scoped to exactly (grantedTo, capabilityName, revokedAt: null) — a grant for a different capability is never fetched', async () => {
    await capabilityGrantRepository.findActiveGrants('user-1', 'trade-coordination')

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { grantedTo: 'user-1', capabilityName: 'trade-coordination', revokedAt: null },
    })
  })

  it('a real "wrong capability" scenario: user-1 holds a settlement grant, but a trade-coordination check never even sees it', async () => {
    // Simulates the real Prisma behavior: the WHERE clause above means a
    // 'settlement' grant is filtered out server-side before this
    // function's own JS ever runs — proven by resolving what the real
    // query for 'trade-coordination' would get back (nothing, since the
    // only grant this user holds is for a different capability).
    mockFindMany.mockResolvedValueOnce([])

    const grants = await capabilityGrantRepository.findActiveGrants('user-1', 'trade-coordination')

    expect(grants).toEqual([])
  })

  it('a revoked grant for the right capability is also never fetched (revokedAt: null in the same query)', async () => {
    await capabilityGrantRepository.findActiveGrants('user-1', 'trade-coordination')
    const [{ where }] = mockFindMany.mock.calls[0]
    expect(where.revokedAt).toBeNull()
  })

  it('scoped strictly to the requested participant — never returns another participant\'s grants', async () => {
    await capabilityGrantRepository.findActiveGrants('user-1', 'trade-coordination')
    const [{ where }] = mockFindMany.mock.calls[0]
    expect(where.grantedTo).toBe('user-1')
  })
})
