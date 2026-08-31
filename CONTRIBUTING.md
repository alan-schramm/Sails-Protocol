# CONTRIBUTING.md
### Sails Protocol — Engineering Handoff · Document 13 of 20

> These conventions were established during an architectural code review
> that found and fixed real violations (see git history / `TODO.md`
> "Resolved Items"). They are not stylistic preferences — each one exists
> because breaking it caused a real bug or a real coupling problem.
>
> **This document covers architecture** (where code goes, module
> boundaries, naming). **`docs/CODE_STYLE.md` (added 2026-08-03) covers
> voice** — comment style, error handling, testing conventions, the
> line-level patterns that make this codebase read as one consistent
> author's work. Read both before contributing, especially if you're a
> different AI tool joining a repo more than one is already working in —
> that's exactly the scenario `CODE_STYLE.md` exists to keep coherent.

---

## 1. Naming Conventions

### Module folders

Use the **official module names**, always prefixed `open-`:

```
modules/open-identity/
modules/open-reputation/
modules/open-settlement/
modules/open-liquidity/
modules/open-p2p/
modules/open-agents/       (future)
modules/open-finance/      (future)
```

Never name a folder after a technical concept instead of the official
module (e.g. `modules/escrow/`, `modules/routing/`, `modules/identity/` are
all **wrong** — they were the actual names found and corrected during code
review, renamed to `open-settlement/`, `open-liquidity/`, and moved out of
`modules/` entirely for identity's P2P transport piece — see below).

### Infrastructure vs Domain

If a file's primary job is moving bytes over a network or talking to a
database/cache — HyperDHT, Hyperswarm, Prisma client setup, Redis client
setup — it belongs in `infrastructure/`, never in `modules/`. A real
example: `pear.service.ts` (HyperDHT/Hyperswarm transport) used to live in
`modules/identity/` and was moved to `infrastructure/p2p/` during review,
because "how peers connect" is an Infrastructure concern, not a "what is an
identity" Domain concern.

### Events

Format: **`{module}.{entity}.{action}`** — always three parts, always
lowercase, always the official module name.

```
✅ openp2p.trade.created
✅ settlement.escrow.locked
✅ reputation.score.updated
✅ liquidity.offer.published

❌ trade.created          (missing module namespace)
❌ escrow.created          (missing module namespace)
❌ TradeCreated            (wrong case, wrong separator)
```

The unnamespaced form (`trade.created`, `escrow.created`) is legacy and was
fully removed from `common/events/event-bus.ts` during review. If you see
it anywhere, it's drift — fix it, don't extend it.

### API routes

Format: **`/v1/{module}/{resource}`**. See `API_REFERENCE.md` for the full
current mapping (including which legacy unnamespaced routes are being
migrated).

---

## 2. The Four-Layer Rule (enforced, not optional)

Every file belongs to exactly one of: **Protocol, Application, Domain,
Infrastructure** (see `ARCHITECTURE.md` section 1 for full definitions).

**Before you write a cross-module database write, stop and ask:** does this
entity belong to my module? If `EscrowService` (OpenSettlement) needs
something to happen to a `Trade` (OpenP2P) or a `User`'s reputation stats
(OpenReputation), it must **emit an event** and let the owning module's
handler perform the write — never reach into another module's tables
directly.

```typescript
// ❌ WRONG — OpenSettlement writing directly to OpenP2P's domain
await prisma.trade.update({ where: { id: tradeId }, data: { status: 'COMPLETED' } })

// ✅ RIGHT — emit an event, let OpenP2P's own handler react
eventBus.emit('settlement.escrow.released', { escrowId, tradeId, ... })
// (handled in common/events/handlers.ts, which performs the Trade write)
```

This exact violation was found in `escrow.service.ts` during review — it
was calling `prisma.trade.update()` and `prisma.user.update()` directly.
Fixed by moving those writes into `common/events/handlers.ts`, triggered by
the `settlement.escrow.*` events `EscrowService` already emitted.

**Check yourself with a grep before submitting any change:**

```bash
# Any hits here from within modules/open-settlement/ are a violation:
grep -rn "prisma\.trade\.\|prisma\.user\." src/modules/open-settlement/
```

---

## 3. Singleton Discipline

If a class needs to be a singleton (one instance per server process), make
sure that's actually true for every field it manages — not just true "most
of the time." A real bug found during review: `PearPeerManager` was a
singleton with a single `keyPair`/`dht`/`swarm`, but its `start(userId,
...)` method suggested multi-user support. Two users calling `start()`
silently clobbered each other.

**The fix pattern to follow for any similar case:** split into an instance
class (one per logical owner — e.g. one `PearNode` per user) and a registry
class (the actual singleton, holding a `Map<ownerId, InstanceClass>`). See
`NODE_ARCHITECTURE.md` section 2 for the worked example.

---

## 4. Dead Code

If a message handler, branch, or function only logs a comment saying
"future: not yet implemented" with no actual behavior, it is dead code —
delete it, don't leave it as a placeholder. A real example removed during
review: `OFFER_ANNOUNCE` and `CHAT_MESSAGE` handlers inside
`pear.service.ts` that only called `console.log(...)`. They were replaced
with a single generic `message` event that the owning domain module (not
the transport layer) decides how to handle.

If you genuinely need a placeholder for a future capability, write a
one-line TODO comment referencing the roadmap phase (`ROADMAP.md`) instead
of a dead branch with fake logic:

```typescript
// TODO(Months 1-3): real HodlHodl API integration — see ROADMAP.md
async isAvailable() { return false }
```

---

## 5. Duplication

Before writing the second occurrence of a data-mapping shape (e.g. mapping
a Prisma row to a protocol-level type), extract a shared helper. A real
example fixed during review: `getOffers()` and `matchOrder()` in
`liquidity.service.ts` both built an identical 8-field object literal
mapping a Prisma `Offer` row into a `LiquidityOffer`. Extracted into
`mapOfferToLiquidityOffer()` — one source of truth for that shape.

---

## 6. How to Add a New Module

1. Confirm the module name against the official list in `ARCHITECTURE.md`
   section 3 — don't invent a new module name without updating
   `PROJECT_CONTEXT.md` and `PROTOCOL_SPECIFICATION.md` first (this is a
   protocol-level decision, not a code-level one).
2. Create `modules/open-{name}/` with a `.service.ts` (business logic) and
   a `.routes.ts` (HTTP wiring) at minimum.
3. Define which Core Primitives (`PROTOCOL_SPECIFICATION.md` section 1)
   your module implements or consumes — most modules should implement
   exactly one primitive and consume several others via events.
4. Add any new entities to `schema.prisma` with `moduleId` defaulting to
   your module's canonical name and `protocolVersion` defaulting to the
   current spec version (see `DATABASE.md` section 1).
5. Add your module's events to `common/events/event-bus.ts`'s
   `SailsEventMap`, namespaced `{yourmodule}.{entity}.{action}`.
6. If your module needs to react to another module's events, write the
   handler in `common/events/handlers.ts` — never import the other
   module's service class directly.
7. Add your module's routes to `API_REFERENCE.md` under
   `/v1/{yourmodule}/`.
8. Update the module status table in `PROJECT_CONTEXT.md` (✅/🏗️/📋).
9. If this module ships its own SDK-facing surface, name it per the
   Named-SDK Rule (`PROJECT_CONTEXT.md` section 3) — a specific,
   concrete, use-case name (like `Sails P2P Trading SDK`), never an
   extension of generic "Sails SDK." Do this at design time, not as a
   rename after the fact.

---

## 6B. Post-Specification-Freeze Discipline (in effect from 2025-07-13)

`MASTER_COORDINATION.md`'s "Sails Protocol v1.0 Specification Frozen"
milestone changes what's expected from anyone — including Claude —
working on this project from here forward:

- **The job is now "implement exactly what's specified," not "design."**
  The 5 RFCs, `PROTOCOL_SPECIFICATION.md`, and `BACKLOG.md` are the
  source of truth for what to build — not a starting point to improve on
  unprompted.
- **An architectural doubt during implementation is never resolved
  unilaterally.** It becomes a written proposal — the problem, the
  trade-off, a recommendation — handed to the CTO for review, the same
  format every RFC already follows. Silently picking an interpretation
  and moving on is exactly the failure mode this rule exists to prevent.
- **No new foundational RFC is expected.** Five is enough for v1.0. A
  genuinely new primitive or module proposal during implementation should
  be treated as a strong signal to stop and ask whether it's actually
  required, not a normal part of the work.

## 7. Documentation Discipline

This handoff package (13 files) is meant to be the single source of truth.
If you make an architectural decision that isn't reflected here, **update
the relevant document in the same change** — don't let institutional
knowledge live only in commit messages or a chat conversation that the next
person won't have access to. That was the exact premise of why this handoff
package was written in the first place; keep it true going forward.

---

## 8. Day-to-Day Workflow (added Mission 9.9, 2026-08-31)

Sections 1–7 above are about **where code goes**. This section is about
**how you actually work** — added because until now nothing in this
repository said so explicitly. Full methodology (why, STOP gates,
evidence, consequence weighting) lives in `docs/ENGINEERING_GOVERNANCE.md`
— this section is the short, operational version, not a duplicate.

**Read in this order if you're new here** (10 minutes, not the whole
20-document handoff):

