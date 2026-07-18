# RFC-016: QVAC as a Crypto-Native Agent — the Fiat/Crypto Boundary

## Summary

Formalizes an architectural boundary that has held true by construction
throughout this codebase but was never stated as an explicit rule: QVAC
and every agent built on it (`BuyerAgent`/`SellerAgent`,
`qvac-agent.provider.ts`) never call a banking API, never touch PIX,
ACH, SEPA, or any other fiat rail, and never move fiat currency. The
agent acts exclusively on digital assets the user already holds in a
non-custodial wallet (BTC, USDT, DePix, USDC, ...), via WDK — creating
offers, negotiating, accepting counter-offers, and moving assets through
escrow lock/release. Converting fiat into those digital assets in the
first place is the job of a regulated on/off-ramp provider (e.g. Moon,
Banxa, Topper, Bipa), a step that happens entirely outside Sails
Protocol and outside QVAC's scope, before an asset ever reaches the
wallet the agent operates on.

This RFC also retires an ambiguity in how the project's own demo
methods are named: `BuyerAgent.requestUsdtViaPix()` (added before this
RFC) generates a natural-language *goal string* mentioning PIX as the
counterparty's expected payment method — it has never called a banking
API, but the name alone doesn't make that obvious to a future reader.
See Decision §2 and Specification for the doc-comment fix.

**Status:** Accepted. Triggered by direct instruction from the project
owner: *"O QVAC nunca deve tocar em PIX. Essa decisão precisa ser
arquitetural, não apenas uma escolha da Satsails."* — bypassing the
Discussion window (`GOVERNANCE.md` §5), the same precedent RFC-007 and
RFC-015 already used for owner-directed RFCs, recorded here rather than
silently treated as though it went through open discussion.

## Motivation

`docs/PROJECT_CONTEXT.md`'s canonical fiat model statement (v8.0,
frozen) already establishes this at the *protocol* level: *"Fiat is
always settled directly between participants. The protocol never
intermediates fiat."* That statement was written before this project's
QVAC/OpenAgents work existed in real code. Once `BuyerAgent`/
`SellerAgent` became real — autonomous code acting *on a user's behalf*
— the same invariant needed to be restated at the *agent* level
explicitly, for two reasons the protocol-level statement alone doesn't
cover:

1. **Regulatory framing.** A protocol that "coordinates fiat payment
   proof without touching fiat funds" (`PROJECT_CONTEXT.md` §1) is one
   kind of regulatory posture. An autonomous *agent* that a user has
   delegated authority to is a different, sharper question — the moment
   an agent could plausibly touch a banking rail, the regulatory
   analysis changes entirely, from "coordination software" to something
   closer to a money-transmission actor. This RFC exists so that
   question has one clear, permanent answer: no, structurally, not just
   "not today."
2. **Vocabulary discipline.** Nothing in this codebase has ever called
   QVAC a "PIX Agent" or "Banking Agent," but nothing had explicitly
   forbidden it either. As OpenAgents grows (RFC-007 D7's Social
   Engineering Agent, future negotiation-delegation work —
   `docs/SDK_usecases.md`), a future contributor or partner document
   could drift toward that framing by accident, especially since the
   MVP demo's own concrete scenario (`pix-to-usdt-flow.ts`) is literally
   named after PIX. This RFC fixes the term everyone should use instead:
   **Crypto-Native Agent.**

## Alternatives Considered

1. **Leave this as an unwritten convention** (true today because no fiat
   API integration exists anywhere in the codebase, so the invariant
   "just happens" to hold). Rejected — the project owner's own framing
   was explicit that this must be an architectural decision, not an
   incidental fact that stays true only until someone adds a fiat
   integration without knowing it would cross a line. An unwritten
   invariant is not enforceable and not citable to a partner, reviewer,
   or auditor.
2. **Amend `PROJECT_CONTEXT.md`'s frozen canonical fiat model statement
   directly, rewording it to also cover agents.** Rejected. That exact
   sentence is marked frozen (v8.0) and is meant to be quoted verbatim
   wherever the fiat model is described (`PROJECT_CONTEXT.md` §1) —
   editing frozen, verbatim-quoted text risks silently breaking every
   place it's already been copied. Instead, this RFC adds the
   agent-specific corollary as new material alongside the existing
   statement, cross-referenced, not a rewrite of it (Specification).
3. **Model the on-ramp step (PIX → regulated provider → digital asset)
   as a Sails Protocol primitive or module.** Rejected. The three-level
   hierarchy (`PROJECT_CONTEXT.md` §2) already has a test for this:
   "would this still make sense if the Reference Wallet were rewritten
   in Rust against CockroachDB tomorrow?" On-ramp/off-ramp integration
   is explicitly listed as something the protocol is **not**
   (`PROJECT_CONTEXT.md` §1, "✗ An on-ramp / off-ramp provider") — it's
   a Reference Wallet (Level 3) integration choice, made once, before
   any asset reaches a wallet Sails Protocol or QVAC ever sees.
4. **Call the new terminology "DeFi Agent" or "Non-Custodial Agent"
   instead of "Crypto-Native Agent."** Rejected as less precise. "Non-
   custodial" describes the *wallet*, not the agent's scope of action —
   an agent could in principle be non-custodial and still call a
   banking API on the user's behalf (e.g. an open-banking integration),
   which is exactly the case this RFC forbids. "Crypto-Native Agent"
   names the actual constraint: every action the agent takes is denominated
   in and executed against digital assets, never fiat.

## Decision

**1. The architectural rule (Core, not a Satsails-only choice):** QVAC
and any agent built on it —

- ✅ May: negotiate, create offers, respond to proposals, accept
  counter-offers, move BTC/USDT/DePix/USDC/other digital assets, create
  escrow, release escrow — all via WDK.
