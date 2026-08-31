# ENGINEERING_GOVERNANCE.md

> **Sails Protocol — Engineering Operating System, Document 1 of 2**
> (companion: `docs/GITHUB_PROJECT.md`). Written during Mission 9.9,
> 2026-08-31, following the Mission 9 Recovery Baseline freeze
> (`b0c581dd26281f230a3795dfdaa48412574ea5c1`). This document exists so
> a future human or AI contributor can join Sails and know **why** the
> process exists, **who** decides what, and **when to STOP** — without
> re-deriving it from git history or a chat transcript.
>
> **This document = why / authority / gates / methodology.**
> `CONTRIBUTING.md` = how a contributor works day-to-day.
> `docs/GOVERNANCE.md` = how the protocol *specification itself* changes
> (the RFC process) — this document does not duplicate it, only connects
> it to day-to-day Issue/PR mechanics.
> `docs/GITHUB_PROJECT.md` = the current program state and GitHub Project
> configuration.
>
> One canonical source per concept. If you find the same rule stated
> differently in two places, that is a bug in this documentation — file
> it as such.

---

## 1. The Central Governance Principle

> **Anyone may challenge the architecture. No one may silently redefine it.**

Seniority does not grant unilateral architectural authority — not for a
human, not for an AI agent, not for the original author of the code being
changed. A contributor may challenge an existing decision at any time, by
providing:

- the problem;
- a counterexample, where one applies;
- the property to be gained;
- the property potentially sacrificed;
- architectural, protocol, security, privacy, UX, and compatibility impact;
- evidence;
- migration consequences;
- a proposed validation strategy.

**Preference is not evidence. Seniority is not evidence. Familiarity is
not evidence. Framework preference is not architecture.**

> **Experience grants the right to challenge a decision, not the right to
> bypass the process that protects it.**

A strong counterexample can override an old design — see §8, "Architecture
Change Process." The architecture is not sacred. The process is.

---

## 2. Repository, Project, Issue, PR — the mental model

- **Repository explains the architecture.** `docs/`, `rfcs/`, the code
  itself, and this file are the durable record of *what Sails is and why*.
- **GitHub Project explains the work.** What's being done right now, by
  whom, in what order — operational, not architectural memory. See
  `docs/GITHUB_PROJECT.md`.
- **Issues define executable units of work.**
- **Pull Requests provide evidence of change.**

**Canonical protocol truth must never live exclusively inside a GitHub
Project card.** A Project field can say an item is "Done"; only the
repository (code + docs + tests) can say what "done" actually means. If
the two disagree, the repository wins.

---

## 3. The BY-DESIGN Model

Sails does not evolve as a hand-off chain (Product → Developer implements
→ UX fixes later → Security reviews later). Every discipline constrains
every other discipline from the start of a change, not at the end of it:

```
                    Product Intent
                         │
                         ▼
                 Economic Meaning
                         │
                         ▼
              Protocol / Architecture
                   /           \
                  /             \
             Security         UX / Human Meaning
                  \             /
                   \           /
                    Engineering
                         │
                         ▼
                      Evidence
```

Product, Protocol, Architecture, Security, Privacy, UX/UI, Engineering,
Testing, and Evidence are not sequential silos with a handoff between
them — they are constraints that apply simultaneously to the same
proposed change. A change that satisfies Engineering but violates a
Security assumption is not "done, pending a security pass" — it is not
done.

### 3.1 Authority by discipline

| Discipline | Determines |
|---|---|
| **Product Direction** | what problem matters, user value, prioritization, roadmap direction, product constraints, desired experience, ecosystem strategy |
| **Protocol / Architecture** | semantic boundaries, invariants, authority, states, transitions, compatibility, evidence requirements, architectural constraints |
| **Engineering** | implementation within the authorized architecture, implementation trade-offs that do not alter frozen semantics, technical execution, tests, observability, maintainability |
| **UX/UI** (BY DESIGN, not a beautification pass) | state legibility, action legibility, authority legibility, uncertainty preservation, recovery continuity, progressive technical disclosure, privacy legibility |
| **Security / Privacy** (BY DESIGN wherever a change can alter authority, value movement, trust assumptions, disclosure, identity, correlation, recovery, or external execution) | consequence analysis, adversarial behavior |

