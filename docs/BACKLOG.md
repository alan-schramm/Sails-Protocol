# BACKLOG.md
### Sails Protocol — Engineering Handoff · Document 20 of 20

> Technical backlog, not a product backlog — ordered by architectural
> dependency, not by feature value. Requested explicitly by the CTO
> following `PROTOCOL_FREEZE_REPORT.md`. Every item cites the RFC or spec
> section it implements, per `GOVERNANCE.md` §6B's traceability
> discipline — this is the first artifact that discipline applies to.

---

## Phase Verification — where the project actually stands

Checked directly against the CTO's proposed 6-stage schedule, not assumed:

| Stage | Status |
|---|---|
| 1. Protocol Freeze | ✅ **Done** — `PROTOCOL_FREEZE_REPORT.md`, confirmed "Sails Protocol v1.0 — Architecture Frozen" |
| 2. Implementation Review | 🔲 **Not started** — this backlog is the entry point |
| 3. Economic Model & Governance | 🟡 **Substantially already done** — `PROTOCOL_ECONOMY.md` (8 sections) and `GOVERNANCE.md` already cover fees, incentives, value capture, neutrality, RFC approval, module registration. One genuine gap (formal version-stability criteria) is correctly deferred to the future "RFC de Operação" phase, not blocking here. |
| 4. Resilience Reviews | 🟡 **Partially done** — `RED_TEAM_REVIEW.md` already covers several attack scenarios that overlap with "Economic Attack" (RT-003, wash-trading reputation laundering) and "Protocol Resilience" (RT-005, governance capture during bootstrap; RT-006/007, name-squatting and arbitration griefing at scale). No dedicated Network Simulation exercise exists yet — genuinely not started. |
| 5. Release Candidate 1 (RC1) | 🔲 **Not started** — blocked on Implementation Review |
| 6. Grant Submission | 🔲 **Not started** — blocked on RC1 |

**The project is not in "ideation" by any reasonable reading of the above
— Protocol Freeze is complete, and two of the four remaining stages
before RC1 are already partially or substantially satisfied by existing
documents.** What's genuinely ahead is Implementation Review (this
backlog) and a Network Simulation exercise within Resilience Reviews.

---

## P0 — Core Primitives (block everything else)

| Item | RFC / Spec | Current Status |
|---|---|---|
| Participant Model | RFC-001, §1.1 | 🔲 Not started — interface not yet in code anywhere |
| Proof Primitive (Claim/Proof/Verification) | RFC-003, §1.8 | 🔲 Not started — no tables, no interfaces in code |
| Transport Provider | RFC-002, §4B | 🟡 Low-risk — `pear.service.ts` already implements the real logic; needs wrapping behind the `TransportProvider` interface, not rebuilding |
| Negotiation State Machine + Channel | RFC-004, §1.4 | 🟢 **First real implementation exists** — `negotiation.service.ts`'s `HumanChatChannel` built on the real `pearNodeRegistry`. Not yet wired to HTTP/WebSocket routes (routes still don't exist) |
| Event Bus update | RFC-003 + RFC-004, `TODO.md` §6B | ✅ **Done** — `claim.*`/`proof.*`/`verification.*`/`dispute.*`/`negotiation.*` events all added and typed |
| Timeline read-model *(new — RFC-007 D5)* | §1.9, RFC-007 | 🔲 Not started — a per-`intentId` ordered projection over the Event Bus above; blocks Evidence Bundle (P2) and the Social Engineering Agent (P3) |
| Timeline hash-chaining *(new — RFC-008 D2)* | §1.9, RFC-008 | 🔲 Not started — `entryHash`/`prevHash` columns on `EscrowEvent`/`ReputationEvent`, computed at write time; build alongside the Timeline read-model above, not as a separate pass |

## P1 — First Proven Module + SDK Core

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenP2P (trade lifecycle + chat) | §3, §3.1 | 🔲 Not started — depends entirely on P0's Negotiation State Machine |
| SDK Core (`@sails/sdk`) | `SDK_GUIDE.md` | 🔲 Not started — depends on P0's Participant Model + Proof Primitive being real, not just typed |

