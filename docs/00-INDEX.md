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
| 6 | [NODE_ARCHITECTURE.md](NODE_ARCHITECTURE.md) | P2P transport layer (Pears/HyperDHT/Hyperswarm), infrastructure operation |
| 7 | [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md) | The frozen v1.0 spec itself — every primitive, in full |
| 8 | [THREAT_MODEL.md](THREAT_MODEL.md) | Protocol-level security properties every integrator inherits |
| 9 | [SECURITY_MODEL.md](SECURITY_MODEL.md) | Trust mechanisms between strangers, dispute resolution |
| 10 | [ROADMAP.md](ROADMAP.md) | Grant-relative timeline (Months 1-12), not fixed calendar dates |
| 11 | [TODO.md](TODO.md) | The exact, audited gap list against the actual code — not a wishlist |
| 12 | [DEPLOYMENT.md](DEPLOYMENT.md) | Satsails reference implementation deployment only — the protocol itself has no deployment requirements |
| 13 | [CONTRIBUTING.md](CONTRIBUTING.md) | How to propose a change, the RFC trigger conditions |
| 14 | [PROTOCOL_ECONOMY.md](PROTOCOL_ECONOMY.md) | Fee model, incentives, value capture, neutrality |
| 15 | [REFERENCE_IMPLEMENTATIONS.md](REFERENCE_IMPLEMENTATIONS.md) | Satsails/Sails Finance/SailsPay are validation environments, not the protocol itself |
| 16 | [PRINCIPLES.md](PRINCIPLES.md) | The rules every architectural decision is checked against |
| 17 | [GOVERNANCE.md](GOVERNANCE.md) | RFC process end to end, module registration, **§6C Publication Discipline — read this if a citation in these docs doesn't resolve** |
| 18 | [PHILOSOPHY.md](PHILOSOPHY.md) | The *why* behind `PRINCIPLES.md`'s *what* |
| 19 | [PROTOCOL_INVARIANTS.md](PROTOCOL_INVARIANTS.md) | Rules stricter than principles — a technical constitution, never broken, not just guidance |
| 20 | [BACKLOG.md](BACKLOG.md) | Engineering backlog ordered by architectural dependency, audited against real code state |

**Not numbered, added later:** [DEVELOPER_JOURNEY.md](DEVELOPER_JOURNEY.md)
— the same protocol-to-code shape as `SDK_GUIDE.md` section 1's diagram,
walked step by step with each step's real status called out.

**Not in this repository, by design:** `docs/GOVERNANCE.md` §6C
("Publication Discipline") keeps strategic evaluation documents —
due-diligence reports, red-team/resilience reviews, internal
coordination and freeze-milestone records — off the public repository by
default, since they're written to be unflinching about gaps in a way
that reads as a live vulnerability disclosure without the context of
what's since been fixed. Several of the 20 documents above cite these by
name (`MASTER_COORDINATION.md`, `PROTOCOL_FREEZE_REPORT.md`,
`RED_TEAM_REVIEW.md`, `TETHER_DUE_DILIGENCE_REPORT.md`,
`LONG_TERM_VISION.md`) as historical evidence for decisions already
reflected in the numbered docs and RFCs themselves — a citation to one of
these that doesn't resolve to a file in this repo is expected, not a
broken link to chase down.