This is not an authoritarian model — no discipline has unilateral veto
over another's domain. It is an explicit model: a change that touches
authority or value movement **requires** Security's constraint to be
considered before merge, the same way a change to human-visible state
**requires** UX's constraint to be considered — "requires considering,"
not "requires sign-off from a person with that job title," since Sails
does not yet have dedicated headcount for every discipline. See §7 for
who actually fills these roles today.

### 3.2 Protocol UX by design (preserved, not designed here)

```
Protocol State → Human Meaning → User Action
```

A Reference UI must not invent the protocol; it must make the protocol
understandable. Relevant principles, unchanged from prior sessions and
not redesigned here: **State Legibility, Action Legibility, Authority
Legibility, Uncertainty Preservation, Recovery Continuity, Progressive
Technical Disclosure.** This mission does not implement a Reference UI —
it ensures the Issue/PR workflow (§9, `.github/PULL_REQUEST_TEMPLATE.md`)
asks for UX impact early whenever a change affects human-visible
semantics, so UX consideration is not deferred to a "polish" phase.

---

## 4. Consequence-Weighted Development

> **The cheaper the consequence of being wrong, the earlier reality can
> participate. The more irreversible the consequence, the earlier
> semantics and invariants must constrain implementation.**

| Consequence class | Required order |
|---|---|
| Reversible UI / product surface | A running candidate can come early — build, look at it, iterate |
| Shared application semantics (cross-module contracts, event shapes) | Hybrid — design and implementation proceed together, checked against `CONTRIBUTING.md`'s Four-Layer Rule |
| Protocol semantics (a primitive, an Intent type, a module boundary) | Specification first — an RFC (`docs/GOVERNANCE.md` §5) before implementation |
| Financial authority / value movement (settlement, signing, destination, recovery) | Invariant → architecture → implementation → adversarial validation → evidence, in that order, every time |

This is not a slogan — it is what determines Definition of Ready (§5),
which Issue template applies (`docs/GITHUB_PROJECT.md` §Issue Taxonomy),
and how much of the PR template (§9) is required versus "N/A."

`docs/GOVERNANCE.md` §3 already has a real, working instance of this
table — the "What Requires an RFC" list. That table is the authoritative
one for protocol-specification changes specifically; this section
generalizes the same reasoning to engineering work that never touches
the spec at all (a UI change, a test, an internal refactor).

---

## 5. Definition of Ready

An Issue does not become **Ready** merely because someone wants to code
it. Requirements are **consequence-weighted** (§4) — a documentation typo
does not require the ceremony a settlement-authority change requires.

**Every Issue, minimum bar:**
- the problem is stated;
- the desired property is stated;
- scope is defined (what's in, what's explicitly out).

**Additionally, for Shared-application-semantics work and above:**
- dependencies identified;
- canonical docs linked (which doc this touches or must update);
- acceptance criteria defined;
- evidence requirement defined (what proves this is done — see §11).

