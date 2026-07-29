# RFC-021: Market-Based Arbitration — Reputation-as-Collateral, Payment-Account Trust Ramp, and Escalation

## Summary

RFC-007 D4 gave OpenSettlement its Dispute escalation order and a real
`ArbitrationProvider` interface, but the only shipped implementation
(`TrustedArbitratorProvider`, `arbitration-provider.ts`) is a **static,
application-configured allowlist** (`TRUSTED_ARBITRATORS` env var,
round-robin assignment) — the application decides who is allowed to
arbitrate, not the market. That was a deliberate, disclosed stub (its
own header: "Simple round-robin assignment across the configured
trusted-arbiter list") and it is exactly the kind of stub the project
owner has now directed be replaced with production reasoning ahead of
the Tether grant MVP deadline.

This RFC replaces that stub's *selection mechanism* with a
permissionless, reputation-and-collateral-weighted market, while
**keeping RFC-007 D4's escalation order and `ArbitrationProvider`
interface shape intact** — this is a new implementation of an existing
interface, not a redesign of the Dispute primitive. It also adds a
second, independent trust mechanism this RFC's own research surfaced
as necessary for the PIX/fiat-rail reality of this protocol's actual
use case: **payment-account trust ramping**, a defense against
chargeback/mule-account fraud that reputation-of-trader alone does not
cover.

**Status:** Proposed — formal acceptance (`GOVERNANCE.md` §6A review
step) has not happened yet, though as of 2026-07-29 every phase in
"Reference Implementation Plan" below except D7 (explicitly deferred)
is implemented, tested, and committed; "Proposed" describes governance
status, not build status — see that section for what's actually real.
Synthesized from a design session between the
project owner, an external developer (Yuri, via 8 transcribed voice
messages, 2026-07-29), and this session — grounded against real
precedent (Kleros, Bisq's `Payment account age witness`/account
signing, Bisq Easy's burned-BSQ reputation) rather than invented from
nothing. Explicitly follows the project owner's own stated engineering
philosophy for this RFC (paraphrased): *document known residual risk
honestly rather than claim false closure — not everything is solved,
some things (like the oracle problem) have no known closed-form
solution — and still ship the most elegant layered mitigation
available now, calibrated so the attack is theoretically possible but
practically irrational, the same "possible in theory, basically never
happens" character as many Bitcoin-network attacks.*

**Classification:** Core RFC (`GOVERNANCE.md` §6A) — changes the
trust/custody model of Dispute resolution, the same category RFC-019
and RFC-020 were classified under for Settlement.

## Motivation

Three real, concrete problems, in the order the design session
surfaced them:

1. **`TrustedArbitratorProvider` doesn't scale past one operator's
   trust decisions.** A protocol positioning itself as a P2P
   marketplace SDK (not a company that vets arbitrators) needs
   arbitration supply the market can grow on its own, not a hand-typed
   env var.
2. **Legal exposure.** If arbitration means "a designated party moves
   your money," the operator/arbiter inherits real legal
   susceptibility for every disputed outcome. This has to be
   architected away, not disclaimed away.
3. **Chargeback fraud on the PIX/fiat rail specifically.** A buyer can
   pay with a stolen or "warmed-up" mule bank account; the seller
   releases crypto on a real-looking PIX confirmation, then the
   original account holder reverses it with their bank. Trader
   reputation (built from trade history) does not, by itself,
   distinguish a legitimate payment account from a fraudulent one used
   for the first and only time.

## Alternatives Considered

- **Pure stake-weighted juror selection (Kleros's actual model).**
  Rejected as the sole mechanism. Verified directly against Kleros's
  own documentation before proposing this: juror-draw probability is
  proportional to staked PNK alone, with no reputation dimension — "an
  attacker needs >50% of the scarce resource used to determine voting
  weight" is Kleros's own stated Sybil-resistance bound. That is
  exactly the "money = power" outcome the project owner explicitly
  rejected in this design session. Kleros's **appeal-round structure**
  (escalating jury size and cost) is kept — see D6 — but its
  plutocratic selection weighting is not copied.
- **A small, DAO/community-curated arbiter set (Bisq's actual
  historical model).** Rejected as the sole mechanism for the same
  reason RFC-007 D4 already rejected a protocol-native "Guardião"
  role: it re-centralizes who gets to arbitrate, which is precisely
  what "the market decides, not the wallet or the protocol" (project
  owner, this session) rules out.
- **Reputation and collateral as two separate, exchangeable
  currencies with a conversion rate.** Considered and rejected in
  favor of D3 below: a conversion-rate model invites gaming the
  exchange rate itself. Making reputation *itself* a slashable asset
  (the same "at risk" property collateral already has) avoids needing
  an exchange rate at all.
- **Trusting trader reputation as sufficient defense against payment
  fraud.** Rejected once the design session reached the PIX-specific
  chargeback scenario — trader reputation answers "has this identity
  behaved well," not "is this specific bank account legitimate and
  unlikely to be reversed." These are different risks needing
  different mechanisms (D3 vs. D5).

## Decision

### D1 — Arbiter role redefined: reputation attestor, not fund mover

An arbiter's `resolveDispute()` call does not move funds. It never
did, structurally — `dispute.service.ts`'s real `resolveDispute()`
already writes `Dispute.ruling` first, and it is *that write* which
`escrowService.releaseFunds()`/`refundFunds()` react to, not direct
arbiter custody (verified by reading `dispute.service.ts` directly
before writing this RFC, not assumed). **This RFC does not change that
code path — it formalizes it as an explicit design principle**, because
it is the load-bearing fact that limits an arbiter's legal exposure to
a narrow, factual claim ("I reviewed this dispute and attest Party X
was in the right") rather than "I am the entity that moved your
money." Every interface and doc description of `ArbitrationProvider`
going forward must preserve this framing.

### D2 — Permissionless arbiter registration

Replaces `TrustedArbitratorProvider`'s static list. Any participant may
self-register as an arbiter candidate by posting collateral (D3) —
no protocol or application approval step, matching "nem a carteira e
nem o protocolo irá decidir quem tem poder de arbitro" (project owner,
this session). **Implemented** (RFC-021 Phase 1):
`MarketArbitrationProvider.register()`/`eligibleFor()`/`assign()`
(`market-arbitration.provider.ts`), gated behind
`config.settlement.arbitrationMode = 'market'` (`'trusted-list'`
remains the default — this is an opt-in per deployment, not an
automatic upgrade).

### D3 — Reputation as slashable collateral, eligibility scaled to dispute value

Not two currencies with an exchange rate — one property (*"has skin in
the game that can be lost"*) expressed two ways:

```
effectiveStake(candidate) = monetaryCollateral(candidate)
                           + reputationAtRisk(candidate)
```

- `monetaryCollateral` — BTC/USDT posted into escrow for this
  arbitration role, refundable only if never slashed.
- `reputationAtRisk` — a portion of the candidate's accumulated
  arbiter-reputation score, converted to an "at-risk" value. Reputation
  is not free to lose: a veteran arbiter with little capital but years
  of non-overturned rulings has that history itself on the line, the
  same way Bisq Easy's burned BSQ is unrecoverable capital that *is*
  the reputation, not separate from it (verified against Bisq's own
  docs — the BurningMan mechanism converts burned BSQ directly into
  standing, it is not a parallel score). **Implemented** (RFC-021 Phase
  1, `market-arbitration.provider.ts`) as
  `reputationAtRisk = arbiterReputation × REPUTATION_STAKE_FACTOR`, a
  flat tunable constant (starting `0.01`) — simpler than "using the
  same cost-to-fabricate floor D4 defines," which this RFC originally
  proposed but the real implementation does not do; `cumulativeFeesObserved`
  (D4) and `reputationAtRisk` (D3) ended up as two independent inputs
  the code never mixes, not one derived from the other. Corrected here
  to match the shipped code, not the other way around.
- **Eligibility scales to the disputed amount**: `effectiveStake ≥ k ×
  disputeValue` for a protocol/market-tunable `k`, the same
  underwriting-ratio logic real bonding/insurance already uses. This
  is what lets a low-capital, high-reputation arbiter compete for
  small-to-medium disputes broadly, while large disputes require deep
  capital, deep reputation, or both — professional escalation emerges
  from the math, not from anyone appointing "senior" arbiters.
  **Implemented** (Phase 1) with `k` = `K_ELIGIBILITY`, starting `1.5`.
- **Slashing**: an overturned ruling (D6 appeal process) burns a
  portion of `effectiveStake` — this is what makes honest ruling the
  individual-best-response strategy (a Schelling point), the one part
  of Kleros's mechanism design this RFC does keep, decoupled from its
  plutocratic selection weighting. **Implemented** (RFC-021 Phase 2,
  `MarketArbitrationProvider.slash()`): forfeits
  `SLASH_COLLATERAL_FRACTION` (starting `0.5`) of posted collateral
  plus a fixed reputation penalty (`OVERTURNED_PENALTY`, starting
  `-10`, floored at 0).

### D4 — Cost-to-fabricate floor (fee-based reputation lower bound)

A concrete, calculable mechanism from the design session's own
transcript (Yuri, audio 06), not invented independently: a
counterparty's positive reputation "bag" can always be assumed
worst-case (entirely Sybil — the trader paid fees to themselves in a
loop to inflate it). Even under that assumption, the **cumulative
protocol fees** the account paid to build that history are a real,
provable lower bound on what it cost to fabricate. If
`cumulativeFeesObserved(candidate) > k × currentTradeValue`, faking the
reputation would have cost more than the current trade is worth
scamming — which makes the fabrication economically irrational under
the same worst-case assumption.

**Corrected 2026-07-29 (RFC-021 Phase 0/3 implementation):** this
section originally claimed fee collection was "already wired via
existing settlement flows" and that `cumulativeFeesObserved` composed
directly into D3's `reputationAtRisk`. Neither was true when written —
verified against the real code before implementing, not assumed:
`src/core/policy-engine.ts`'s `FeePolicy` was a literal
`throw new Error('Not yet implemented')` stub, and no fee was ever
computed anywhere in `escrow.service.ts`. Real fee collection needed to
be built first (**Phase 0**, resolving that stub) before this floor
could be anything but a formula — `config.settlement.protocolFeeRate`
(default `0`, matching `PROTOCOL_ECONOMY.md` §6.2's documented
bootstrap-phase "Protocol Fee is OFF" default exactly, not a new
number), `Escrow.feeCharged`, and a `FeeDistribution` row recording the
same 40/30/20/10 Node Operator/Treasury/Wallet Rebate/Arbitrator
Reserve split `PROTOCOL_ECONOMY.md` §6.2 already decided — this RFC
reuses that accepted economics, it does not re-derive new percentages.
`User.cumulativeFeesObserved` (**Phase 3**) now accrues real
`Escrow.feeCharged` on every completed trade
(`common/events/handlers.ts`'s `settlement.escrow.released` reaction);
`ArbiterProfile.cumulativeFeesObserved` accrues the same, per-arbiter,
via `MarketArbitrationProvider.recordRuling()`. Both are real,
queryable numbers now (`reputation.service.ts`'s `getScore()` exposes
the trader-side one) — and both stay `0` for every participant while
`protocolFeeRate` is `0`, which is the honest number during the
bootstrap phase, not a bug. **D3 correction:** `cumulativeFeesObserved`
does **not** compose into `reputationAtRisk` in the shipped code — see
D3's own correction above; the two ended up as independent signals, not
one feeding the other.

**Known limitation, stated plainly (Yuri, audio 07 and 08):** this
floor grows slowly relative to trade size (many small fee-paying
transactions are needed before the floor exceeds a meaningful trade
value), and it cannot bootstrap a brand-new keypair from zero — see D7.

### D5 — Payment-account trust ramp (chargeback mitigation)

A separate mechanism from trader reputation, addressing a separate
risk: whether a specific payment rail (a PIX key, a bank account) is
likely to be reversed. Modeled directly on Bisq's real, shipped
mechanism — verified against Bisq's own documentation before proposing
this, not assumed:

- **Payment account age witness**: a privacy-preserving hash scheme
  lets a counterparty verify a payment account has been used before on
  this protocol, without revealing the account's real details.
- **Account signing**: after a payment account's first completed trade
  without a chargeback/reversal, a peer (initially: the assigned
  arbiter, using the same attestation framing as D1) signs it. Trade
  limits for that account start low and increase gradually with
  signed, uncontested history — mirroring Bisq's real 0.002 BTC
  starting cap that phases in fully over time.
- **Implemented** (RFC-021 Phase 4): `PaymentAccount` model in
  `prisma/schema.prisma`, `payment-account.service.ts`'s
  `hashAccountIdentifier()` (server-side SHA-256, reference/test only)
  and `@sails/sdk`'s `hashPaymentAccount()` (`@noble/hashes`, the real
  client-side path — verified byte-identical to the server's own hash
  via a dedicated cross-package test), and the trade-limit ramp
  (`UNSIGNED_TRADE_LIMIT`/`SIGNED_TRADE_LIMIT`/`ESTABLISHED_TRADE_LIMIT`/
  `TRUSTED_TRADE_COUNT`) deliberately reusing `SECURITY_MODEL.md` §1.4's
  exact tier values (0.001/0.01/0.05 BTC, unlimited) rather than a
  second, conflicting scale.

**Known limitation, stated plainly (raised directly by the project
owner, this session):** a patient attacker can "warm up" a mule/stolen
account with one small legitimate trade before using it for a larger
scam. This is not detected — it is *bounded*: the gradual limit ramp
caps the maximum possible loss at each trust tier below the realistic
cost of acquiring and warming a mule account to that tier, the same
cost-exceeds-gain argument as D4, applied to the payment rail instead
of trader reputation. High-trust, high-limit accounts remain the most
valuable target for this specific attack — an accepted residual risk,
not a solved one.

### D6 — Reputation-weighted appeal escalation

Kleros's real, genuinely good idea, kept deliberately separate from
its stake-only selection weighting (which this RFC does not copy — see
Alternatives Considered): a party dissatisfied with a ruling may
appeal to a larger panel, at increasing cost, discouraging frivolous
appeals. Unlike Kleros, the appeal panel is drawn weighted more toward
`reputationAtRisk` and less toward raw `monetaryCollateral` than the
first-instance draw — this is the mechanism's answer to the "full
nodes can refuse a majority-hashpower miner" analogy the project owner
raised: no single deep-capital actor can reliably dominate both the
first-instance draw *and* a wider, more reputation-weighted appeal
pool.

**Implemented** (RFC-021 Phase 2): `DisputeService.appeal()` reopens a
`RESOLVED` dispute (new `DisputeStatus.APPEALED`), draws the new
arbiter via `MarketArbitrationProvider.assignAppealPanel()` — panel
size `PANEL_SIZE_BASE × 2^round` (`PANEL_SIZE_BASE = 3`, Kleros's own
real starting jury size, reused for panel size only), weighted 70%
`arbiterReputation` / 30% `monetaryCollateral` within that panel, and
excludes the original arbiter. An overturned ruling triggers
`slash()` (D3); an upheld ruling slashes nothing — a denied appeal, not
a punished one. `appealFeeRequired` (`APPEAL_FEE_MULTIPLIER × ` the
escrow's already-collected protocol fee) is computed and returned but
**not yet collected** — no "pay before a ruling exists" payment
primitive is wired yet, a real, deferred gap, not a silent one (see
`docs/BACKLOG.md`).

### D7 — Bootstrap via external trust anchors

The cold-start problem Yuri named directly (audio 08): if every
brand-new keypair starts at zero and the system always assumes
worst-case for zero-reputation parties, two new participants can never
transact with each other — real-world trust has to be able to anchor
the first transaction, the same way Bisq's own account-age witness
needs a *first* trade to establish any history at all. This RFC does
not invent a new mechanism for this — it registers the requirement
that whatever onboarding/KYC-optional identity-linking flow ships
later (out of scope here) must allow a real-world trust signal
(a vouch, a signed introduction, a linked existing reputation source)
to seed a non-zero starting trust tier, rather than forcing every
identity through the same fee-accumulation bootstrap from absolute
zero.

## Known Risks — Mitigated, Not Solved

Stated explicitly and separately, per this RFC's own governing
principle: these are not closed. They are bounded enough that
exploiting them is economically irrational in the common case, the
same "theoretically possible, practically never happens" character
Bitcoin's own well-known theoretical attacks have.

1. **Capital-based Sybil** (an actor with very deep pockets buying
   enough `effectiveStake` to dominate selection). No known closed-form
   solution exists in any reviewed precedent, including Kleros. D3's
   per-dispute stake cap (mitigating, not eliminating, how much weight
   one funding source can hold) and D6's reputation-weighted appeal
   pool bound the *damage*, not the *possibility*.
2. **Warmed mule accounts** (D5's own stated limitation above).
3. **Slow bootstrap efficiency** (D4/D7's own stated limitation —
   Yuri, audio 07: "é uma evolução lenta").
4. **Market ticket-size self-limiting effect, noted as a real
   mitigating factor but not a mechanism this RFC builds**: the
   project owner observed that P2P markets naturally concentrate large
   trades with already-reputable counterparties (parties who already
   know each other skip arbitration-dependent flows entirely), which
   shrinks the population of accounts valuable enough to be worth
   attacking. This is a real, structural dampener but is an emergent
   market property, not something D1–D7 enforce directly — stated here
   so it isn't silently relied upon as if it were.

## Specification

`ArbitrationProvider` (RFC-007 D4) keeps its existing shape —
`arbitrators: string[]`, `assign(disputeId, tradeId): Promise<string>`
— as the interface `DisputeService` depends on
(`dispute.service.ts` needs no change to its own logic). This RFC adds
a new implementation alongside `TrustedArbitratorProvider`, not a
breaking change to it:

**Implemented (Phases 0-4), shipped shape — the sketch above this
correction was written before implementation and has drifted; this is
the real, current interface, not a plan:**

```typescript
// src/modules/open-settlement/arbitration-provider.ts — unchanged base
// interface, three new OPTIONAL methods (TrustedArbitratorProvider
// implements none of them).
interface ArbitrationProvider {
  name: string
  arbitrators: string[]
  assign(disputeId: string, tradeId: string): Promise<string>
  assignAppealPanel?(disputeId: string, tradeId: string, round: number, excludeParticipantId?: string): Promise<string>
  slash?(participantId: string): Promise<unknown>
  recordRuling?(participantId: string, feeObserved?: string): Promise<void>
}

// market-arbitration.provider.ts
interface ArbiterCandidate {
  participantId: string
  monetaryCollateral: string   // decimal string, RFC-009
  collateralAsset: string | null
  arbiterReputation: number
  effectiveStake: number       // monetaryCollateral + arbiterReputation * REPUTATION_STAKE_FACTOR
}

class MarketArbitrationProvider implements ArbitrationProvider {
  register(participantId: string, monetaryCollateral: string, collateralAsset?: string): Promise<ArbiterCandidate>
  getProfile(participantId: string): Promise<ArbiterCandidate | null>
  eligibleFor(disputeValue: string): Promise<ArbiterCandidate[]>
  assign(disputeId: string, tradeId: string): Promise<string>
  assignAppealPanel(disputeId: string, tradeId: string, round: number, excludeParticipantId?: string): Promise<string>
  slash(participantId: string): Promise<ArbiterCandidate>
  recordRuling(participantId: string, feeObserved?: string): Promise<void>
}

// dispute.service.ts
class DisputeService {
  appeal(disputeId: string, requestedBy: string): Promise<{ dispute: Dispute; appealFeeRequired: string }>
}
```

`ArbiterProfile` (collateral, arbiter-specific reputation, slash
tracking) and `PaymentAccount` (D5's age-witness hash, signed status,
trade-limit-relevant counters) both exist in `prisma/schema.prisma` and
extend `User`, not replace it. **`docs/DATABASE.md` does not document
either model yet** — a real, tracked gap (`docs/BACKLOG.md`), not
implied covered here.

## Backward Compatibility

- `INV-OP-1` (`PROTOCOL_INVARIANTS.md`: only the trade's buyer/seller
  or the dispute's *assigned* arbiter may trigger release/refund) is
  unchanged — this RFC changes how an arbiter becomes assigned and
  what backs their authority, not who is authorized to act once
  assigned.
- `TrustedArbitratorProvider` is not removed. A deployment may keep
  using it (e.g., for a closed/regulated context that wants a curated
  list) — `MarketArbitrationProvider` is a new, additional
  implementation of the same interface.
- **Correction (2026-07-29):** `Dispute`'s Prisma fields **did** change
  — D6's appeal flow needed real state to reopen a resolved dispute:
  `DisputeStatus` gained `APPEALED`; `Dispute` gained `appealRound Int`,
  `previousRuling DisputeRuling?`, `previousArbiterId String?`. No
  change to `DisputeRuling`'s own values or `EvidenceDescriptor`
  (`packages/sails-p2p-schemas/src/dispute.ts`) — this correction is
  scoped to what actually changed, not a broader reversal.

## Reference Implementation Plan

**Status as of 2026-07-29: all five phases below are implemented and
committed** (Phase 0 real fee collection → Phase 1 D1-D3 → Phase 4 D5 →
Phase 2 D6 → Phase 3 D4, the actual build order — not the same order
D1-D7 are numbered in, since D5/Phase 4 was independent and D4/Phase 3
needed Phase 0's fee data flowing first). This section originally read
as a punch list before any of it existed; kept below with real ✅
status per this repo's convention (`docs/DEVELOPER_JOURNEY.md`) so the
history of what was proposed vs. what shipped stays visible, not
overwritten.

0. ✅ Real Protocol Fee collection — resolved `policy-engine.ts`'s
   disclosed `FeePolicy` stub (a genuine prerequisite this RFC
   surfaced, not originally one of D1-D7): `config.settlement.protocolFeeRate`
   (default `0`), `Escrow.feeCharged`, `FeeDistribution` (the real
   40/30/20/10 split `PROTOCOL_ECONOMY.md` §6.2 already decided).
1. ✅ `ArbiterProfile` Prisma model + `register()`/`eligibleFor()`/
   `assign()` (D1-D3) — `market-arbitration.provider.ts`, gated behind
   `config.settlement.arbitrationMode`.
2. ✅ `slash()` + `assignAppealPanel()` + `DisputeService.appeal()`
   (D6) — built after (1), a real stake to slash.
3. ✅ D4's `cumulativeFeesObserved`, both the trader-side
   (`User.cumulativeFeesObserved`, wired from Phase 0's real fee data)
   and arbiter-side (`ArbiterProfile.cumulativeFeesObserved`, via
   `recordRuling()`'s `feeObserved` parameter) — built after Phase 0
   gave it a real data source, exposed via `reputation.service.ts`'s
   `getScore()`.
4. ✅ `PaymentAccount` model + age-witness hash + account signing (D5)
   — `payment-account.service.ts` (server reference hash) + `@sails/sdk`'s
   `hashPaymentAccount()` (the real client-side path).
5. 📋 D7's external-trust-anchor seeding — **still explicitly
   deferred**, unchanged from this RFC's original scope; needs its own
   design pass once an onboarding flow is scoped, out of this RFC's
   boundary.

Not built in this pass, tracked separately (`docs/BACKLOG.md`): D6's
`appealFeeRequired` is computed but not collected (no "pay before a
ruling exists" payment primitive exists yet); `docs/DATABASE.md` does
not yet document `ArbiterProfile`/`PaymentAccount`.