- ❌ May never: call a banking API, initiate or receive a PIX/ACH/SEPA/
  wire transfer, hold or move fiat currency in any form, or authenticate
  against a financial institution on the user's behalf.

The regulated on-ramp/off-ramp step is a distinct, external actor — this
RFC does not partner with, name a preferred vendor among, or endorse any
specific provider; Moon, Banxa, Topper, and Bipa below are cited only as
the category of provider this boundary assumes exists, the same way
`PROJECT_CONTEXT.md` cites Plebank/Eulen as *a* PIX-rail example without
that being an endorsement or partnership claim.

```
PIX
  │
  ▼
Regulated Provider (e.g. Moon, Banxa, Topper, Bipa)
  │
  ▼
USDT / DePix / USDC
  │
  ▼
Non-Custodial Wallet (Satsails, Rumble, ...)
  │
  ▼
QVAC Agent (Crypto-Native Agent)
  │
  ▼
Sails Protocol
```

**2. Terminology (use everywhere QVAC/OpenAgents is described):** the
agent is a **Crypto-Native Agent**. Never "PIX Agent," never "Banking
Agent," never any name implying it acts on fiat rails.

**3. Doc-comment fix, `buyer-agent.ts`'s `requestUsdtViaPix()`:** the
method name and its goal string both remain (they describe a real,
useful demo scenario — a buyer wanting USDT, expecting to pay a P2P
counterparty via PIX outside the protocol), but its doc comment now
states explicitly that "via Pix" describes the *counterparty's expected
settlement method*, a label the human buyer will act on manually
(exactly like every other `PaymentMethod` value in this codebase, per
`prisma/schema.prisma`) — never an instruction the agent itself executes
against a bank. See Specification.

**4. What this does *not* change:** no code in this repository has ever
called a banking or fiat-rail API — `PaymentMethod`/`fiatMethod` values
like `'PIX'` are, and always have been, opaque string labels describing
what a human counterparty is expected to do outside Sails Protocol
(RFC-004's own Negotiation State Machine already treats fiat settlement
as something participants coordinate about, never something the
protocol executes). This RFC changes no runtime behavior — it exists so
that invariant is documented, citable, and binding on future work,
rather than merely true by accident of what hasn't been built yet.

## Primitives Used or Extended

None. No new Core primitive, no protocol surface or event change. This
RFC is a documented constraint on OpenAgents' design space (module-level
policy, not a Core primitive per the test in `PROTOCOL_SPECIFICATION.md`
§1.11) and a terminology fix, not new interfaces.

## Principle Alignment

- **Reinforces `PROJECT_CONTEXT.md`'s canonical fiat model statement**
  ("Fiat is always settled directly between participants. The protocol
  never intermediates fiat.") by extending the same invariant explicitly
  to autonomous agents acting under delegated authority, not just to the
  protocol's own request-handling code.
- **Three-Level Hierarchy discipline** (`PROJECT_CONTEXT.md` §2): the
  on-ramp/off-ramp step stays a Level 3 (Reference Implementation)
  integration choice, never something Sails Protocol or QVAC has an
  opinion about.
- **Honesty about what is and isn't built**, the same discipline every
  prior RFC in this index follows: this RFC does not claim any on-ramp
  integration, negotiation-delegation backend, or partner relationship
  exists — it draws a boundary for work that hasn't been built yet
  (`docs/SDK_usecases.md`'s future-vision SDKs, the negotiation-mandate
  concept in `packages/sails-ui`) as much as it documents what's already
  true today.

## Specification

| File | Change |
|---|---|
| `docs/PROJECT_CONTEXT.md` | New corollary note next to the QVAC ecosystem-table row, cross-referencing this RFC — the frozen canonical fiat model statement itself is left verbatim, not reworded (Alternatives Considered #2) |
| `docs/ARCHITECTURE.md` | OpenAgents module description and the Intelligence Layer note (§2) gain the "Crypto-Native Agent" term and a link to this RFC |
| `docs/SDK_usecases.md` | Any QVAC/agent framing checked against "Crypto-Native Agent" terminology; the future negotiation-delegation concept is scoped explicitly against this boundary |
| `docs/rfcs/00-INDEX.md` | This row |
| `src/modules/open-agents/qvac-agent.provider.ts` | Top doc comment gains one line naming this RFC and the Crypto-Native Agent term |
| `src/modules/open-agents/buyer-agent.ts` | `requestUsdtViaPix()`'s doc comment clarified per Decision §3 |
| `packages/sails-ui/` | `AgentIntentionPanel`'s `InfoTooltip` copy states the boundary explicitly (agent never touches PIX/fiat, only assets via WDK) — UI-level reinforcement of a Core rule, not a new UI-only invention |

## Backward Compatibility

No `protocolVersion` bump. Purely additive documentation and comments;
no schema, route, or runtime behavior changes anywhere in this RFC.

## Reference Implementation Plan

1. This RFC file + `00-INDEX.md` row (this pass).
2. Doc propagation into `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`,
   `SDK_usecases.md` (this pass).
3. Code-comment fixes in `qvac-agent.provider.ts`/`buyer-agent.ts` (this
   pass).
4. `packages/sails-ui`'s Agent QVAC surface updated to state the
   boundary in its own copy (this pass, alongside the AI Negotiator UI
   work it was requested together with).
5. **Explicitly not this pass, tracked in `BACKLOG.md`/`docs/TODO.md`:**
   an actual regulated on/off-ramp integration (Reference Wallet-level,
   Level 3, out of Sails Protocol's scope by design — Decision §1); a
   real `NegotiationIntent`-accepting backend route for a delegated,
   bounded agent mandate (today only mocked in `packages/sails-ui`, see
   that package's own README "Next steps").
