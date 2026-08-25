# RFC-019: Settlement Custody — Reference Implementation vs. Normative Protocol

**Frozen status labels (Missão 11 Fase 9.1.1 §4, CTO decision, 2026-08-24):**

- **`WDK_USDT_EVM`: SERVER-CUSTODIAL REFERENCE IMPLEMENTATION / PRODUCTION-INELIGIBLE.** Never the protocol's normative EVM settlement authority. Enforced structurally, not just by convention — `src/config/index.ts` refuses to boot in production if `MOCK_ESCROW=false` and a real `WDK_SEED_PHRASE` is configured (see that gate's own comment for the full reasoning and `tests/configProductionGates.test.ts` for the adversarial proof). Not deleted — remains real, useful reference/testnet-demo infrastructure (`npm run demo:pix-to-usdt`).
- **`SAFE_GUARD_EVM`: CURRENT EVM AUTHORITY CANDIDATE / NOT PRODUCTION-ACTIVATED.** The real, substantially-built non-custodial path (RFC-020) — client-held buyer/seller keys, KMS-backed arbiter co-signer, audited Safe `checkSignatures()`. "Candidate," not "production-ready": never exercised against live-funded infrastructure, no live AWS KMS call, no live ERC-4337 bundler submission, no deployed/verified contract (RFC-020's own Summary). Not activated by this closure phase — no economic activation, no BTC, no live-infrastructure exercise attempted here.

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

Satsails reference implementation (this repo).

**Phase 1 — done (2026-07-19).** `WdkSettlementProvider.custodyModel`
(readonly, `'server-custodial-reference-implementation'`), a boot-time
warning in `startServer()` whenever `MOCK_ESCROW=false`, `.env.example`
disclosure on `WDK_SEED_PHRASE`, and an `API_REFERENCE.md` pointer to
`CRYPTOGRAPHIC_MODEL.md` §5 — all landed together, purely additive, no
behavior change (verified: `npm run build` clean, `npm test` 207/207).

**Phase 2 — the real non-custodial settlement path.** **Corrected/
Implemented 2026-08-24** — this section previously read "separately
scoped, unstarted, and not committed to a timeline," which is now
factually stale: RFC-020 (accepted, dated 2026-08-01) specified Phase 2
in full (a Safe Transaction Guard, 2-of-3 buyer/seller/KMS-arbiter) and
`SAFE_GUARD_EVM`/`safe-guard-evm.provider.ts` substantially implements
it — real CREATE2 Safe/Guard address prediction, real `PackedUserOperation`/
`userOpHash` construction, real Safe `checkNSignatures()`-format signature
combination, client-held buyer/seller keys via the same
`EscrowParticipantKey`/`submitParticipantKey()` infrastructure MULTISIG
uses. Still never exercised against live-funded infrastructure or
economically activated — this mission's own hard safety gate (no BTC, no
economic activation) applies here exactly as it does everywhere else, so
"implemented" means "real, structurally-verified code," not "in
production." See RFC-020 for the full specification and this file's own
new §7 section below for how this bears on `WDK_USDT_EVM` specifically
(a distinct, still-genuinely-open question this Phase 2 work does not
itself resolve).

## Missão 11 Fase 9.1 §7 — WDK Primitive-Level Authority Analysis (added 2026-08-24)

Analysis only, per explicit CTO instruction — no redesign implemented,
`WdkSettlementProvider` left completely inert and unchanged by this
section. This answers a narrower, still-open question RFC-020 doesn't
itself resolve: RFC-020 built the real non-custodial EVM path via
`SAFE_GUARD_EVM`, a *separate* `EscrowType`/`SettlementProvider` — it did
not change `WDK_USDT_EVM`/`WdkSettlementProvider` itself, which remains
exactly the single-server-seed reference implementation RFC-019
diagnosed. The question this section answers: could/should
`WDK_USDT_EVM`'s own gap be closed using WDK's own primitives directly,
independent of `SAFE_GUARD_EVM`?

