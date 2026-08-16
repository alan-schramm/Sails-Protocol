/**
 * Missão 03 — evaluateIntentPolicy(), the real Policy decision primitive
 * (core/policy-engine.ts). Evolved from Missão 02's authorizeIntentAction()
 * (see that function's git history / this file's predecessor,
 * tests/authorizeIntentAction.test.ts, now superseded by this file).
 *
 * No jest.mock anywhere: the function takes its CapabilityRegistry
 * dependency as a plain, optional-with-default parameter (this
 * codebase's own established DI convention), so a fake `{ check: jest.fn() }`
 * object is enough — pure, fast, fully isolated.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { evaluateIntentPolicy } from '../src/core/policy-engine'
import type { IntentStatus } from '../src/core/state-machine'

const baseIntent = (overrides: Partial<{ id: string; participantId: string; status: IntentStatus; expiresAt: Date | null }> = {}) => ({
  id: 'intent-1',
  participantId: 'buyer-1',
  status: 'COORDINATED' as IntentStatus,
  expiresAt: null,
  ...overrides,
})

const baseParams = (overrides: Record<string, unknown> = {}) => ({
  action: 'intent.propose',
  intent: baseIntent(),
  requestedBy: 'buyer-1',
  allowedStatuses: ['COORDINATED', 'DISCOVERING'] as IntentStatus[],
  requireCapability: false,
  capabilityName: 'trade-coordination',
  capabilityScope: 'intent.discovering',
  ...overrides,
})

describe('evaluateIntentPolicy — Missão 03', () => {
  // 1. ALLOW válido
  it('ALLOWs when every condition is satisfied', async () => {
    const decision = await evaluateIntentPolicy(baseParams())
    expect(decision.effect).toBe('ALLOW')
    expect(decision.actor).toBe('buyer-1')
    expect(decision.action).toBe('intent.propose')
    expect(decision.resource).toEqual({ type: 'Intent', id: 'intent-1' })
  })

  // 2. DENY sem capability
  it('DENYs (forbidden) when requireCapability is true and no grant covers the scope — fail closed', async () => {
    const check = jest.fn().mockResolvedValue(false)
    const decision = await evaluateIntentPolicy(baseParams({ requireCapability: true }), { check })
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('forbidden')
    expect(decision.reason).toContain("no active 'trade-coordination' capability grant covering 'intent.discovering'")
    expect(check).toHaveBeenCalledWith('buyer-1', 'trade-coordination', 'intent.discovering')
  })

  // 3. DENY capability errada (the registry call itself is proven correct
  // at the repository level in tests/capabilityGrantRepository.test.ts —
  // this proves the primitive respects whatever the registry returns).
  it('DENYs when the registry reports no coverage for this specific capability, even if the actor holds a different one', async () => {
    // Simulates a real actor who holds a grant for a *different*
    // capability (e.g. 'settlement') — check() called for
    // 'trade-coordination' correctly reports false.
    const check = jest.fn().mockResolvedValue(false)
    const decision = await evaluateIntentPolicy(baseParams({ requireCapability: true }), { check })
    expect(decision.effect).toBe('DENY')
  })

  // 4. DENY recurso errado / inexistente
  it('DENYs when the resource is null — never crashes on a missing Intent', async () => {
    const decision = await evaluateIntentPolicy(baseParams({ intent: null }))
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('validation')
    expect(decision.reason).toMatch(/does not exist/)
    expect(decision.resource).toEqual({ type: 'Intent', id: 'unknown' })
  })

  // 5. DENY Intent de outro owner
  it('DENYs (forbidden) when the requester does not own the Intent', async () => {
    const decision = await evaluateIntentPolicy(baseParams({ requestedBy: 'attacker' }))
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('forbidden')
    expect(decision.reason).toContain('does not own')
  })

  // 6. DENY Intent expirada
  it('DENYs (validation) when the Intent has expired', async () => {
    const decision = await evaluateIntentPolicy(
      baseParams({ intent: baseIntent({ expiresAt: new Date(Date.now() - 60_000) }) })
    )
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('validation')
    expect(decision.reason).toBe('Intent has expired')
  })

  // 7. DENY estado incompatível
  it('DENYs (validation) when the Intent status is not in allowedStatuses', async () => {
    const decision = await evaluateIntentPolicy(
      baseParams({ intent: baseIntent({ status: 'CANCELLED' as IntentStatus }) })
    )
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('validation')
    expect(decision.reason).toMatch(/not in a valid state/)
  })

  // 8. DENY condição acima do limite — the CTO's own headline example.
  // Also doubles as the explicit "capability válida ≠ ALLOW automático"
  // proof: capability is granted, ownership/expiry/status all clear, and
  // the decision is still DENY because of a contextual condition.
  it('DENYs when the requested amount exceeds the Intent\'s own declared maxValue — even with a valid, granted capability', async () => {
    const check = jest.fn().mockResolvedValue(true) // capability check PASSES
    const decision = await evaluateIntentPolicy(
      baseParams({ requireCapability: true, requestedAmount: { amount: '5', maxValue: '0.5' } }),
      { check }
    )
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('validation')
    expect(decision.reason).toMatch(/above Intent .* maxValue/)
    expect(check).toHaveBeenCalled() // capability really was checked and really did pass
  })

  it('DENYs when the requested amount is below the Intent\'s own declared minValue', async () => {
    const decision = await evaluateIntentPolicy(
      baseParams({ requestedAmount: { amount: '0.001', minValue: '0.01' } })
    )
    expect(decision.effect).toBe('DENY')
    expect(decision.reason).toMatch(/below Intent .* minValue/)
  })

  it('ALLOWs when the requested amount is within declared bounds', async () => {
    const decision = await evaluateIntentPolicy(
      baseParams({ requestedAmount: { amount: '0.1', minValue: '0.01', maxValue: '0.5' } })
    )
    expect(decision.effect).toBe('ALLOW')
  })

  it('ALLOWs a request with no amount-bounds condition at all (requestedAmount omitted)', async () => {
    const decision = await evaluateIntentPolicy(baseParams())
    expect(decision.effect).toBe('ALLOW')
  })

  // 9. DENY contexto incompleto
  it('DENYs when requestedBy is empty — incomplete context, fail closed rather than guess', async () => {
    const decision = await evaluateIntentPolicy(baseParams({ requestedBy: '' }))
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('validation')
    expect(decision.reason).toMatch(/Incomplete policy context/)
  })

  // 10. DENY ação desconhecida / 14. "policy não configurada"
  it('DENYs an unrecognized action — no policy exists for it, never a silent allow', async () => {
    const decision = await evaluateIntentPolicy(baseParams({ action: 'intent.doSomethingUnknown' }))
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('validation')
    expect(decision.reason).toMatch(/No policy exists for action/)
  })

  // 11. Determinismo
  it('is deterministic: identical input always produces an identical decision', async () => {
    const check = jest.fn().mockResolvedValue(true)
    const params = baseParams({ requireCapability: true, requestedAmount: { amount: '0.1', minValue: '0.01', maxValue: '0.5' } })
    const first = await evaluateIntentPolicy(params, { check })
    const second = await evaluateIntentPolicy(params, { check })
    expect(first).toEqual(second)
  })

  // 12. Agente autorizado / 13. agente não autorizado — identity here is
  // an opaque string throughout this system (TRANSACTION_WALKTHROUGH.md
  // §3's own example: 'agent:seller-wallet:<sellerId>'), never
  // special-cased for "is this a human or an agent."
  it('an agent identity with a covering grant is authorized by the exact same mechanism as a human participant', async () => {
    const check = jest.fn().mockResolvedValue(true)
    const agentId = 'agent:seller-wallet:seller-1'
    const decision = await evaluateIntentPolicy(
      baseParams({ intent: baseIntent({ participantId: agentId }), requestedBy: agentId, requireCapability: true }),
      { check }
    )
    expect(decision.effect).toBe('ALLOW')
  })

  it('an agent identity with no covering grant is denied by the exact same mechanism as a human participant', async () => {
    const check = jest.fn().mockResolvedValue(false)
    const agentId = 'agent:seller-wallet:seller-1'
    const decision = await evaluateIntentPolicy(
      baseParams({ intent: baseIntent({ participantId: agentId }), requestedBy: agentId, requireCapability: true }),
      { check }
    )
    expect(decision.effect).toBe('DENY')
    expect(decision.denialCategory).toBe('forbidden')
  })

  it('never calls the capability registry at all when requireCapability is false — the common, current default', async () => {
    const check = jest.fn()
    const decision = await evaluateIntentPolicy(baseParams({ requireCapability: false }), { check })
    expect(decision.effect).toBe('ALLOW')
    expect(check).not.toHaveBeenCalled()
  })

  it('checks ownership before expiry/status/capability/amount — a non-owner is denied without ever reaching the registry', async () => {
    const check = jest.fn()
    const decision = await evaluateIntentPolicy(
      baseParams({ requestedBy: 'attacker', requireCapability: true, requestedAmount: { amount: '999', maxValue: '0.5' } }),
      { check }
    )
    expect(decision.denialCategory).toBe('forbidden')
    expect(check).not.toHaveBeenCalled()
  })
})

// 15. "Nenhuma chamada de settlement é possível através do Policy Engine"
// — a structural proof, not just a behavioral one: the file this
// primitive lives in must never import anything from open-settlement,
// escrow, or trade services. Reads the real source text directly rather
// than trusting a comment to stay true.
describe('policy-engine.ts — no settlement access (Missão 03 Fase 7 item 15)', () => {
  it('never imports open-settlement, escrow, or trade-service modules', () => {
    const source = readFileSync(join(__dirname, '../src/core/policy-engine.ts'), 'utf-8')
    const importLines = source.split('\n').filter((line) => /^import /.test(line.trim()))
    for (const line of importLines) {
      expect(line).not.toMatch(/open-settlement/)
      expect(line).not.toMatch(/escrow/i)
      expect(line).not.toMatch(/trade\.service|trade-service/i)
    }
  })
})
