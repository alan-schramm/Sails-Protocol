# GITHUB_PROJECT.md

> **Sails Protocol — Engineering Operating System, Document 2 of 2**
> (companion: `docs/ENGINEERING_GOVERNANCE.md`). Written during Mission
> 9.9, 2026-08-31. This document is two things at once, disclosed
> explicitly rather than left ambiguous:
>
> 1. **A configuration plan** for a GitHub Project (v2) that does not
>    yet exist — see §0, this could not be created or verified during
>    this mission (a real, disclosed tooling blocker, not a silent gap).
> 2. **The current program-state snapshot** — Master Backlog
>    classification, residuals, Issue taxonomy, labels — which is real
>    and current as of the frozen commit below, independent of whether
>    the Project itself exists yet.

---

## 0. GitHub access/capabilities discovered — the blocker, stated precisely

Checked directly, not assumed:

```
$ gh auth status
✓ Logged in to github.com account alan-schramm
  Token scopes: 'gist', 'read:org', 'repo', 'workflow'

$ gh project list --owner alan-schramm
error: your authentication token is missing required scopes [read:project]
To request it, run:  gh auth refresh -s read:project
```

**GitHub Projects v2 (both read and write) is blocked** — the
authenticated token has no `project`/`read:project` scope. This was not
worked around by silently escalating the token's scopes: granting a new
OAuth scope is a standing permission change on the user's own
credentials and was left for the user to decide, not assumed on their
behalf.

**What this means concretely:** no GitHub Project was created, no field
was configured, no view was built, no automation was wired, during this
mission. Everything from §1 onward is a **plan**, ready to execute the
moment `project` scope is granted — either interactively
(`gh auth refresh -s project`) or via a fine-grained PAT with Projects
read/write.

**Repository-level GitHub state, confirmed directly** (all read via
`gh api`, `repo` scope is sufficient for these):

| Item | State |
|---|---|
| Branch protection on `main` | **None** (`404 Branch not protected`) |
| Collaborators | `alan-schramm` (admin), `renipinto` (write) — no GitHub Team exists; this is a personal-account repo, not an organization, so `@org/team` CODEOWNERS syntax is not usable at all |
| Open Issues | 0 |
| Pull Requests | 1 open, all others closed/merged dependabot dependency-bump PRs |
| `.github/ISSUE_TEMPLATE/` | did not exist before this mission |
| `.github/PULL_REQUEST_TEMPLATE.md` | did not exist before this mission |
| `CODEOWNERS` | did not exist before this mission |
| Labels | 9 GitHub defaults + `dependencies`/`javascript`/`eas-build` (auto-created by Dependabot/other tooling) — nothing Sails-specific |
| `.github/workflows/` | `ci.yml`, `ci-tests.yml`, `codeql.yml` — real, already running |

---

## 1. Project configuration plan (not yet executed)

**Name:** `Sails Protocol — Development` (no existing repository
convention suggests a better name).

**Create it** (once `project` scope is available):

```bash
gh project create --owner alan-schramm --title "Sails Protocol — Development"
```

### 1.1 Status field (native, values challenged and trimmed)

Values: **Backlog, Ready, In Progress, Validation, Blocked, Done.**

Two candidates from this mission's own brief were considered and
**rejected**:

- **"Proposed"** — rejected. A protocol-level proposal already has a
  real, adequate lifecycle: the RFC itself (`docs/GOVERNANCE.md` §5,
  Draft → Discussion → Decision), tracked as a file in `rfcs/` with its
  own `Status:` header. Mirroring that in a Project status would be a
  second, competing tracker for the same fact. A Project Issue is only
  created once there is trackable *work* — for an RFC-requiring change,
  that work item is "draft the RFC," which fits Backlog/Ready/In
  Progress like any other task.