**What `@tetherto/wdk-wallet-evm` actually provides (read directly from
the installed package's own README/AGENTS.md, not assumed):**

- `WalletAccountEvm` is a single-EOA-signer abstraction. Every
  transaction/transfer/message-sign it performs is authorized by exactly
  one key, held by whichever `ISignerEvm` backs that account —
  `SeedSignerEvm` (BIP-44 child of one seed) or `PrivateKeySignerEvm`
  (wraps one raw private key). There is no multi-party or threshold
  signing primitive anywhere in this package — no "collect N signatures,
  combine, submit" API of any kind.
- Critically, the package itself does **not** require the signer's seed
  to live on the server — `PrivateKeySignerEvm`/`SeedSignerEvm` can be
  constructed from a caller-supplied key exactly as easily client-side as
  server-side (`README.md`'s own "Single Account (no manager)" examples
  construct a `WalletAccountEvm` straight from a raw private key, with no
  wallet-manager/server involvement at all). This confirms `WDK_USDT_EVM`'s
  current custody gap is Sails' own architecture choice — one
  `WDK_SEED_PHRASE` deriving every escrow sub-account server-side — not a
  limitation `@tetherto/wdk-wallet-evm` itself imposes. This directly
  answers the CTO's question 1 and 2: yes, the primitives can preserve
  user-held signing material, and no different WDK abstraction is needed
  to do it — the same package used differently (client-side, per-participant
  keys) would do it.
- The one genuinely novel primitive this package adds is **EIP-7702
  delegation** ("Delegate EOAs to smart contracts, sign authorizations,
  and send type 4 transactions") — but this is still a single-EOA
  authorization signature, not a multisig contract. It's the mechanism a
  participant's own EOA would use to temporarily adopt smart-contract
  logic (e.g., a Safe-like authorization check) for one transaction, not
  a threshold scheme in itself.

**Answering question 3 (is a smart-account/multi-party approach
required):** yes. Nothing in `@tetherto/wdk-wallet-evm` performs
multi-signer threshold verification; achieving Structural Invariant 2
(The Protocol Never Custodies Assets — corrected reference, Missão 11
Fase 9.3.4, see the note below) for an EVM rail genuinely requires
*some* on-chain (or relayer-mediated) authorization
layer above raw single-EOA signing, because a plain Ethereum transaction
has exactly one signer slot — there is no EVM equivalent of Bitcoin's
PSBT that lets two independent parties cooperatively assemble one
transaction off-chain before either broadcasts. Any genuinely
non-custodial EVM design converges on needing a contract (or a trusted
relayer, a strictly weaker model not recommended here) that can verify
multiple authorizations before it will move funds.

> *Reference resolved, Missão 11 Fase 9.3.4 — a git-history investigation
> (`git log -p`) found this exact citation was introduced in commit
> `9cf385e4` (2026-08-24, "feat(protocol): harden core settlement
> invariants," Missão 11 Fase 9.1/9.1.1) — the SAME baseline commit this
> whole Phase 9.3.x reconciliation works from, not an older, separately
> lost "Phase 9.0" document as Fase 9.3.3's prior version of this note
> speculated. Read in its own original context (the paragraph
> immediately above and below this citation, same commit): the actual
> concern is "no single signer, including a Sails-operated one, may
> unilaterally authorize a fund movement" — a genuine multi-party
> threshold requirement for EVM settlement. That is Structural
> Invariant 2 (The Protocol Never Custodies Assets), not `INV-01`
> (Participant-Bound Authority, formally defined later, Fase 9.3.3 —
> about verifying WHO is acting, not about requiring multiple
> independent authorizers).*

**Answering question 4/5 (what model satisfies Structural Invariant 2
for an EVM rail, what's reusable):** that smart-account layer already exists in this codebase,
real and substantially built — `SAFE_GUARD_EVM` (RFC-020): an
unmodified, audited Safe with a purpose-built Transaction Guard
(`SailsEscrowSafe.sol`), 2-of-3 threshold (buyer, seller,
`SailsSignerService`'s AWS-KMS-held co-signer key), client-held
buyer/seller keys via the exact same submission path (`EscrowParticipantKey`/
`submitParticipantKey()`, now also carrying Missão 11 Fase 9.1 §4/§5's
capability-profile declaration) MULTISIG already uses. Building a
*second*, independently-engineered participant-authority scheme directly
on raw WDK signer primitives for `WDK_USDT_EVM` specifically would mean
either (a) hand-rolling threshold-signature verification logic — exactly
the class of custom cryptography RFC-020's own Alternatives Considered
already rejected in favor of Safe's audited `checkSignatures()`/
`checkNSignatures()` — or (b) accepting a relayer-trust model strictly
weaker than what `SAFE_GUARD_EVM` already provides. Neither is a genuine
improvement over reusing what RFC-020 already specified and substantially
built.

**Recommendation (decision memo for the CTO, not decided here):** do not
invest further engineering in redesigning `WdkSettlementProvider`'s own
custody model using WDK-native primitives. Two real forward options
exist, presented for a future CTO decision:

- **(A)** Keep `WDK_USDT_EVM` permanently as the disclosed
  reference/local-dev/testnet-demo rail RFC-019 already labels it
  (`npm run demo:pix-to-usdt` remains useful for that purpose), with
  `SAFE_GUARD_EVM` as the only rail intended to ever reach real
  production EVM value-at-risk use. No further WDK_USDT_EVM custody work
  needed.
- **(B)** If a WDK-branded end-to-end signing story is specifically
  wanted for partner/positioning reasons (independent of the pure
  security argument above), the only credible non-custodial shape is:
  each participant holds their own `PrivateKeySignerEvm`/`SeedSignerEvm`-backed
  key client-side (never server-derived), and every release still routes
  through a genuine on-chain/relayer authorization gate — which in
  practice means reusing `SAFE_GUARD_EVM`'s existing Safe Guard rather
  than building a parallel one, since WDK itself supplies no threshold
  primitive of its own to build that gate from.

Both options leave `WdkSettlementProvider` exactly as it is today. No
code in this section changes it.