1. `README.md` — what Sails is.
2. This file, §8–§11 (you're here).
3. `docs/PROJECT_CONTEXT.md` §1–2 if you need the architecture picture.
4. `docs/GITHUB_PROJECT.md` §3 for current program state, once the
   GitHub Project itself exists (`docs/GITHUB_PROJECT.md` §0 explains
   why it may not yet).

**Finding work:** the GitHub Project's "Current Mission" and "Master
Backlog" views (`docs/GITHUB_PROJECT.md` §1.8), or `docs/GITHUB_PROJECT.md`
§2's Bucket A/B classification if the Project isn't live yet. Don't pick
up a Bucket C/D/E item (architectural front, research, or future/parked)
expecting it to be a defined unit of work — it isn't yet.

**Definition of Ready / Done:** `docs/ENGINEERING_GOVERNANCE.md` §5/§9.
Consequence-weighted — a docs fix and a settlement-authority change do
not carry the same ceremony.

**Running tests:**
```bash
npm run test:unit               # no Postgres required
SAILS_INTEGRATION_TEST_DB_CONFIRMED=yes-i-am-sure npm run test:integration:postgres
npx tsc --noEmit                # root; repeat with -p packages/<name> for each workspace package
npm run check:core-boundary
npm run check:conformance
```

**STOP:** `docs/ENGINEERING_GOVERNANCE.md` §6. If you hit one of the
listed conditions (a frozen invariant would need to change, evidence
contradicts the architecture, a required fact can't be established),
stop and write it down — in the Issue or PR — rather than push past it.
A correct STOP is a successful outcome, not a failed one.

**PR evidence:** every PR uses `.github/PULL_REQUEST_TEMPLATE.md`.
Evidence is classified per `docs/ENGINEERING_GOVERNANCE.md` §11
(Hypothesis → Designed/Implemented → Demonstrated → Validated) — state
the real level, don't round up, and never let a shared code path stand
in for independent verification of a different case.

**Challenging architecture:** anyone may — `docs/ENGINEERING_GOVERNANCE.md`
§1. A challenge needs the problem, the property gained, the property
sacrificed, and evidence; it does not need seniority. If it changes a
primitive, a module, or a Constitutional/Operational invariant, it goes
through `docs/GOVERNANCE.md` §5 (RFC process) — see
`docs/ENGINEERING_GOVERNANCE.md` §8 for the pre-flight questions to
answer before drafting one.

**What you may not change silently:** `docs/PROTOCOL_INVARIANTS.md`,
`docs/SEMANTIC_KERNEL.md`, `docs/CORE_ARCHITECTURE.md`, the database
schema, and anything a Mission Freeze report (e.g. `M9 FINAL FREEZE`,
commit `b0c581dd26281f230a3795dfdaa48412574ea5c1`) marks frozen. All of
these change only through the RFC process or an explicitly-authorized
follow-up mission — never as a side effect of an unrelated PR.

## 9. Human + AI Contributors

Applies equally — `docs/ENGINEERING_GOVERNANCE.md` §7. AI-generated code
satisfies the same Definition of Ready/Done, the same tests, the same
STOP gates, and gets the same human review before merge as anyone else's.
"An AI wrote it" is not evidence and is not authorization.