**Additionally, for Protocol-semantics work and above:**
- invariants potentially affected identified (`docs/PROTOCOL_INVARIANTS.md`);
- an RFC exists or is explicitly not required, with the reason stated
  (`docs/GOVERNANCE.md` §3's table);
- security/privacy/economic consequence classified.

**Additionally, for Financial-authority work:**
- STOP conditions defined in advance (§6);
- the adversarial validation strategy is stated before implementation
  begins, not retrofitted after.

---

## 6. STOP Gates

> **Correct STOP > Artificial PASS.**
> **Do not optimize for passing the gate. Make the gate difficult to fool.**

STOP is a successful engineering outcome, not a failure. A contributor
**must** STOP — pause, document, and escalate rather than push through —
when, for example:

- implementation requires changing a frozen invariant
  (`docs/PROTOCOL_INVARIANTS.md`);
- implementation exposes a missing semantic rule;
- evidence contradicts the architecture;
- required authority is not defined;
- a security property depends on an assumption not in the model;
- tests pass but the real, intended property is not actually satisfied;
- scope expansion has become architectural redesign;
- a required external fact (chain state, a signature, a durable record)
  cannot be established;
- the repository baseline is invalid (dirty tree, `HEAD != origin/main`,
  unexpected diff);
- migration consequences for protocol-sensitive behavior are unknown.

A STOP is recorded — in the Issue, in the PR, or as a new Issue if none
existed — stating what was found and why proceeding would have been
unsafe. It is never silently absorbed into "I decided to do it a
different way" without the reasoning being visible to the next reader.

This is not new to Sails — every Mission 9 sub-mission (M9-R, M8-RF,
M9-F, M9-EI, M9-TC) used exactly this discipline, and the M9 Final Freeze
report is the concrete, checked-in example of what "evidence-bounded, STOP
where warranted" looks like in practice. This document names the pattern
so a future contributor does not have to reconstruct it from those reports.

---

## 7. Human + AI Contributor Model

The governance in this document applies identically to human and AI
contributors. There is no parallel, lighter process for AI-generated work.

> **AI generation ≠ permission. AI recommendation ≠ economic authority.
> AI implementation ≠ architectural approval.**

AI-generated work — whether from an interactive session or an autonomous
agent — must satisfy the same Issue scope, the same architecture
boundaries, the same tests, the same evidence requirements, and the same
STOP gates as human-authored work, before a human reviewer merges it. An
AI agent does not receive special standing to bypass §1's central
principle; a challenge it raises is evaluated on the evidence it presents,
exactly like a human's.

**Who fills the disciplinary roles today (§3.1), stated plainly, not
aspirationally:** Sails does not yet have dedicated headcount per
discipline. The repository owner (`alan-schramm`) holds Product Direction
and final merge authority; a second collaborator (`renipinto`) holds
write access and participates in engineering/infrastructure work; AI
sessions (Claude Code and others) do a substantial share of
implementation, architecture investigation, and evidence-gathering under
this same governance, always subject to human review before merge. This
is disclosed here rather than implied by an org chart that does not
exist — see `docs/GITHUB_PROJECT.md`'s CODEOWNERS discussion for the
concrete, current reviewer configuration.

---

## 8. Architecture Change Process

**This is not a new process.** `docs/GOVERNANCE.md` §5 (the RFC process)
already is the Architecture Change Process for anything that meets its
§3 table's bar (a new primitive, a new module, a new Intent type, a
change to `PRINCIPLES.md`). This section exists only to state, in one
place, the questions a proposal should answer before it's written up as
an RFC or a Core-RFC (`docs/GOVERNANCE.md` §6A) — a pre-flight checklist,
not a second, competing process:

1. What is wrong or insufficient? Can it be reproduced?
2. What property is missing?
3. What current property might be sacrificed?
4. Is this Core / Protocol / Runtime / Provider / SDK / UX?
5. Does it affect authority (`INV-01`, `INV-02`, `INV-12`)?
6. Does it affect economic meaning?
7. Does it affect security or privacy?
8. Does it affect compatibility?
9. What alternatives were considered?
10. What evidence would falsify the proposal?
11. What tests/experiments are required?
12. What docs/invariants would need revision?
13. Is migration required?
14. What is the STOP condition if the answer to any of the above is
    "unknown"?

A change that clears `docs/GOVERNANCE.md` §3's table as **not** requiring
an RFC (an adapter, a bug fix, a typo, an additive event) does not need
this checklist either — see §4's consequence weighting.

---

## 9. Definition of Done

DONE does not mean "code merged." Requirements are consequence-weighted
(§4), same as Ready:

**Every change, minimum bar:**
- implementation complete against the stated scope;
- acceptance criteria satisfied;
- repository clean (no stray files, no accidental unrelated diff);
- PR merged.

