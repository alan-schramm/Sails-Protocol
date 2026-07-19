# SECURITY_MODEL.md
### Sails Protocol — Engineering Handoff · Document 9 of 20

> Where `THREAT_MODEL.md` catalogs *what could go wrong*, this document
> describes the *trust mechanisms* that make the protocol usable between
> two strangers in the first place, and what happens when something does
> go wrong (dispute resolution). Two companion documents narrow further:
> `TRUST_BOUNDARY.md` maps *where* in the request flow each mechanism
> below sits, and `CRYPTOGRAPHIC_MODEL.md` covers the actual cryptographic
> mechanics (signature scheme, replay protection, encryption) this
> document only names in passing (e.g. "Ed25519 keypair" in §1.3).

---

## 1. Trust Without a Trusted Third Party

The central question any evaluator will ask: **why would a participant
trust an unknown counterparty in a non-custodial system?** Four concrete
mechanisms answer this — "non-custodial" alone is not a sufficient answer.

### 1.1 Non-Custodial Escrow

Funds are locked in a smart contract or multisig *before* fiat is sent. No
single party can access the funds alone — release requires bilateral or
arbitrated action.

- **Multisig 2-of-3:** Buyer + Seller + Arbiter
- **Lightning HODL HTLC:** time-locked
- **Liquid Covenant:** script-enforced

### 1.2 Portable Reputation

Score tied to the Ed25519 keypair — not to a platform account. Built from
completed trades, settlement speed, dispute history, and volume over time.

- **Trade Score** — mutual ratings, 1-5
- **Volume Score** — BTC-equivalent volume over time
- **Dispute Rate** — inversely proportional; penalizes bad-faith disputes

### 1.3 Verifiable Identity

Participants prove control of their keypair via digital signature. No
email, no phone number required at the base level — optional verification
levels unlock higher trust limits.

- **Level 0:** keypair only
- **Level 1:** phone verified
- **Level 2:** optional documents + on-chain history

### 1.4 Trade Limits by Trust

Higher-value trades unlock as reputation score increases. New or
low-reputation peers can only trade small amounts until they build real
history.

| Reputation | Max trade size |
|---|---|
| New peer (score 0-20) | 0.001 BTC |
| Score 21-50 | 0.01 BTC |
| Score 51-89 | 0.05 BTC |
| Score 90+ (verified) | No protocol-imposed limit |

---

## 2. Six Security Principles

1. **Non-Custodial by Design** — Sails never holds funds. No hot wallet,
   cold wallet, or treasury exists anywhere in the architecture.
2. **User Always Signs** — every action that moves funds requires the
   user's own WDK signature. No server can initiate a transaction on a
   user's behalf.

   **Real-implementation gap found 2026-07-19** (a CTO-directed fidelity
   audit comparing this principle against the actual code, not just its
   design): the one real, tested `SettlementProvider` —
   `WdkSettlementProvider` (`wdk-settlement.provider.ts`) — does not
   satisfy either principle 1 or 2 as written. It derives every escrow's
   signing key from **one server-held seed phrase**
   (`config.wdk.seedPhrase`, env var `WDK_SEED_PHRASE`) that also
   controls a treasury account — the file's own header comment states
   this plainly: "single-seed, two-hop escrow, not a trustless multisig
   ... the same key that can lock funds can also move them anywhere."
   `releaseFunds()` needs no user-supplied signature or credential at
   all; the server signs unilaterally. This is a genuine violation of
   `PROTOCOL_INVARIANTS.md`'s Constitutional Invariant 2 ("The Protocol
   Never Custodies Assets") **in the one real settlement path this
   codebase ships today** — not a documentation phrasing issue, a real
   custody gap. It is explicitly disclosed at the code level (not
   hidden), is testnet-only, and **RFC-019**
   (`rfcs/RFC-019-settlement-custody-reference-vs-normative.md`) is the
   accepted, registered migration plan — see `CRYPTOGRAPHIC_MODEL.md`
   §5 for the full technical detail. The `MOCK` `SettlementProvider`
   (the only other implementation) and the protocol's own design
   (multisig 2-of-3, per §1.1 above) are unaffected — this is specific
   to `WDK_USDT_EVM`'s current implementation, not a design flaw.