## P2 — Cross-Module Services

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenSettlement | §1.5, §4B | 🟢 **Most complete module today** — `escrow.service.ts` is real, reviewed, and decoupled correctly (`ARCHITECTURE.md` §5's fix already applied). Remaining: real `LightningHodlProvider`/`LiquidCovenantProvider` (both currently throw "not implemented"), and wiring `DisputeResolutionProvider` (RFC-003's Verification) |
| `PendingBankSettlement` status *(new — RFC-007 D3)* | §1.5, RFC-007 | 🟡 Smallest RFC-007 item and the only one touching live code — one `EscrowStatus` enum value + one `assertTransition()` edge in `escrow.service.ts`, additive, no data migration |
| Dispute escalation order + `ArbitrationProvider` *(new — RFC-007 D4)* | §1.9, RFC-007 | 🔲 Not started — depends on Evidence Bundle (below) existing first; introduces the new `ArbitrationProvider` adapter interface, registered per application (not a protocol role) |
| Sails OpenIdentity | §1.1, RFC-001 | 🟡 Module itself still not built, but **the highest-priority security item is closed**: `common/middleware/auth.ts` implements real Ed25519 challenge-response (`RED_TEAM_REVIEW.md` RT-002). Not yet wired into any route — routes don't exist yet — but the middleware is real, not a stub |
| Operational Profiles *(new — RFC-007 D8/D11)* | §1.1, RFC-007 | 🔲 Not started — additive OpenIdentity attribute (`OperationalProfileGrant`), blocked on OpenIdentity module itself |
| Sails OpenReputation | §1.6 | 🔲 Not started |
| Outcome Engine + `rate()` demotion *(new — RFC-007 D8/D9)* | §1.6, RFC-007 | 🔲 Not started — bundle with OpenReputation's first service layer; makes `recordOutcome()` the sole score input, `rate()` informational only, `CancelledByAgreement` always Neutral |
| **Sails OpenProof** *(new — RFC-006)* | §1.8, RFC-003, RFC-006 | 🟡 **Data model already real** — `Claim`/`Proof`/`EvidenceVerification` tables in `DATABASE.md`, TypeScript interfaces in `common/types`. Remaining: `modules/open-proof/proof.service.ts` — the actual `assertClaim()`/`submitProof()`/`verify()` service logic doesn't exist yet |
| Proof Registry, `EvidenceProvider`, Evidence Bundle *(new — RFC-007 D1/D2/D6)* | §1.8, RFC-007 | 🔲 Not started — scope these into OpenProof's first service layer alongside `proof.service.ts` above rather than as a later addition (per RFC-007's own Reference Implementation Plan) |
| `TimestampAnchor` (`anchorProof` on `EvidenceReference`) *(new — RFC-008 D1)* | §1.8, RFC-008 | 🔲 Not started — scope alongside `EvidenceProvider` above; first implementation should be `opentimestamps` (Bitcoin-anchored), not `rfc3161`, per RFC-008's own Reference Implementation Plan |

## P3 — Advanced / Aspirational Modules

| Item | RFC / Spec | Current Status |
|---|---|---|
| Sails OpenLiquidity | §1.3, §4B | 🟢 **Second most complete module** — `liquidity.service.ts` is real, deduplicated (`ARCHITECTURE.md` §5). Remaining: real HodlHodl integration (currently stubbed, `isAvailable()` returns `false`) |
| Sails OpenFinance | §4B, `REFERENCE_IMPLEMENTATIONS.md` §3 | 🔲 Not started — blocked on real external adapters (Morpho, etc.) |
| Sails OpenAgents | §1.7 (includes the `learn()` step) | 🔲 Not started — blocked on QVAC integration, which is at 0% per `TETHER_DUE_DILIGENCE_REPORT.md` finding 12 |
| Social Engineering Agent *(new — RFC-007 D7)* | §1.7, RFC-007 | 🔲 Not started — blocked on OpenAgents itself and on the Timeline read-model (P0) it reads from |

---

## Why the Order Differs From Pure Priority

Strict priority order alone would suggest building OpenP2P (P1) before
touching OpenSettlement or OpenLiquidity (P2/P3) — but those two already
have real, reviewed code, while OpenP2P has none. The practical sequence
for whoever picks this up: **finish what's already 70-80% real (P2/P3's
Settlement and Liquidity adapters) opportunistically alongside P0/P1 work**,
rather than leaving working code idle while building P1 from zero. The
priority tiers above reflect architectural dependency order — what
blocks what — not a strict "do P0 fully, then P1 fully" sequence.

---

## Traceability Rule (per `GOVERNANCE.md` §6B, now in effect)

Every commit implementing an item above must cite its RFC or spec section
in the commit message or code comment. Any implementation work that
doesn't map to a row in this backlog needs a new RFC (`RFC-006` onward)
before it starts, not after.