**Additionally, for Shared-application-semantics work and above:**
- tests appropriate to consequence (see `docs/GITHUB_PROJECT.md`'s CI
  reliability note for what "appropriate" has meant in practice this
  freeze);
- regressions clean;
- docs updated in the same change if canonical understanding changed
  (`CONTRIBUTING.md` §7's existing rule, unchanged);
- technical debt registered, not hidden, if any was knowingly introduced
  (`docs/TECHNICAL_DEBT_AUDIT.md`).

**Additionally, for Protocol-semantics work and above:**
- evidence recorded, classified per §11's vocabulary;
- claims bounded per §10;
- no unauthorized invariant drift (`docs/PROTOCOL_INVARIANTS.md`
  unchanged unless the RFC that authorized the change says otherwise).

**Additionally, for Financial-authority / significant architecture work:**
- a Sacrifice Check performed (§12) and included in the PR;
- adversarial validation evidence, not just happy-path tests.

---

## 10. Claim Discipline

> **OUTPUT ≠ EVIDENCE ≠ PROPERTY ≠ CLAIM**

- **Output** is what was produced — code, a test, a document.
- **Evidence** is what was directly observed — a test passed, a log line
  fired, a real transaction was decoded.
- **Property** is what the evidence demonstrates — not automatically the
  full intended guarantee, only what was actually shown.
- **Claim** is what may safely be said, publicly or in a canonical
  document — never broader than the demonstrated property.

An implementation output is not automatically evidence. Evidence does not
automatically establish the intended property. A property demonstrated in
one slice (e.g. the MULTISIG rail) does not justify a universal claim
(e.g. "multi-rail recovery"). The `M9_FINAL_FREEZE` report
(commit `b0c581d`) is the concrete, checked-in worked example of this
discipline applied at scale — its §14/§38-40 sections are the pattern to
follow, not re-read in full for every future PR.

---

## 11. Evidence Classification

Distinct evidence states, used in PRs, Issues, and canonical docs:

- **HYPOTHESIS** — a stated idea, not yet designed.
- **DESIGNED** — an architecture/interface exists, no implementation.
- **IMPLEMENTED** — code exists and compiles/runs.
- **SUPPORTED** — the mechanism is understood to work by direct code
  trace or a closely analogous test, but was not independently exercised
  for this specific case.
- **DEMONSTRATED** — directly, independently exercised and observed
  (a real test ran, a real log line fired, real primitives were used).
- **VALIDATED** — demonstrated under adversarial conditions, not just the
  happy path.
- **FROZEN** — validated and formally closed against further silent
  change (a Mission Freeze report, e.g. `M9_FINAL_FREEZE`).

> **Evidence status is not upgraded by inheritance.** A shared code path
> is not independently demonstrated behavior. If RELEASE is DEMONSTRATED
> and REFUND shares the same function, REFUND is at most SUPPORTED until
> it is itself exercised — this exact discipline is what kept the M9
> Final Freeze's RELEASE/REFUND/SPLIT disposition matrix honest, and it
> generalizes to every future PR.

This vocabulary is richer than what belongs in a GitHub Project field —
see `docs/GITHUB_PROJECT.md` for which subset is actually tracked there
and why the rest stays doc-only.

---

## 12. Sacrifice Check

Required for significant architecture, security, or protocol work (§9's
"Financial-authority" tier, and any Core RFC per `docs/GOVERNANCE.md`
§6A):

1. What property did we gain?
2. What property might we have sacrificed?
3. What complexity did we introduce?
4. Did the complexity earn its place?
5. What remains explicitly not demonstrated?

This is not new — every Mission 9 sub-report performed one. It is now a
named, reusable step, not something reinvented per mission.

---

## 13. Document Status / Knowledge Hygiene

> **Retrieval does not confer authority.**

An AI agent (or a human) retrieving a document, a chat transcript, or a
search result has *found* a document, not *confirmed* it is current
canonical truth. External AI tooling has previously confused historical,
rejected reasoning with current canonical state in this repository — the
rule below exists specifically to prevent that from recurring.

Vocabulary for classifying a document's authority:

- **CURRENT CANONICAL** — the live, authoritative statement. Everything
  under `docs/` reached via `docs/00-INDEX.md` is canonical unless
  explicitly marked otherwise inside the file.
- **SUPERSEDED** — was canonical, replaced by a later decision; the file
  usually says so inline (e.g. `docs/PROTOCOL_INVARIANTS.md`'s own
  "Corrigido/Implementado" annotations, `docs/BACKLOG.md`'s "Superseded"
  markings on the old Protocol Fee row).
- **HISTORICAL** — a true record of a past state or decision, not a
  current instruction (e.g. mission reports, `rfcs/` entries for a
  rejected proposal — GOVERNANCE.md §5 keeps rejected RFCs numbered and
  in place deliberately, as history, not as live guidance).
- **REJECTED** — considered and explicitly declined, kept for the record
  (a rejected RFC, or a documented "deliberately not adopted" decision
  like `docs/BACKLOG.md`'s CRDT/WebRTC row).
- **RESEARCH** — exploratory, not a commitment (`docs/SDK_usecases.md`,
  `docs/ECOSYSTEM_INTEGRATIONS.md` — both explicitly self-labeled
  "vision/roadmap, not a spec").
- **HYPOTHESIS** — a named idea with no write-up yet — see
  `docs/GITHUB_PROJECT.md`'s Master Backlog bucket D for the current
  list (Capability Composition, Ecosystem Flywheel, Sails Trilemma, and
  others named in Mission 9.9's own brief but not yet documented
  anywhere in this repository — named here, not elaborated, precisely
  because elaborating them now would be inventing architecture this
  document has no standing to invent).

This mission does **not** perform a full sweep re-labeling every existing
document — that is future Knowledge Architecture work, out of scope here
(mission §28's own instruction). This section only makes the vocabulary
explicit so a future sweep has a fixed target to use.

---

## 14. Repository Memory Principle

> **GitHub is the memory of the architecture, not the diary of how we
> discovered it.**

Canonical documentation (`docs/`) should state conclusions, cross-
referenced to evidence, not the chronological narrative of how the
conclusion was reached. Mission reports, PR descriptions, commit
messages, and `rfcs/` entries are where chronology and process belong —
they are permanent, searchable, and exactly where a reader looking for
"why did we decide this" should go. A canonical doc bloated with mission
history is harder to trust as current truth, not easier — this is the
same discipline `docs/GOVERNANCE.md` §6C already applies to what's
public at all, generalized here to what belongs in a *canonical* file
specifically, public or not.

---

## 15. Non-Decisions of This Mission

Mission 9.9 (this document's own origin) is engineering-governance and
contributor-readiness work. It explicitly did not, and its existence
must never be read as having:

- modified Sails Core semantics, the Semantic Kernel, the Constitution,
  Protocol Invariants, any state machine, settlement behavior, recovery
  behavior, or Destination Authority;
- changed the database schema or added a migration;
- activated protocol fees or changed economic behavior;
- begun M10 implementation;
- redesigned OpenP2P, implemented agents, implemented privacy
  architecture, or implemented a new settlement rail;
- published an npm package or bumped SDK version;
- performed a broad repository redesign unrelated to contributor
  readiness.

See `docs/GITHUB_PROJECT.md` §"Important Non-Decisions" for the list of
named-but-undocumented conceptual fronts (ZK, anonymous credentials, the
Sails Trilemma, Portable Economic Proofs, Pubky/PKARR, Nostr as
transport, mandatory Pear transport, exact capability-negotiation
mechanism, a universal interoperability layer, multi-attempt execution
architecture, automatic World-C convergence) that this document
deliberately does not promote to any status beyond "named, registered,
undocumented." DLC has been removed from the roadmap and is not
reintroduced by this document.