- **"Frozen"** — rejected as a Status value. A frozen mission (e.g. M9)
  is `Done` at the Status level; "frozen" additionally describes its
  *evidence* level (§1.3's Evidence Status field, value `Validated`, or
  the doc-only `FROZEN` vocabulary in `ENGINEERING_GOVERNANCE.md` §11
  for a fully closed mission). Adding a 7th Status value that means
  roughly "extra done" duplicates a distinction the Evidence Status
  field already makes better.

### 1.2 Workstream field (single-select)

`Core, SDK, OpenP2P, OpenSettlement, OpenIdentity, OpenReputation,
OpenProof, OpenLiquidity, Transport, Agents, Security, Documentation,
Research, Repository/CI`

Every value maps to a real module folder or a real, already-established
concern in this codebase (`modules/open-*`, `packages/sails-sdk`,
`packages/sails-core`, `.github/workflows/`). **Rejected as separate
values:** `Privacy`, `Protocol UX`, `Productization` — none has any real
code today (this mission's own §24/§29 explicitly forbid designing
Privacy or UX architecture now), so a standing Workstream value with zero
possible items until a future mission begins is premature. Work on these
fronts, when it starts, is tracked under `Research` until it has a real
module to attach to — consistent with §3's bucket-D treatment of named
but undocumented fronts.

### 1.3 Priority field (single-select)

`P0, P1, P2, P3` — standard, unchallenged.

### 1.4 Evidence Status field (single-select, trimmed from the mission's
own 7-value suggestion)

`Hypothesis, Designed/Implemented, Demonstrated, Validated`

`ENGINEERING_GOVERNANCE.md` §11 defines a richer 7-value vocabulary
(adding `Designed`, `Implemented`, `Supported`, `Frozen` as distinct
states) for use in **docs and PR text**, where the distinction between
"implemented" and "supported-by-analogy" or between "validated" and
"frozen" genuinely matters and has room to be explained. A Project field
is a glance-level filter, not a proof — collapsing to 4 values keeps it
usable without pretending a quick-glance field can carry the same
precision as a written Sacrifice Check. **This field is never
automated** (§1.6) — only a human sets or advances it, because judging
Demonstrated vs. Validated requires reading the actual evidence.

### 1.5 Risk / Consequence field (single-select)

`Reversible, Shared Semantics, Protocol Sensitive,
Economic/Security Critical` — maps directly to
`ENGINEERING_GOVERNANCE.md` §4's consequence table. Unchallenged, kept
exactly as proposed, since it is the field that actually drives which
Definition-of-Ready/Done tier and which PR-template sections apply.

### 1.6 Mission / Milestone field (single-select, grown as needed)

Current real values: `M9.9 (current)`, `M10 (unblocked, not started)`.
Historical values for completed work are not backfilled into the Project
(§2 below explains why) but the field exists so future missions have
somewhere to attach.

### 1.7 Fields deliberately rejected entirely

- **Dependency** — GitHub Projects v2 already has native issue-linking
  ("blocked by" / task lists) that expresses this better than a free-text
  field could; adding a duplicate field would just drift out of sync
  with the real links.
- **Owner** — GitHub's native Assignees field already covers this; a
  second "Owner" field would be a second, driftable source of the same
  fact.

### 1.8 Views

Eight, matching the mission's own candidate list — none dropped, none
added, because each answers a genuinely distinct question from
§"Project as operational interface" below, and a smaller set would force
someone to build the same filter ad hoc every time instead of once:

1. **Current Mission** — filter: Mission/Milestone = current value.
2. **Master Backlog** — everything, grouped by Workstream.
3. **Architecture Roadmap** — filter: Risk = Protocol Sensitive OR
   Economic/Security Critical, grouped by Status.
4. **Security & Technical Debt** — filter: label `technical-debt` OR
   Risk = Economic/Security Critical.
5. **Research / Hypotheses** — filter: Workstream = Research.
6. **SDK & Integrations** — filter: Workstream = SDK.
7. **Validation / Evidence** — filter: Status = Validation OR Evidence
   Status != Validated, for anything still owed proof.
8. **Completed / Frozen** — filter: Status = Done.

### 1.9 Automations (only the honest ones)

