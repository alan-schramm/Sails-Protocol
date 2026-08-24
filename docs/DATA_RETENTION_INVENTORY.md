# Data Retention Inventory

**Missão 11, Fase 9.1 §14 — analysis only.** No deletion mechanism, TTL,
or purge job is implemented by this document. Classifies every real data
category this codebase persists using **Minimum Necessary
Auditability** — retain what's genuinely needed to prove what happened
(economic integrity, dispute resolution, security investigation), and no
longer/more than that — as the guiding principle, and flags where the
actual duration is a legal/policy decision this document does not make
unilaterally.

Four classifications, applied per category below:

- **MUST RETAIN** — deleting this would break the protocol's own ability
  to prove what happened; retention is the auditability requirement
  itself, not a competing concern to balance against it.
- **RETENTION REQUIRED DURATION UNDECIDED** — must be retained for *some*
  period tied to a real purpose (appeal window, legal defense), but the
  exact duration is a policy/legal decision, not decided here.
- **CAN EXPIRE** — serves no ongoing protocol purpose once its
  originating activity concludes; a real deletion/anonymization policy
  is reasonable and not yet implemented, not a gap in itself.
- **UNKNOWN-LEGAL-DECISION** — genuinely personal data where a
  jurisdiction-specific legal obligation (e.g. a "right to be forgotten"
  request) could require deletion/anonymization even where the protocol
  itself would prefer retention — a real tension this document surfaces,
  does not resolve.

Built directly from `prisma/schema.prisma`'s real model list (37 models,
enumerated via direct search, not assumed) — every model is placed in
exactly one category below.

---

## 1. Immutable protocol/economic history — MUST RETAIN

`Trade`, `Escrow`, `EscrowEvent` (hash-chained), `Intent`, `IntentEvent`
(hash-chained), `DurableEventRecord`, `FeeDistribution` (historical/
write-frozen, see `DATABASE.md`), `FeePolicyVersion`, `FeeObligation`,
`FeeCollectionEvidence`, `EscrowFundingEvidence` (Missão 11 Fase 9.1
§1-3), `FeeDistributionBatch`, `FeeDistributionBatchItem`,
`DistributionRecipient`, `DistributionPolicyVersion`,
`DistributionPolicyRecipient`, `EntitlementLedgerEntry`,
`CustodyAttestation`, `ReputationEvent`, `PayoutAddress`,
`EscrowReleaseApproval`, `EscrowTransactionSignature`.

