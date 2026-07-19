# RFC-019: Settlement Custody — Reference Implementation vs. Normative Protocol

## Summary

`WdkSettlementProvider` — the one real, tested `SettlementProvider`
this codebase ships (`wdk-settlement.provider.ts`) — signs every escrow
lock/release from a single server-held seed phrase
(`WDK_SEED_PHRASE`). No user-supplied signature or credential is
required for a release to succeed. This is a real, current violation of
`PROTOCOL_INVARIANTS.md` Constitutional Invariant 2 ("The Protocol
Never Custodies Assets") and `PRINCIPLES.md` Principle 3 ("Self Custody
Always") — not a documentation gap, a custody gap, in the one
implementation that actually moves real (testnet) funds today. This RFC
does not build the fix. It formally registers `WdkSettlementProvider`'s
current shape as a **local-development/testnet reference
implementation**, never the protocol's normative custody model,
specifies the target architecture (the delegating Identity's own
wallet performs final signing; the server never holds a key capable of
moving escrowed funds), and lays out an incremental migration path
without committing to a build date.

**Status:** Accepted. Triggered by the same CTO-role fidelity audit as
RFC-018 — a project-owner-relayed review explicitly approving this as a
P0-severity ("bloqueante para produção") architecture item ("ARC-002"
in that review; renumbered here per `GOVERNANCE.md` §5's permanent
single-sequence rule). Bypasses the Discussion window
(`GOVERNANCE.md` §5), the same precedent RFC-007/RFC-015/RFC-016/RFC-017/
RFC-018 already used for owner-directed RFCs.

**Classification:** Core RFC (`GOVERNANCE.md` §6A) — changes the
custody/trust model of Settlement, the exact category §6A names as one
of its founding examples.

## Motivation

The gap was already disclosed at the code-comment level —
`wdk-settlement.provider.ts`'s own header states plainly: "a
single-seed, two-hop escrow, not a trustless multisig ... the same key
that can lock funds can also move them anywhere." But no document
*above* the code said so with equivalent clarity until the 2026-07-19
fidelity audit that triggered this RFC. That's a real risk on its own:
a third-party wallet integrator or external auditor reading
`SettlementProvider`'s interface plus `TODO.md`'s "real, not a stub ...
real on-chain testnet transfers with real transaction hashes" framing
could reasonably conclude `WDK_USDT_EVM` is safe for production
value-at-risk use. It is not, today. Silence — or a caveat buried only
in one file's header comment — is not a sufficient answer once a
protocol is being positioned for third-party adoption
(`PROJECT_CONTEXT.md`'s positioning, `GOVERNANCE.md`'s own eventual
Governance Layer v1).

## Alternatives Considered

- **Fix it now, in the same pass that found it.** Rejected per the CTO
  review's explicit instruction: "Não implementar soluções provisórias
  que alterem essa direção; apenas registrar claramente a diferença...
  e planejar a migração de forma incremental." A real non-custodial EVM
  settlement path is genuine engineering work (a multisig or
  threshold-signature scheme, or a user-side co-signing flow) that
  deserves its own scoped implementation pass, reviewed on its own
  merits — not a rushed change bundled into a documentation-consolidation
  RFC.
- **Deprecate/remove `WDK_USDT_EVM` entirely until a compliant
  replacement exists.** Considered, rejected: it is the only real,
  tested settlement path beyond `MOCK`, genuinely useful for
  demo/testnet purposes (`npm run demo:pix-to-usdt`), and removing it
  would regress `TODO.md`'s QVAC+WDK MVP pass for no safety benefit —
  the risk isn't that it exists, it's that its custody model wasn't
  stated plainly enough. Labeling, not removal, closes that specific
  gap.
- **Silently rename it to something like `WDK_USDT_EVM_TESTNET_ONLY`.**
  Considered, rejected as insufficient on its own: a naming convention
  is easy to miss; this RFC specifies both a naming/labeling change
  *and* a runtime-visible signal (boot warning), so the gap is
  unmissable at the two places someone would actually notice it — the
  code and the running server's own output — not just in a config
  string.

## Decision

`WdkSettlementProvider`'s current implementation is reclassified,
explicitly, as a **Reference Implementation for local development and
testnet demonstration** — never the protocol's normative custody
model. The protocol's actual target architecture, restated here as the
binding decision this RFC records:

```
User's Wallet (holds the WDK key, on-device)
    ↓ signs locally, per release
Signed transaction / partial signature
    ↓
Settlement (broadcasts, or co-signs a multisig/threshold scheme)
```

Never:

```
Server
    ↓ holds one seed for every escrow
    ↓ signs unilaterally
Settlement
```

This does not change `SettlementProvider`'s interface (§1.5) — that
interface's `create/lock/release/refund/dispute` shape already
accommodates a genuinely non-custodial implementation; the gap is
entirely inside `WdkSettlementProvider`'s implementation, not the
primitive's contract. `MOCK` (the other existing provider) is
unaffected — it was never presented as production-grade custody.

## Implementation Impact

A scannable map to the full detail in Specification/Reference
Implementation Plan below — not a duplicate of it. **Phase 1 only**
(Phase 2's real non-custodial provider is unscoped by design — see
Reference Implementation Plan):

- `src/infrastructure/*/wdk-settlement.provider.ts` — add a
  `readonly custodyModel = 'server-custodial-reference-implementation'`
  field to the class (exact field name/location TBD at implementation
  time).
- Server boot sequence (wherever `config.wdk`/`MOCK_ESCROW` is read at
  startup) — add a loud, unmissable log line whenever WDK is the active
  provider.
- `.env.example` — add a comment on `WDK_SEED_PHRASE` stating the
  custody model plainly.
- `docs/API_REFERENCE.md` — settlement routes section gains a pointer
  to `CRYPTOGRAPHIC_MODEL.md` §5.
- **Not touched in Phase 1:** `escrow.service.ts`, `settlement-orchestrator.ts`,
  or any real fund-moving logic — Phase 1 is purely a visibility/labeling
  change, never a behavior change, per this RFC's own Alternatives
  Considered.

**Core RFC Review Checklist** (`GOVERNANCE.md` §6A):

- [ ] `PROTOCOL_SPECIFICATION.md` — not applicable. `SettlementProvider`'s
  interface (§1.5) is unchanged by this RFC's own Decision — the gap is
  in one implementation, not the primitive's contract.
- [x] `PROTOCOL_INVARIANTS.md` — updated (Constitutional Invariant 2
  gained a "Known violation, real code" callout).
- [x] `TRUST_BOUNDARY.md` — updated (boundary 5's row now states the
  real gap alongside the design intent, with a pointer to this RFC).
- [x] `SECURITY_MODEL.md` — updated (§2 Principle 2 gained a
  "Real-implementation gap found" note).
- [x] `CRYPTOGRAPHIC_MODEL.md` — updated (new §5, "Settlement Custody:
  What `WDK_USDT_EVM` Actually Signs With").

## Primitives Used or Extended

**Settlement** (§1.5) — no interface change. This RFC constrains an
*implementation* of `SettlementProvider`, not the primitive itself.

## Principle Alignment

**Principle 3, Self Custody Always** — currently violated by
`WdkSettlementProvider`. This RFC does not change the principle; it is
the registered plan for making a real implementation actually satisfy
it, and in the meantime makes the violation impossible to overlook.

## Specification

**Immediate (this RFC registers these as the next implementation
pass — not built here, per Alternatives Considered):**

1. `WdkSettlementProvider` gains a `readonly custodyModel =
   'server-custodial-reference-implementation'` field (exact name TBD
   at implementation time), so any code path holding a
   `SettlementProvider` can introspect and distinguish it from a
   genuinely non-custodial one — a small, additive, low-risk change.
2. A loud, impossible-to-miss boot-time log line whenever
   `MOCK_ESCROW=false` (i.e., WDK is the active provider): stating
   plainly that this is a server-custodial reference implementation,
   not for production use with real value at risk.
3. `.env.example`'s `WDK_SEED_PHRASE` entry gains a comment stating the
   same.
4. `API_REFERENCE.md`'s settlement routes section gains a pointer to
   `CRYPTOGRAPHIC_MODEL.md` §5 (already written, describing this gap in
   full).

**Target architecture (design only — real engineering work, not scoped
to this RFC or its immediate follow-up):** a
`WalletAuthorizedSettlementProvider` (name TBD) whose `release()`/
`lock()` accept a caller-supplied signature or partial signature rather
than deriving one from a server-held seed. Two shapes are plausible,
neither committed to here:

- A real on-chain multisig/threshold-signature scheme (2-of-3: buyer,
  seller, arbiter) — mirroring `SECURITY_MODEL.md` §1.1's already-stated
  design for the protocol generally.
- An interim, simpler step: a user-confirmed release flow where the
  user's own WDK-connected wallet co-signs via WDK's signing API before
  the server's half of the transaction completes — still two required
  signers, not yet a full on-chain multisig contract, but no longer a
  single server-held key.

Which shape gets built, and when, is deliberately left open — this RFC
registers the destination and the fact that the current implementation
has not reached it, not a committed design for the replacement.

## Backward Compatibility

No `protocolVersion` bump — `SettlementProvider`'s interface is
unchanged. The immediate items (custody-model flag, boot warning, doc
pointers) are purely additive and non-breaking. The eventual real
migration (a new provider implementation) would be a new, separate
`SettlementAdapter`-pattern addition (§4B) — adding an implementation,
never a change to the interface itself, so it carries no backward
compatibility risk to anything already built against
`SettlementProvider`.

## Reference Implementation Plan

Satsails reference implementation (this repo). Phase 1 (the four
"Immediate" items above) is low-risk and can be picked up as a
near-term follow-up pass. Phase 2 (the real non-custodial settlement
path) is separately scoped, unstarted, and not committed to a
timeline — consistent with `GOVERNANCE.md` §5 step 4: accepting this
RFC is not a commitment that Satsails will build Phase 2 by any date,
only that the destination is now the recorded, binding target rather
than an implicit assumption.
