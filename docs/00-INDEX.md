# 00-INDEX.md
### Sails Protocol — Engineering Handoff · Master Index

> Every document under `docs/` (except this one and `docs/rfcs/`, which
> has its own index at `docs/rfcs/00-INDEX.md`) carries a "Document N of
> 20" header implying a canonical reading order — this file is that
> order, made explicit. Read `PROJECT_CONTEXT.md` first regardless of
> what else you're here for; everything downstream assumes it.

| # | Document | What it covers |
|---|---|---|
| 1 | [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Positioning, Ideal Customer Profile, the Developer Journey, the Named-SDK Rule — start here |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | Layer separation (Domain/Application/Protocol/Infrastructure), the 6 formal Core components, module boundaries, real vs. stub file inventory |
| 3 | [DATABASE.md](DATABASE.md) | Schema, status enums and their valid transitions, the moduleId/protocolVersion convention |
| 4 | [API_REFERENCE.md](API_REFERENCE.md) | Every HTTP/WebSocket route, the Intent-oriented canonical verbs, error response shape |
| 5 | [SDK_GUIDE.md](SDK_GUIDE.md) | `@sails/sdk` (`packages/sails-sdk`) interface spec — what's real in v0.1 vs. still aspirational |
| 6 | [API_STABLE.md](API_STABLE.md) | The frozen `@sails/sdk` public API (v0.1, no breaking changes until v1) — every module, both its protocol name and friendly alias, every real method |
| 7 | [NODE_ARCHITECTURE.md](NODE_ARCHITECTURE.md) | P2P transport layer (Pears/HyperDHT/Hyperswarm), infrastructure operation |
| 8 | [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md) | The frozen v1.0 spec itself — every primitive, in full. The only document in this handoff using RFC 2119 (MUST/SHOULD/MAY) normative language (§0), with a consolidated conformance checklist at §6 |
| 9 | [THREAT_MODEL.md](THREAT_MODEL.md) | Protocol-level security properties every integrator inherits |
| 10 | [SECURITY_MODEL.md](SECURITY_MODEL.md) | Trust mechanisms between strangers, dispute resolution |
| 11 | [ROADMAP.md](ROADMAP.md) | Grant-relative timeline (Months 1-12), not fixed calendar dates |
| 12 | [TODO.md](TODO.md) | The exact, audited gap list against the actual code — not a wishlist |
| 13 | [DEPLOYMENT.md](DEPLOYMENT.md) | Satsails reference implementation deployment only — the protocol itself has no deployment requirements |
| 14 | [CONTRIBUTING.md](CONTRIBUTING.md) | How to propose a change, the RFC trigger conditions |
| 15 | [PROTOCOL_ECONOMY.md](PROTOCOL_ECONOMY.md) | Fee model, incentives, value capture, neutrality |
| 16 | [REFERENCE_IMPLEMENTATIONS.md](REFERENCE_IMPLEMENTATIONS.md) | Satsails/Sails Finance/SailsPay are validation environments, not the protocol itself |
| 17 | [PRINCIPLES.md](PRINCIPLES.md) | The rules every architectural decision is checked against |
| 18 | [GOVERNANCE.md](GOVERNANCE.md) | RFC process end to end, module registration, **§6C Publication Discipline — read this if a citation in these docs doesn't resolve** |
| 19 | [PHILOSOPHY.md](PHILOSOPHY.md) | The *why* behind `PRINCIPLES.md`'s *what* |
| 20 | [PROTOCOL_INVARIANTS.md](PROTOCOL_INVARIANTS.md) | Rules stricter than principles — a technical constitution, never broken, not just guidance |
| 21 | [BACKLOG.md](BACKLOG.md) | Engineering backlog ordered by architectural dependency, audited against real code state |

**Not numbered, added later:** [DEVELOPER_JOURNEY.md](DEVELOPER_JOURNEY.md)
— the same protocol-to-code shape as `SDK_GUIDE.md` section 1's diagram,
walked step by step with each step's real status called out.
[HANDOFF.md](HANDOFF.md) — short, practical brief for whoever picks this
repo up next: `demo-satsails-qvac.ts`'s current state, exact WDK/Pears/
QVAC dependency versions, and `TODO.md`'s items ranked by what to attack
first. [TRANSACTION_WALKTHROUGH.md](TRANSACTION_WALKTHROUGH.md) — **read
this if you want to see one real P2P trade move through every piece at
once** (QVAC → Pears → Intent Engine → Capability check → OpenSettlement
→ WDK release), what's genuinely real vs. emulated at each step, and
exactly what changes — with real example HTTP calls — when RFC-014's
capability check and RFC-015's two-person release control are both
turned on. Added specifically so this doesn't stay scattered across a
dozen files' own doc comments.
[SDK_usecases.md](SDK_usecases.md) — a vision/roadmap document, not a
spec: how the real core (Capability Registry, OpenReputation, Pears
`peerId`, QVAC) could extend into future named SDKs (Breez-style, one
brand per sharply-scoped product — `PROJECT_CONTEXT.md` §3's Named-SDK
Rule). Does **not** change today's actual scope — that's still exactly
one shipping product, the Sails P2P Trading SDK.
[TRUST_BOUNDARY.md](TRUST_BOUNDARY.md) — who trusts whom: a boundary
diagram from the user's device through to the settlement chain, and,
per boundary, who can lie, what's verified, and where in the code that
verification lives. Complements `THREAT_MODEL.md` (the attack catalog)
and `SECURITY_MODEL.md` (why a stranger can be trusted at all) with the
structural question neither answers directly.
[CRYPTOGRAPHIC_MODEL.md](CRYPTOGRAPHIC_MODEL.md) — the actual
cryptographic mechanics (Ed25519 identity, challenge-response replay
protection, sealed-box P2P payload encryption, the `IntentEvent` hash
chain) consolidated in one place, including an honest account of what
each mechanism does *not* guarantee (e.g. no forward secrecy yet).
Previously scattered as file-level doc comments across `ARCHITECTURE.md`
and absent from `NODE_ARCHITECTURE.md` entirely.
[ECOSYSTEM_INTEGRATIONS.md](ECOSYSTEM_INTEGRATIONS.md) — a vision/
positioning document, not a spec (same category as `SDK_usecases.md`):
how Sails Protocol could relate to external settlement networks, custody
providers, and adjacent verticals (Lightning, Liquid, RGB, Ark, Fedimint,
Nostr, EVM/Solana/TRON, DePIN, RWA, and others) as a coordination layer,
never a replacement — with an explicit comparison against Bisq/Hodl Hodl
and a corrected, narrow regulatory-neutrality claim. Nothing in it is
built; none of it changes today's scope.

**Not in this repository, by design:** `docs/GOVERNANCE.md` §6C
("Publication Discipline") keeps strategic evaluation documents —
due-diligence reports, red-team/resilience reviews, internal
coordination and freeze-milestone records — off the public repository by
default, since they're written to be unflinching about gaps in a way
that reads as a live vulnerability disclosure without the context of
what's since been fixed. Several of the 21 documents above cite these by
name (`MASTER_COORDINATION.md`, `PROTOCOL_FREEZE_REPORT.md`,
`RED_TEAM_REVIEW.md`, `TETHER_DUE_DILIGENCE_REPORT.md`,
`LONG_TERM_VISION.md`, and — added to this list 2026-07-19 after a
consolidation audit found them cited but unlisted —
`03-implementation_plan.md` and `04-Deepseek Review.md`) as historical
evidence for decisions already reflected in the numbered docs and RFCs
themselves — a citation to one of these that doesn't resolve to a file
in this repo is expected, not a broken link to chase down.