This is the ledger. The entire trust model — that a party can later prove
what was agreed, signed, paid, and under which policy — depends on these
rows surviving unmodified. Several are already DB-natively
write-frozen or hash-chained specifically so tampering is detectable,
not just discouraged (see `DATABASE.md`'s own per-model notes). Under
Minimum Necessary Auditability, the "minimum necessary" cuts toward
**keeping** this category, not deleting it: auditability is the entire
purpose these rows exist for, so retaining them isn't excess data, it's
the requirement itself. No known legal obligation would compel deleting
a completed transaction's own economic record while the parties or a
regulator could still need to verify it — the opposite is more typical
(financial record-keeping obligations tend to mandate minimum retention
periods, not maximums).

## 2. Dispute evidence — MUST RETAIN while live/appealable; RETENTION REQUIRED DURATION UNDECIDED after final resolution

`Dispute`, `DisputeAppealFee`, `Claim`, `Proof`, `EvidenceReference`,
`Verification`, `ArbiterProfile`.

Evidence a ruling was based on must survive at least as long as that
ruling can be appealed (`DisputeService.appeal()`'s own real appeal-round
mechanism) or referenced in a later dispute (repeat-bad-actor pattern
detection — `SECURITY_MODEL.md`'s own "Dispute history is public on the
reputation layer" principle depends on this). It may also be needed to
defend Sails or a specific arbiter against a later legal claim about how
a ruling was reached. How long *after* final resolution (no live appeal,
no ongoing legal exposure) this should be kept is a genuine
jurisdiction-dependent policy question — not decided here. `ArbiterProfile`
is included in this category (not identity metadata) because its real
value is as an audit trail of a specific arbiter's own ruling history,
the same reasoning as the rest of this category, not personal data about
a private individual in the ordinary sense.

## 3. Chat / trade communication — CAN EXPIRE by default; inherits category 2 if referenced as dispute evidence

`Message`.

The closest thing in this schema to personal communication content.
Minimum Necessary Auditability argues against indefinite retention of
ordinary trade chat once a trade completes cleanly with no dispute — it
serves no further protocol purpose at that point. A message a party
submits or references *during* a dispute effectively becomes dispute
evidence and should inherit category 2's retention instead. The default
(non-dispute) retention window — e.g. some period after trade completion
— is a real product/legal decision not made here; no deletion mechanism
for `Message` currently exists in the codebase (confirmed via direct
search — `chat.routes.ts` only ever creates/reads, never expires
messages).

## 4. Identity metadata — MUST RETAIN (protocol-referential fields); UNKNOWN-LEGAL-DECISION (personally-chosen fields)

`User`, `Vouch`.

`User.publicKey` is the protocol identity itself — every `Trade`,
`Escrow`, `Dispute`, `ReputationEvent`, etc. this document places in
category 1 references a `userId`/participant id that ultimately resolves
back to this row. Deleting it doesn't just remove "a user's data," it
breaks referential integrity for the entire audit trail category 1
depends on — so it's MUST RETAIN by the same reasoning, not a separate,
weaker claim. `User.displayName`, by contrast, is genuinely
user-chosen, human-readable personal data a real "right to be forgotten"
request could target — flagged **UNKNOWN-LEGAL-DECISION**: a real design
option exists (replace with a placeholder/anonymized value rather than
deleting the row, preserving category 1's referential integrity while
honoring the request) but is not decided or built here. `Vouch` rows
reference two `User`s for the same referential-integrity reason
`publicKey` has — MUST RETAIN alongside it, for the same reason.

## 5. Payment-account hashes — MUST RETAIN while the account/trust-ramp is active; UNKNOWN-LEGAL-DECISION post-closure

`PaymentAccount`.

Deliberately never the raw payment identifier (RFC-021 D5 — the SDK's
own `hashPaymentAccount()` runs client-side; the server only ever sees
`accountHash`, a one-way SHA-256 digest, verified byte-identical against
the SDK in `tests/paymentAccountHashConsistency.test.ts`). This
materially reduces sensitivity versus raw PII, but a hash of a specific
real-world bank/PIX/etc. identifier is still linkable data under some
privacy regimes if the underlying identifier could plausibly be
recovered by an adversary with auxiliary information (e.g. a small
enumerable space, unlike a genuinely high-entropy secret). The
trust-ramp status this record carries (`payment-account.service.ts`'s
real unsigned→signed→trade-count tiers) is load-bearing reputation
state, not disposable — MUST RETAIN while the account is active for the
same category-1-style reasoning. What should happen to it after account
closure (anonymize the hash, or retain it to prevent trivial trust-ramp
reset via a fresh account) is a real, undecided policy question.

## 6. Logs — CAN EXPIRE

Structured `pino` logs (`common/logger.ts`), HTTP request/response access
logs, `load-tests/`' own generated artifacts.

These are operational data, not the durable protocol record — anything
genuinely protocol-relevant already lives in category 1's DB rows, which
are the actual source of truth (log lines are, at best, a redundant,
lower-fidelity copy of the same facts, not a second source of truth).
Minimum Necessary Auditability argues for a short, defensible retention
window (commonly 30-90 days, long enough for security-incident
investigation, no protocol reason to keep longer) rather than indefinite
retention. **Confirmed via direct search: no log-retention/rotation
policy exists anywhere in this codebase or `docs/DEPLOYMENT.md` today**
— this is a real, disclosed operational gap (infrastructure-level, e.g.
a hosting platform's own log-retention setting), not a data-model
question this repo's own code controls, and is not fixed by this
analysis-only pass.

## Residual — transient/operational state, not "history"

`Offer`, `CapabilityGrant`, `EscrowPendingTransaction`.

`EscrowPendingTransaction`/its `EscrowTransactionSignature` children are
already explicitly transient by design — cleared (deleted, cascading) the
moment a signing round finalizes (`escrow-pending-tx.ts`'s own header
comment: "a completed release/refund leaves no pending row behind, only
`Escrow.txReleaseId` as the durable record") — already correctly
minimal, nothing to change. `Offer` — CAN EXPIRE once
closed/cancelled/matched, no ongoing protocol purpose past that point
(the resulting `Trade` is what category 1 actually needs to retain).
`CapabilityGrant` sits closer to category 1's reasoning than it first
appears: a revoked/expired grant is part of the authorization audit
trail ("who was allowed to do X, when, and who revoked it") — leaning
MUST RETAIN rather than CAN EXPIRE, included here only because it isn't
one of the CTO's six named categories, not because its real answer is
"disposable."

---

## What this document does not do

No deletion job, TTL column, anonymization routine, or legal
determination is implemented here — every UNKNOWN-LEGAL-DECISION and
RETENTION-DURATION-UNDECIDED item above remains genuinely open, flagged
for a real privacy/legal review before any retention policy is enforced
in code. This is the inventory the CTO's Fase 9.1 §14 asked for — the
input to that future decision, not the decision itself.