3. **Escrow Isolation** — escrow logic is architecturally separate from the
   application layer (see the layer-violation fix documented in
   `ARCHITECTURE.md`). Compromising reference-implementation infrastructure
   does not expose escrowed funds.
4. **Zero Single Point of Failure** — HyperDHT is distributed, Secretstream
   is E2E, the order book is (eventually) replicated. No single server
   holds critical state.
5. **AI-Assisted Fraud Detection (future)** — QVAC will monitor patterns
   locally: new accounts with high volume, repeated PIX keys across
   accounts, coordinated rating manipulation. Not yet implemented — see
   `THREAT_MODEL.md` section 4.
6. **Open & Auditable** — the protocol spec is public; any researcher can
   audit it. Security guarantees live at the protocol level, so every
   integrator inherits them rather than re-deriving their own.

---

## 3. Dispute Resolution Layer

Even without custody, disputes are inevitable in any real market. The
protocol has a planned resolution layer — not custodial arbitration, but
verifiable, evidence-based mechanisms.

### Scenario A: Payment sent, asset not released

Buyer provides fiat receipt via Secretstream chat. QVAC (future) analyzes
the payment proof. A 24-hour timeout auto-escalates. Multisig requires the
arbiter to co-sign the release if the seller is unresponsive or acting in
bad faith.

### Scenario B: Asset locked, payment not received

Seller provides no evidence of non-payment beyond the timeout. Timelock
expires → escrow refunds the seller automatically. The buyer's suspicious
non-payment pattern is logged to the reputation system.

### Scenario C: Disputed payment proof

A **Trusted Arbitrator** — assigned via `ArbitrationProvider`, registered
per application (never a protocol-native role, per RFC-007 D4 and
`PROTOCOL_SPECIFICATION.md` §1.9's own explicit reasoning: this
deliberately avoids implying the protocol itself governs or controls
arbitration outcomes) — reviews the evidence in the chat history. Their
decision triggers the multisig 2-of-3 release, recorded as the `Dispute`
primitive's `ruling`. **Corrected 2026-07-19 (consolidation audit):**
this scenario previously described a permissionless "community volunteer
holding a reputation bond, fee drawn from bonded collateral" model — an
earlier vision that RFC-007 D4 replaced with the application-registered
Trusted Arbitrator model actually implemented
(`open-settlement/arbitration-provider.ts`'s `TrustedArbitratorProvider`,
`API_REFERENCE.md`'s `TRUSTED_ARBITRATORS` config). No bonding/collateral
mechanism exists in code; an arbiter's incentive today is their own
`ReputationScore`, publicly and permanently damaged by a ruling the
network judges unfair (`THREAT_MODEL.md`'s "Malicious Arbiter Collusion"
entry) — reputation-as-bond, not collateral-as-bond.

### Resolution Principles

- QVAC assists analysis locally and privately — no cloud dependency (future)
- Multisig 2-of-3 prevents any unilateral fund release
- Reputation penalties apply to bad-faith disputes
- A Trusted Arbitrator's own reputation is the incentive for a fair
  ruling — a bad ruling is visible and permanent, not just a lost fee
- Timelock fallbacks handle no-response scenarios automatically
- Dispute history is public on the reputation layer — repeat bad actors
  become visible to the whole network, not just one counterparty

---

## 4. Privacy by Design

Privacy is architecture, not policy — a deliberate constraint on what data
the protocol collects, not a promise about how collected data is handled.

1. **Data Minimization** — infrastructure collects only trade-state events,
   offer metadata, and reputation scores. No personal data, IP logs, or
   payment details are collected at the protocol level.
2. **Direct P2P Communication** — all chat is Secretstream E2E via
   HyperDHT. Messages are never routed through or logged by any Sails
   server.
3. **No Mandatory Identity** — a keypair is sufficient to participate.
   Phone/document verification is optional, only needed for higher trust
   limits.
4. **Local AI Intelligence** — QVAC agents (future) run entirely on the
   user's device. Matching, fraud detection, and counterparty scoring never
   send data to the cloud.
5. **User Controls Their Data** — trade history is stored locally by the
   user's own client. Reputation is on-protocol but linked only to the
   keypair, not to any real-world identity.
6. **Permissionless Participation** — no account creation, email, or KYC
   required at the protocol level. Applications built on the protocol may
   add their own requirements, but the protocol itself stays open.
