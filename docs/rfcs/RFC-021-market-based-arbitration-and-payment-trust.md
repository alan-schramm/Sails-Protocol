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

**Status:** Proposed. Synthesized from a design session between the
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
this session).

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
  arbiter-reputation score, converted to an "at-risk" value using the
  same cost-to-fabricate floor D4 defines. Reputation is not free to
  lose: a veteran arbiter with little capital but years of
  non-overturned rulings has that history itself on the line, the same
  way Bisq Easy's burned BSQ is unrecoverable capital that *is* the
  reputation, not separate from it (verified against Bisq's own docs —
  the BurningMan mechanism converts burned BSQ directly into standing,
  it is not a parallel score).
- **Eligibility scales to the disputed amount**: `effectiveStake ≥ k ×
  disputeValue` for a protocol/market-tunable `k`, the same
  underwriting-ratio logic real bonding/insurance already uses. This
  is what lets a low-capital, high-reputation arbiter compete for
  small-to-medium disputes broadly, while large disputes require deep
  capital, deep reputation, or both — professional escalation emerges
  from the math, not from anyone appointing "senior" arbiters.
- **Slashing**: an overturned ruling (D6 appeal process) burns a
  portion of `effectiveStake` — this is what makes honest ruling the
  individual-best-response strategy (a Schelling point), the one part
  of Kleros's mechanism design this RFC does keep, decoupled from its
  plutocratic selection weighting.

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
the same worst-case assumption. This composes with D3: it is one input
into `reputationAtRisk`.

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
- This is genuinely new schema work (`docs/BACKLOG.md`-tracked, not
  built yet) — no `PaymentAccount` model exists in `prisma/schema.prisma`
  today; `paymentMethod`/`paymentDetails` on `Offer` are opaque strings
  with no age or signature tracking. Stated here explicitly rather than
  implied to already exist.

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

```typescript
// New: market-based ArbitrationProvider implementation (RFC-021),
// registered alongside — not replacing — TrustedArbitratorProvider.
// An application may still choose the static allowlist for a closed
// deployment; this is the permissionless option.
interface ArbiterCandidate {
  participantId: string
  monetaryCollateral: string          // decimal string, RFC-009
  reputationScore: number             // arbiter-specific, separate from trader reputationScore
  cumulativeFeesObserved: string      // D4's fabrication-cost floor input
  registeredAt: string                // ISO 8601
}

interface MarketArbitrationProvider extends ArbitrationProvider {
  // D2 — permissionless; no approval step beyond posting collateral.
  register(candidate: Omit<ArbiterCandidate, 'registeredAt'>): Promise<ArbiterCandidate>

  // D3 — effectiveStake(candidate) computed here; only candidates
  // clearing effectiveStake >= k * disputeValue are eligible.
  eligibleFor(disputeId: string, disputeValue: string): Promise<ArbiterCandidate[]>

  // D6 — escalation; panelSize grows, panel skews toward reputationAtRisk.
  appeal(disputeId: string, requestedBy: string): Promise<{ panel: string[]; cost: string }>

  // Slashing hook — called on an overturned ruling (D3).
  slash(arbiterId: string, disputeId: string, amount: string): Promise<void>
}
```

New Prisma schema surface needed (📋 Planned, not built this pass):
`ArbiterProfile` (collateral, arbiter-specific reputation, slash
history) and `PaymentAccount` (D5's age-witness hash, signed status,
current trade-limit tier). Both extend existing models
(`User`/`Escrow`) rather than replacing them.

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
- No change to `Dispute`'s Prisma fields, `DisputeRuling`, or
  `EvidenceDescriptor` (`packages/sails-p2p-schemas/src/dispute.ts`).

## Reference Implementation Plan

Phased, honestly tagged per this repo's ✅/🏗️/📋 convention
(`docs/DEVELOPER_JOURNEY.md`):

1. 📋 `ArbiterProfile` Prisma model + `register()`/`eligibleFor()` —
   D2/D3's core registration and eligibility math, no slashing yet.
2. 📋 `slash()` + appeal panel draw (D6) — depends on (1) existing
   first so there is a real stake to slash.
3. 📋 D4's `cumulativeFeesObserved` computation — depends on real fee
   collection already being wired (it is, via existing settlement
   flows) but needs a query surface built.
4. 📋 `PaymentAccount` model + age-witness hash + account signing (D5)
   — independent of (1)-(3), can be built in parallel.
5. 📋 D7's external-trust-anchor seeding — explicitly deferred; needs
   its own design pass once an onboarding flow is scoped, out of this
   RFC's boundary.

None of this is built yet as of this RFC's Proposed status — this
section is the punch list the project owner asked for ("após isso já
vemos o que tem para ser implementado no código"), not a claim of
completed work.