```
new Issue                          → Status: Backlog
Issue assigned + moved manually    → Ready / In Progress (human-driven,
                                      not auto-inferred from assignment
                                      alone — an assignee doesn't mean
                                      work has actually started)
PR opened, linked to an Issue      → Status: In Progress
PR merged, Risk = Reversible
  or Shared Semantics              → Status: Done
PR merged, Risk = Protocol
  Sensitive or Economic/Security
  Critical                        → Status: Validation (NOT Done —
                                      a human moves it to Done only
                                      after confirming the evidence,
                                      per §"No evidence inflation" below)
```

**Deliberately never automated:** Evidence Status. `PR merged ≠ property
validated` — this mission's own explicit instruction — is exactly the
lie an "auto-set Evidence Status = Validated on merge" rule would tell.
No automation exists or is planned that sets this field to anything.

---

## 2. Master Backlog — classification, not conversion to Issues

**No Issues were bulk-created from the backlog.** Converting every
conceptual item below into a GitHub Issue would turn architecture into
issue noise — the opposite of this mission's goal. Items are classified
into buckets; only Bucket A gets a real Issue candidate, and even then,
none were opened during this mission (0 Issues exist in the repo as of
this writing) — opening the first real Issues is deliberately left as
the next, natural action for whoever picks up M10 or a Bucket-A item,
not manufactured here to make this report look more populated.

### A. Executable now
Nothing in the existing `docs/BACKLOG.md` P0/P1 table is actually
"executable now" — it's ~95% already ✅ Done (verified against real code
throughout this session and prior ones). The one live executable-now
front is **M10 — SDK Adapter** (§4 below).

### B. Near-term
- `docs/TECHNICAL_DEBT_AUDIT.md` items 40–43 (registered this freeze,
  §5 below) — each is a bounded, scoped, well-understood gap.
- CI reliability: the swagger-ui parallel-load flake (§6 below).
- SDK/repository hygiene items already named in `docs/TECHNICAL_DEBT_AUDIT.md`
  (items 25–30: SDK interface, input validation, error types, `/v1/`
  hardcoding, `disconnect()`, `@tanstack/react-query` peer dependency).

### C. Architectural fronts
- `docs/BACKLOG.md`'s H1–H9 MULTISIG production-hardening debt
  (dust validation, `keyIndexFor()` collision strategy, outpoint
  persistence, client key recovery design).
- `INV-OP-9`'s own disclosed gap: no shared wallet-side PSBT-construction
  primitive exists yet (`docs/PROTOCOL_INVARIANTS.md`).
- Multi-Attempt Execution Identity (T1/T2) — `docs/TECHNICAL_DEBT_AUDIT.md`
  item 40, needs its own scoped investigation mission before any
  implementation, per the M9-TC report that found it.

