// tests/isPartyOrAgent.test.ts
//
// Missão 11 Fase 9.3 §7 — minimal false-positive regression test for the
// independently-reproduced Kimi K3 R1 AUTH-01/CAP-02 finding
// ("agent: delegation label injection"): the `isPartyOrAgent()` regex
// (escrow-lifecycle.ts) is genuinely permissive as Kimi described (the
// `[^:]+` label segment accepts any non-colon characters), but every real
// call path that can PRODUCE an `agent:`-shaped `triggeredBy` traces back
// to settlement-orchestrator.ts's internal-only `sellerAgentId` parameter
// — which has exactly one caller, never supplies it, and is unreachable
// from any HTTP route (WalletAgent, the only class that constructs
// `agent:` strings, is never instantiated anywhere in src/). Classified
// FALSE POSITIVE (unreachable today) / DESIGN DEBT (worth tightening
// before any future feature exposes agent delegation to less-trusted
// input) — see SAILS-KIMI-K3-RED-TEAM-R1-CTO-TRIAGE.md.
//
// This test documents isPartyOrAgent()'s exact current matching behavior
// as a regression canary: if a future change to the regex (deliberate or
// accidental) alters what it accepts, this test — not a red-team report —
// is what should catch it first.
import { isPartyOrAgent } from '../src/modules/open-settlement/escrow-lifecycle'

describe('isPartyOrAgent() — Missão 11 Fase 9.3 §7 (AUTH-01/CAP-02 regression canary)', () => {
  it('a direct participant id match is always accepted', () => {
    expect(isPartyOrAgent('user-1', 'user-1')).toBe(true)
  })

  it('a different participant id is always rejected', () => {
    expect(isPartyOrAgent('user-2', 'user-1')).toBe(false)
  })

  it('a well-formed agent label acting for the correct participant is accepted', () => {
    expect(isPartyOrAgent('agent:wallet-agent:user-1', 'user-1')).toBe(true)
  })

  it('a well-formed agent label naming a DIFFERENT participant is rejected — the id segment is not just "any suffix"', () => {
    expect(isPartyOrAgent('agent:wallet-agent:user-2', 'user-1')).toBe(false)
    expect(isPartyOrAgent('agent:wallet-agent:user-12', 'user-1')).toBe(false) // no partial/prefix match
  })

  it('a bare "agent:" prefix with no id segment, or an id-only string with no agent: prefix, is rejected', () => {
    expect(isPartyOrAgent('agent:wallet-agent:', 'user-1')).toBe(false)
    expect(isPartyOrAgent('wallet-agent:user-1', 'user-1')).toBe(false)
  })

  it('DOCUMENTED PERMISSIVENESS (Kimi K3 R1 AUTH-01/CAP-02, unreachable today — see this file\'s header comment): the label segment accepts ANY non-colon characters, not a validated/allowlisted label', () => {
    expect(isPartyOrAgent('agent:anything-goes-here:user-1', 'user-1')).toBe(true)
    expect(isPartyOrAgent('agent:' + 'x'.repeat(500) + ':user-1', 'user-1')).toBe(true)
  })

  it('a colon embedded inside the label segment breaks the match — the label itself may never contain a colon', () => {
    expect(isPartyOrAgent('agent:label:with:colons:user-1', 'user-1')).toBe(false)
  })
})
