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
//
// Missão 11 Fase 9.6 — Kimi K3 R2's AUTH-01/AUTH-03/AUTH-04/CONST-GAP-02
// re-raised the identical finding against this exact function; Fase 9.5's
// independent triage reached the same FALSE-POSITIVE-today/DESIGN-DEBT
// conclusion by tracing every real call site directly (never trusting the
// prior triage's own conclusion at face value), and additionally closed
// the DESIGN DEBT half: `isPartyOrAgent()`'s first parameter is now a
// compile-time-branded `TrustedActorId` (escrow-lifecycle.ts's
// asTrustedActor()) — every raw string literal below now has to go
// through that constructor to compile, and the final test in this file
// proves a bare, unconverted string is REJECTED AT COMPILE TIME, not just
// documented as unreachable by convention.
import { isPartyOrAgent, asTrustedActor } from '../src/modules/open-settlement/escrow-lifecycle'

describe('isPartyOrAgent() — Missão 11 Fase 9.3 §7 / 9.6 (AUTH-01/CAP-02 regression canary)', () => {
  it('a direct participant id match is always accepted', () => {
    expect(isPartyOrAgent(asTrustedActor('user-1'), 'user-1')).toBe(true)
  })

  it('a different participant id is always rejected', () => {
    expect(isPartyOrAgent(asTrustedActor('user-2'), 'user-1')).toBe(false)
  })

  it('a well-formed agent label acting for the correct participant is accepted', () => {
    expect(isPartyOrAgent(asTrustedActor('agent:wallet-agent:user-1'), 'user-1')).toBe(true)
  })

  it('a well-formed agent label naming a DIFFERENT participant is rejected — the id segment is not just "any suffix"', () => {
    expect(isPartyOrAgent(asTrustedActor('agent:wallet-agent:user-2'), 'user-1')).toBe(false)
    expect(isPartyOrAgent(asTrustedActor('agent:wallet-agent:user-12'), 'user-1')).toBe(false) // no partial/prefix match
  })

  it('a bare "agent:" prefix with no id segment, or an id-only string with no agent: prefix, is rejected', () => {
    expect(isPartyOrAgent(asTrustedActor('agent:wallet-agent:'), 'user-1')).toBe(false)
    expect(isPartyOrAgent(asTrustedActor('wallet-agent:user-1'), 'user-1')).toBe(false)
  })

  it('DOCUMENTED PERMISSIVENESS (Kimi K3 R1/R2 AUTH-01, unreachable today — see this file\'s header comment): the label segment accepts ANY non-colon characters, not a validated/allowlisted label', () => {
    expect(isPartyOrAgent(asTrustedActor('agent:anything-goes-here:user-1'), 'user-1')).toBe(true)
    expect(isPartyOrAgent(asTrustedActor('agent:' + 'x'.repeat(500) + ':user-1'), 'user-1')).toBe(true)
  })

  it('a colon embedded inside the label segment breaks the match — the label itself may never contain a colon', () => {
    expect(isPartyOrAgent(asTrustedActor('agent:label:with:colons:user-1'), 'user-1')).toBe(false)
  })

  it('COMPILE-TIME PROOF (Missão 11 Fase 9.6) — a bare, unconverted string is rejected by the type system before this file can even compile; only removing the ts-expect-error below would let it through', () => {
    // @ts-expect-error — TrustedActorId is a nominal brand; a raw string
    // literal (exactly what a request.body/query field would be) is not
    // assignable without going through asTrustedActor() first. If this
    // line ever stops erroring, the hardening this phase added has been
    // silently undone — ts-jest's own type-checking already fails this
    // whole file the moment that happens (verified directly: the file
    // failed to compile with `TS2345: Argument of type 'string' is not
    // assignable to parameter of type 'TrustedActorId'` before every
    // call site above was wrapped in asTrustedActor()).
    isPartyOrAgent('raw-unvalidated-string', 'user-1')
    expect(true).toBe(true)
  })
})