### D. Research / Hypothesis — **named only, not elaborated**
The following fronts were named in Mission 9.9's own brief. **None has
any write-up anywhere in this repository** (confirmed directly — a
repository-wide search for each name returned nothing outside this
document and `ENGINEERING_GOVERNANCE.md`'s own reference to this list).
They are registered here at exactly the abstraction level that's honest:
a name, not a scope, not a design, not a commitment.

Capability Composition Architecture · Capability Negotiation (exact
mechanism) · Cross-Stack Interaction · Ecosystem Flywheel Hypothesis ·
Network Effect Measurement · WDK-style Developer Abstraction Principle ·
Sails Composition Principle · ZK / anonymous credentials · Sails
Trilemma formulation · Portable Economic Proofs · Pubky · PKARR · Nostr
as transport · Pear as mandatory transport · a universal
interoperability layer · Automatic World-C convergence (registered more
concretely as Technical Debt item 40's dependency, see Bucket C) ·
Arbitration Market (beyond what RFC-021 already implements) · Context /
Knowledge Architecture (the full sweep — `ENGINEERING_GOVERNANCE.md` §13
only lays the vocabulary) · Archify · Whitepapers · Engineering
Philosophy (as a dedicated document, distinct from
`docs/PHILOSOPHY.md`) · Final External Red Team.

**DLC was removed from the roadmap in a prior session and is not
reintroduced here.**

#### D.1 Agent & Developer Interfaces (registered 2026-08-31, addendum)

A narrower, more concrete sub-front than the flat list above, worth its
own grouping because it's a real question already partially live in this
repository (`.github/agents`, `.github/skills` exist; MCP/WebMCP were
already named in the Mission 9.9 brief's own Master Backlog preservation
list). Registered here exactly as raised — **a design hypothesis, not
frozen architecture, and not implemented by this addendum**:

- ⬜ Sails CLI / Developer Tooling
- ⬜ Canonical Interaction / Tool Surface
- ⬜ MCP Server
- ⬜ WebMCP Adapter
- ⬜ CLI Adapter
- ⬜ Capability discovery / introspection
- ⬜ CLI conformance / verification tooling
- ⬜ Human / Agent semantic parity

**CLI specifically splits into two, deliberately not treated as one
item:**

1. **Developer/Protocol Tooling CLI** — inspecting canonical objects
   (`sails inspect trade`, `sails verify outcome/evidence/correspondence`,
   `sails conformance run`, `sails providers list`) — the stronger
   candidate, since it's close to what `docs/ENGINEERING_GOVERNANCE.md`
   §3.2's Credible Exit direction already implies: someone should be able
   to inspect/verify Sails artifacts without depending on any one party's
   UI. Not scoped or scheduled here — a named candidate only.
2. **Full trading-client CLI** (create trades, negotiate, sign, settle,
   operate agents) — a future hypothesis, explicitly **not** something to
   scope now; it depends on SDK/OpenP2P maturing further first.

**The open architectural question, registered for future investigation,
not answered here:** whether CLI, MCP, and WebMCP should each
independently reimplement protocol semantics, or whether they should all
be thin adapters over one **Canonical Tool/Interaction Surface** — the
same "one canonical construction/verification path per concern" discipline
`docs/PROTOCOL_INVARIANTS.md`'s `INV-OP-9` already applies to MULTISIG
transaction construction, generalized to *tool* surfaces instead of
*settlement* construction. If true, `verify correspondence` would carry
identical semantics whether invoked by a developer via CLI, Claude via
MCP, a browser agent via WebMCP, or a wallet via the SDK — "different
interfaces, same economic meaning." This is not decided, not designed,
and not authorized for implementation by this registration — it is named
so a future investigation mission has a fixed starting question instead
of re-discovering it from a chat transcript.

### E. Future / Parked
Everything in `docs/ECOSYSTEM_INTEGRATIONS.md` and `docs/SDK_usecases.md`
— both already self-labeled "vision/roadmap, not a spec," unchanged by
this mission.

### F. Completed / Frozen
- Constitution / `docs/PROTOCOL_INVARIANTS.md`
- `docs/SEMANTIC_KERNEL.md`
- `docs/CORE_ARCHITECTURE.md` / `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md`
- M0–M8.6, M9-R, M8-RF, M9-F, M9-EI, M9-TC
- **M9 FINAL FREEZE** — `SAILS MISSION 9 RECOVERY BASELINE`,
  commit `b0c581dd26281f230a3795dfdaa48412574ea5c1`

---

## 3. Current program state

```
COMPLETED / FROZEN
  Constitution, Semantic Kernel, Core Architecture, M0–M8.6,
  M9-R, M8-RF, M9-F, M9-EI, M9-TC, M9 FINAL FREEZE
  → baseline b0c581dd26281f230a3795dfdaa48412574ea5c1

CURRENT
  M9.9 — Sails Engineering Operating System
  (this document + ENGINEERING_GOVERNANCE.md + templates + CODEOWNERS)

UNBLOCKED, NOT STARTED
  M10 — SDK Adapter

REGISTERED RESIDUALS  (see §5 — not equal priority)
  1. Multi-Attempt Execution Identity (T1/T2)
  2. Settlement Consistency Read Surface
  3. Volume Semantics after settlement invalidation
  4. Independent Correspondence Re-verifiability
  5. CI Reliability — parallel-load test flake
  6. SDK / repository production hygiene (named, not scheduled)

Protocol fee: 0%. Intended 0.40% remains OFF.
Multi-rail recovery: NOT demonstrated (MULTISIG only).
Production readiness: NOT claimed.
```

---

## 4. M10 tracking (prepared, not started)

A tracking placeholder for the next mission — **not** a GitHub Issue
(none was created, per §2's own discipline: this is a single, well-known
next step, not backlog noise), recorded here so the Project's "Current
Mission" view has something real to point at once the Project exists:

```
Title:       M10 — SDK Adapter
Status:      Ready / Unblocked
Started:     NOT STARTED
Depends on:  SAILS MISSION 9 RECOVERY BASELINE (b0c581d) — satisfied
Definition:  to be provided by the mission brief that begins M10
```

No M10 code, design, or scope decision was made by this mission.

---

## 5. Registered residuals (not equal priority)

| # | Residual | Source | Priority signal |
|---|---|---|---|
| 1 | Multi-Attempt Execution Identity (T1/T2) | `docs/TECHNICAL_DEBT_AUDIT.md` #40, M9-TC | Architectural front (Bucket C) — needed only before any future automatic World-C claim, not before M10 |
| 2 | Settlement Consistency Read Surface | `docs/TECHNICAL_DEBT_AUDIT.md` #41, M9-TC | Near-term (Bucket B) — small, additive, no schema change |
| 3 | Volume Semantics after invalidation | `docs/TECHNICAL_DEBT_AUDIT.md` #42, M9-TC | Needs a product decision before any code — Product Direction owns the next step, not Engineering |
| 4 | Independent Correspondence Re-verifiability | `docs/TECHNICAL_DEBT_AUDIT.md` #43, M9-EI/M9-TC | Non-blocking, related to future Credible Exit/Conformance work |
| 5 | CI Reliability — parallel-load flake | M9 Final Freeze report §29/§35 | See §6 — real, understood, not an M9 defect |
| 6 | SDK / repository hygiene | `docs/TECHNICAL_DEBT_AUDIT.md` #25–30 | Deliberately not solved broadly now (mission §30's own instruction) — belongs to a future SDK/DX/hygiene mission |

---

## 6. CI Reliability residual — precise, not inflated

The M9 Final Freeze's first non-Postgres regression run (2441s) had 4
suites / 14 tests time out under `--maxWorkers=50%` parallel load:
`joinTradeAuthorization`, `securityHeaders`, `cors`, `healthLiveReady` —
all suites whose `buildAppWithEnv()` registers `@fastify/swagger-ui`,
already documented in those files' own comments as slow under
contention. Re-run in isolation immediately: 4/4 suites, 22/22 tests
passed. The second full run (2156s) was 147/147 suites clean with no
intervention. **This is CI/test-infrastructure debt — a resourcing
artifact of parallel workers contending for one slow registration path
— not a Mission 9 protocol defect, and it was not fixed during Mission
9.9** (this mission's own §31 instruction: register it, don't fix it
unless a trivial metadata-only correction is needed for Project
organization — none was).

---

## 7. Issue taxonomy

**Rule** (`ENGINEERING_GOVERNANCE.md`'s companion to this doc, stated
here since it's an Issue/label mechanic): **a Project field carries
workflow metadata that changes as work progresses (Status, Evidence
Status). A label carries intrinsic classification that doesn't change
once an Issue exists (what kind of Issue this is, what risk class it
touches).** Putting the same fact in both places would let them drift.

### 7.1 Type labels

Existing GitHub defaults, kept, not duplicated: `bug`, `documentation`,
`enhancement`, `question`, `good first issue`, `help wanted`,
`duplicate`, `invalid`, `wontfix`.

New, created this mission (`gh label create`):

| Label | Color | Meaning |
|---|---|---|
| `architecture` | `#5319e7` | Touches protocol/architecture — routes through `docs/GOVERNANCE.md`'s RFC process |
| `research` | `#c5def5` | Investigation/hypothesis, not yet a commitment |
| `technical-debt` | `#fbca04` | A registered, disclosed gap (`docs/TECHNICAL_DEBT_AUDIT.md`) |

**Rejected as a new label:** `implementation` — redundant with the
existing `enhancement` default; **`validation`** — a Status value
(§1.1), not an intrinsic classification, would duplicate the Project
field the mission's own §12 rule warns against.

### 7.2 Risk labels

| Label | Color | Meaning |
|---|---|---|
| `protocol-sensitive` | `#b60205` | Touches a primitive, state machine, or invariant |
| `security-sensitive` | `#b60205` | Touches authority, signing, or value movement |
| `stop-gate` | `#000000` | A STOP was recorded on this Issue/PR (`ENGINEERING_GOVERNANCE.md` §6) — a legitimate outcome, not a failure marker |

**Deliberately not created as separate labels:** `privacy-sensitive`,
`economic-sensitive` — folded into `security-sensitive` for now (both
already correlate with authority/value-movement concerns in every real
case this repository has had to date); split them out the first time a
real Issue needs the distinction and doesn't fit either existing label,
not preemptively.

### 7.3 Type templates → labels applied automatically

See `.github/ISSUE_TEMPLATE/` — each template applies exactly one type
label on creation; risk labels are applied by a human triager, since
risk classification requires judgment the template's own front-matter
cannot supply.

---

## 8. Branch / merge governance — recommended, not applied

**Not applied during this mission** — changing repository-wide branch
protection is a standing configuration change with real, immediate
consequences for how `alan-schramm`/`renipinto` currently push to
`main` (confirmed: no protection exists today, so direct pushes to
`main` presumably still happen). Per this mission's own instruction
("do not change repository settings blindly... document the recommended
target state"), and per the general safety discipline this session
already follows for any standing-configuration change, this is left as
an explicit recommendation for `alan-schramm` (the only admin) to enact
when ready, not something this mission enacted on his behalf.

**Recommended target state**, once there are enough real contributors
and CI runs to make it non-disruptive:

```bash
gh api -X PUT repos/alan-schramm/Sails-Protocol/branches/main/protection \
  -f required_status_checks[strict]=true \
  -f "required_status_checks[contexts][]=ci-tests" \
  -f enforce_admins=false \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f restrictions=null \
  -f allow_force_pushes=false \
  -f allow_deletions=false
```

`enforce_admins=false` is deliberate in this recommendation — with a
2-person collaborator set and no dedicated release process yet, forcing
the admin through the same review gate as everyone else is premature;
flip it once there's a third reviewer. Signed commits and linear-history
requirements are **not** recommended at this stage — no justification
for either was found in this repository's current practice.

---

## 9. What was deliberately NOT changed

- `docs/GOVERNANCE.md` — already is the Architecture Change Process
  (RFC/Core-RFC), referenced, not duplicated.
- `CONTRIBUTING.md`'s existing architecture-conventions content
  (naming, Four-Layer Rule, singleton discipline, dead code,
  duplication, module-addition steps) — untouched; a new section was
  added, not a rewrite.
- `docs/BACKLOG.md` — untouched; it is a historical, mostly-✅-Done
  technical backlog and remains valid as that specific record. The
  broader "Master Backlog" the mission describes lives in §2 of this
  document instead, since it covers strategic fronts `docs/BACKLOG.md`
  was never scoped to hold.
- `docs/00-INDEX.md` — two lines added only, pointing to the two new
  documents; no re-ordering, no rewrite of the existing 21-document map.
- `docs/CHANGELOG.md` — left stale exactly as found; reconciling it is
  unrelated pre-existing debt, not created or worsened by this mission.
- Branch protection, repository visibility, collaborator permissions —
  untouched (§8).
- No Issues bulk-created (§2).
- No GitHub Project created (§0 — blocked, not silently skipped).
