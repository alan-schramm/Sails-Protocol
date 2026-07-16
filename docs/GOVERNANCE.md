# GOVERNANCE.md
### Sails Protocol — Engineering Handoff · Document 17 of 20

> Requested explicitly by the CTO Final Audit Report: "O protocolo ainda
> precisa formalizar sua governança." This document covers two things:
> who can change the protocol spec today and in the future (Governance),
> and how a change actually gets proposed (RFC Process). Neither existed
> before this document — verified absent during the v7.4 review pass.

---

## 1. Governance Today (Months 1-12, grant period)

Per `PROTOCOL_ECONOMY.md` section 7, governance of protocol parameters
(fee rates, bucket splits, trust limits) starts Satsails-controlled and is
committed to transition to a multi-stakeholder body once
`ROADMAP.md`'s "Governance layer v1" ships (Meses 10-12). This document
extends that same principle to the **protocol specification itself**, not
just economic parameters:

- **Who can change `PROTOCOL_SPECIFICATION.md` today:** the Satsails
  engineering team, following the RFC Process below even internally — no
  spec change should happen as a silent edit, including by the original
  authors. This handoff package's own MASTER_COORDINATION.md changelog is
  the working precedent for this discipline; formalizing it here makes it
  a rule instead of a habit.
- **Who can propose a change:** anyone. `PRINCIPLES.md` principle 7 ("Open
  Integrations") means the RFC process itself must be open to non-Satsails
  contributors from day one, even while final approval sits with Satsails
  during the bootstrap phase.
- **What requires an RFC vs. what doesn't:** see section 3.

## 2. Governance After Months 10-12 (Governance Layer v1)

Per `PROTOCOL_ECONOMY.md` section 7, this body is composed of recognized
ecosystem stakeholders — reference implementers, major integrators, node
operators — using a multi-signature or delegated-representative process,
**not a token-weighted vote** (consistent with `PRINCIPLES.md`'s no-token
stance carrying through to governance, not just economics). This document
does not re-specify that mechanism — see `PROTOCOL_ECONOMY.md` section 7
for the canonical description — but extends its scope explicitly to cover:

- Approving or rejecting RFCs that change `PROTOCOL_SPECIFICATION.md`
- Approving new official modules (beyond the current 7 — see
  `ARCHITECTURE.md` section 3) and assigning them a canonical name via the
  Module Registry (section 4 below)
- Approving changes to `PRINCIPLES.md` itself — the highest bar, requiring
  the broadest consensus, since every other governed decision is checked
  against these principles

## 3. What Requires an RFC

| Change type | Requires RFC? |
|---|---|
| New Intent type (e.g. `PredictionIntent` — see `REFERENCE_IMPLEMENTATIONS.md` section 3.1's open question) | Yes |
| New primitive (adding to the 9 in `PROTOCOL_SPECIFICATION.md` section 1) | Yes — highest bar, see section 5 |
| New official module | Yes |
| New `SettlementAdapter` or `OpenFinanceAdapter` implementation (section 4B of `PROTOCOL_SPECIFICATION.md`) | No — adapters are designed to be added freely, that's the point of the pattern |
| Bug fixes, typos, clarifications to existing docs | No |
| New event within an existing module's namespace | No, but should be documented in the same PR |
| Changes to `PRINCIPLES.md` | Yes — requires Governance Layer v1 (post Meses 10-12), not available during bootstrap phase |

## 4. Module Registry (lightweight, non-gatekeeping)

Per `LONG_TERM_VISION.md`, "How New Modules Emerge": module *names* need a
light naming authority — not permission to build — so two unrelated teams
proposing `openinsurance` don't collide with incompatible event shapes.
This is closer to how IANA assigns protocol numbers than to an approval
gate:

1. Anyone may build against the protocol spec without registering anything.
2. To claim an official `open{name}` namespace recognized across the
   ecosystem (appearing in `moduleId`, event namespaces, and
   `ARCHITECTURE.md`'s module list), submit an RFC (section 5).
3. Registration is name-collision arbitration, not a quality gate — the
   registry does not evaluate whether a module is "good," only whether its
   name and event namespace are unique and consistently formatted
   (`{module}.{entity}.{action}` per `ARCHITECTURE.md` section 5).

## 5. RFC Process

**Numbered, sequential, permanent (v8.5).** Every RFC gets the next
integer, forever — never reused, never reordered even if a proposal is
later rejected. This is the project's decision history, not a scratch pad:
a rejected `RFC-N` stays numbered `N` and stays in `rfcs/`, because the
fact that it was considered and rejected — and why — is itself part of the
record. `rfcs/RFC-001-participant-model.md` through
`rfcs/RFC-005-capability-model.md` are the inaugural set,
produced during Protocol Freeze to formalize five decisions that had
already been reasoned through informally (the Protocol Quality Review's
findings) — writing them up as proper RFCs, with rejected alternatives
shown explicitly, converts "we discussed this and decided X" into a
verifiable artifact. `RFC-006` followed shortly after, formalizing a sixth
decision (OpenProof's module status and the Package/Capability
distinction) reached the same way — through review, not invented here.
Every architectural decision from this point forward
that changes a primitive, adds an interface, or alters an Adapter pattern
follows this same numbered sequence — `RFC-010` is next, whenever the next
such decision arises, not before. (`RFC-007` — Real-World P2P
Requirements, drafted from operator interviews rather than the Protocol
Quality Review — was accepted by direct CTO directive rather than through
the open Discussion window described in section 5 below; this is recorded
explicitly in the RFC itself, not treated as a silent exception to the
process. `RFC-008` — Verifiable Timestamps and a Hash-Chained Timeline,
amending two constructs RFC-007 introduced — originated from a design
critique raised during RFC-007's own review, not a CTO directive, and was
accepted by the repository owner after a technical review pass; its own
Status section records this distinction rather than reusing RFC-007's
framing. `RFC-009` — Decimal Precision for Financial Fields — originated
from an external audit report, verified independently against the code
before being treated as fact, and corrects `Settlement.amount`'s (§1.5)
field type. This sentence is updated each time, not left pointing at an
RFC that already exists.)

1. **Draft** — write the proposal as a markdown file following the
   template in section 6. Reference which primitive(s) it uses or extends
   (`PROTOCOL_SPECIFICATION.md` section 1) and which principle(s)
   (`PRINCIPLES.md`) it's consistent with.
2. **Discussion** — open for comment. During the bootstrap phase (Months
   1-12), Satsails engineering reviews and responds. Post Meses 10-12,
   Governance Layer v1 reviews.
3. **Decision** — Accepted, Rejected, or Needs Revision. A rejection must
   state which principle or existing primitive the proposal conflicts
   with — silence is not an acceptable rejection reason, consistent with
   how `PROTOCOL_SPECIFICATION.md` section 1.11 documents *why* Participant,
   Offer, and Event were rejected as primitives rather than just rejecting
   them without reasoning.
4. **Implementation** — once accepted, the RFC's author or any contributor
   may implement it. Acceptance of the RFC is not a commitment that
   Satsails will build it — only that it's compatible with the protocol.
5. **Adoption into canon** — once implemented and stable in at least one
   Reference Implementation, the RFC's content is merged into the
   authoritative document it amends (`PROTOCOL_SPECIFICATION.md`,
   `ARCHITECTURE.md`, etc.) and `MASTER_COORDINATION.md`'s changelog
   records it — the same propagation discipline this whole handoff package
   has followed throughout its own revision history.

## 6. RFC Template

```markdown
# RFC-NNN: [Title]

## Summary
One paragraph.

## Motivation
What problem does this solve? Cite a real use case, not a hypothetical.

## Primitives Used or Extended
Which of the 9 (PROTOCOL_SPECIFICATION.md §1) does this build on?
Does it propose a new primitive? If so, it must pass the test in §1
(irreducible, orthogonal, has its own lifecycle, cross-cutting) —
show your work the way §1.10-1.11 do for the concepts that were rejected.

## Principle Alignment
Which of the 9 principles (PRINCIPLES.md) does this support or risk
conflicting with?

## Specification
The actual interfaces, event names, and state transitions.

## Backward Compatibility
Does this require a protocolVersion bump? Does it break any existing
moduleId's data?

## Reference Implementation Plan
Who will build the first implementation, and in which Reference
Implementation (Satsails Wallet, Sails Finance, SailsPay, or a
third party)?
```

---

## 6B. Implementation Freeze Traceability Discipline (v8.7 — CTO recommendation)

Once Implementation Freeze begins (`MASTER_COORDINATION.md`'s 5-phase
pipeline), three rules apply to all new code, with no exception:

1. **Every new module or significant code change references the RFC that
   defines its behavior**, in a code comment or commit message — the same
   way this handoff's markdown already cites `RFC-001` through `RFC-006`
   inline wherever their decisions apply.
2. **Every API endpoint or SDK method indicates which RFC (or
   `PROTOCOL_SPECIFICATION.md` section) defines its contract** — continuing
   the practice already established in `API_REFERENCE.md`'s canonical
   verb table and `SDK_GUIDE.md`.
3. **No architectural change ships without updating the RFC it amends
   first** — code and specification move together, never specification
   trailing behind what got built. If a change doesn't fit any existing
   RFC, it needs a new one (`RFC-007` onward) before implementation, not
   after.

This is what converts the RFC record from a historical decision log into
a living traceability chain between specification and code — exactly the
discipline that separates a well-written codebase from a protocol a
community can maintain for years after the original authors move on.

## 6C. Publication Discipline — What Goes to Public GitHub (v8.24, permanent practice)

Only material that is **finished, current, and cannot confuse an outside
reader** goes to the public repository. This is a standing rule, not a
one-time decision:

- **Goes public:** the engineering handoff (`sails-protocol/docs/` — 20
  documents + `rfcs/`), all code, `LICENSE`, `README.md`. This is
  material written to be read with zero prior context and hold up on its
  own — that was the design goal from the first handoff pass onward.
- **Stays internal by default:** strategic evaluation documents (due
  diligence reports, red team reviews, resilience reviews). These are
  valuable specifically *because* they're unflinching about gaps — but
  that same honesty, read without the context of what's since been fixed,
  reads as a live vulnerability disclosure instead of a resolved finding.
  Publishing them requires an explicit update pass confirming they
  reflect current state, not a default assumption that "finished
  internally" means "ready externally."
- **The check, every time something is proposed for GitHub:** would a
  reader with zero conversation history and zero timeline context come
  away confused, alarmed, or with an outdated picture? If yes, it stays
  internal until that's fixed — it is never published "as a first draft"
  with a mental note to clean it up later.

## 7. Why This Matters for the Grant

An open protocol with no visible governance process reads as
governance-by-whoever-controls-the-repo — exactly the centralization risk
`PROTOCOL_ECONOMY.md` section 6.4 was written to rule out for economic
parameters. This document closes the same gap for the specification
itself, and is one of the four documents (`PROTOCOL_SPECIFICATION.md`
already existed; `PHILOSOPHY.md`, this file, and the RFC process within it
are new) the CTO Final Audit specifically named as strengthening the grant
submission's credibility.
