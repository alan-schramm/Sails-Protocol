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

- **Multisig 2-of-3:** Buyer + Seller + Arbiter — real as of 2026-07-27
  (`multisig.provider.ts`). Buyer/seller each hold their own client-side
  key as of the same day's follow-up pass (`@satsails/p2p-trading-sdk`'s
  `generateEscrowKeypair()` + `POST /v1/settlement/escrow/:id/submit-key`)
  — the server only ever derives the arbiter's own key, the same split
  HodlHodl's real design uses. Release/refund go through a real
  client-signature-collection flow (Phase 2, same day): the server builds
  an unsigned PSBT (`POST .../initiate-release`/`initiate-refund`), each
  required party signs their own copy client-side (`@satsails/p2p-trading-sdk`'s
  `signEscrowPsbt()`) and submits it
  (`POST .../submit-transaction-signature`); once every required
  signature has arrived, the server combines and finalizes for real
  (verified end-to-end against the live server + real Postgres —
  `TODO.md` §4 has the full disclosure, including what's still deferred:
  `LIGHTNING_HODL`'s equivalent Phase 2)
- **Lightning HODL HTLC:** time-locked — real as of 2026-07-27, via Arkade
  (Ark protocol) rather than a literal LND hold-invoice
  (`lightning-hodl.provider.ts`) — plain Lightning HTLCs genuinely have no
  multi-party escrow primitive (confirmed from HodlHodl's own docs), but
  Arkade does, and HodlHodl/Lendasat both already build on it in
  production. Same client-held-keys upgrade as Multisig above, and — as
  of the same day's second follow-up pass — the same real
  client-signature-collection Phase 2 too: `@arkade-os/sdk`'s `SingleKey`
  (a raw-private-key signer, no ASP/wallet machinery needed) was verified
  to bundle cleanly for a browser target before this was built. Release/
  refund go through `POST .../initiate-release`/`initiate-refund` +
  `.../submit-transaction-signature`, same routes MULTISIG uses — the
  server never inspects the signed-payload format, so both providers
  share one generic orchestration layer (`TODO.md` §4 has the full
  disclosure, including what's still unverified: a live run against a
  real funded mutinynet VTXO, which this environment cannot originate)
- **Liquid Covenant:** script-enforced — not implemented at all yet, same
  live-infrastructure blocker as Lightning above

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
   §5 for the full technical detail. **RFC-020**
   (`rfcs/RFC-020-non-custodial-evm-settlement.md`, RFC-019's Phase 2)
   registers real engineering progress toward the fix — a Safe
   Transaction Guard + ERC-4337 escrow with a KMS-backed co-signer,
   specified and tested but not deployed or wired into
   `WdkSettlementProvider`'s actual release path — see that RFC's
   Threat Matrix (§6) for the full risk breakdown. The `MOCK` `SettlementProvider`
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

Seller provides no evidence of non-payment beyond the timeout. The
escrow's protocol expiry deadline passes → escrow refunds the seller
automatically. The buyer's suspicious non-payment pattern is logged to
the reputation system.

**Terminology note, Missão 11 Fase 9.1 §9 (2026-08-24):** "Timelock" in
this document (and this codebase's `timelockHours`/`DEFAULT_TIMELOCK_HOURS`
naming) means an **administrative protocol deadline** —
`Escrow.expiresAt`, a plain server wall-clock value
(`lockedAt + timelockHours`) checked by application logic. It has no
Bitcoin-native (CLTV/CSV) counterpart in `MultisigProvider`'s actual
P2WSH script for Gen-1 — the script itself enforces nothing about time at
all. Expiry never grants the server, or anyone, unilateral spending
authority: the automatic refund below still routes through
`sweepExpiredEscrows()` → the same `refundFunds()` path a manual refund
uses, `triggeredBy` always the trade's own seller (never a fabricated
"system" actor), and for MULTISIG specifically still requires the normal
cooperative buyer+seller signature pair — an expired timelock with no
cooperative resolution can *only* be recovered via a dispute (arbiter
co-signature), never unilaterally by the server. Retrofitting a real
on-chain CLTV/CSV timelock into Gen-1 is explicitly out of scope for this
phase (see RFC-024 for the documented Gen-2 target architecture where
that changes); this note exists so no reader mistakes "timelock" here for
cryptographic, on-chain enforcement.

**Corrected/Implemented 2026-08-24 — the paragraph below was stale.**
This section previously said "the automatic part of this scenario is not
implemented... no proactive sweeper exists," which was accurate when
written (2026-07-19) but has since been closed: `escrow.service.ts`'s
`sweepExpiredEscrows()` is real, queries every `Escrow` still
`FUNDS_LOCKED` past its own `expiresAt`, and calls the existing
`refundFunds()` for each (per-escrow try/catch, one failure doesn't block
the rest) — wired into `app.ts`'s `startServer()` as a `setInterval`
(`config.trade.timelockSweepIntervalMs`, default 5 min), gated behind
`config.features.escrowTimelockSweeper`
(`ESCROW_TIMELOCK_SWEEPER`, default `false`). See `BACKLOG.md`'s "Escrow
timelock proactive sweeper" row (closed 2026-08-01) for the full detail
and test coverage. The scenario described above is now real when that
flag is enabled, not aspirational.

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

**Corrected 2026-07-29 (RFC-021 implementation):** the "earlier vision"
the 2026-07-19 correction above describes as unbuilt is now real, not
speculative — `docs/rfcs/RFC-021-market-based-arbitration-and-payment-trust.md`
is the deliberate, documented revival of exactly that permissionless
model, built because the original blocker ("no bonding/collateral
mechanism exists in code") no longer applies. `MarketArbitrationProvider`
(`open-settlement/market-arbitration.provider.ts`) implements real
collateral-and-reputation-weighted registration (`register()`), eligibility
(`eligibleFor()`), first-instance selection (`assign()`), a
reputation-weighted appeal panel that grows per round (`assignAppealPanel()`),
and real slashing on an overturned ruling (`slash()` — forfeits
`SLASH_COLLATERAL_FRACTION` of posted collateral plus a reputation
penalty, `docs/DATABASE.md`'s `ArbiterProfile` model). `TrustedArbitratorProvider`
is **not deleted** — a deployment chooses between the two via
`config.settlement.arbitrationMode` (`'trusted-list'` default,
`'market'` opt-in), the same "off by default, explicit env var" pattern
`MOCK_ESCROW`/`REQUIRE_DUAL_APPROVAL_RELEASE` already use. The residual
risk this doesn't close — capital-based Sybil attacks on the market
model itself, no closed-form solution — is disclosed in RFC-021's own
"Known Risks — Mitigated, Not Solved" section, not implied fixed by this
correction.

### Resolution Principles

- QVAC assists analysis locally and privately — no cloud dependency (future)
- Multisig 2-of-3 prevents any unilateral fund release
- Reputation penalties apply to bad-faith disputes
- A Trusted Arbitrator's own reputation is the incentive for a fair
  ruling — a bad ruling is visible and permanent, not just a lost fee
- Protocol-expiry fallbacks handle no-response scenarios automatically —
  **real since 2026-08-01** (`sweepExpiredEscrows()`, gated behind
  `ESCROW_TIMELOCK_SWEEPER`; see Scenario B's own correction above and
  `BACKLOG.md`'s "Escrow timelock proactive sweeper" row). An
  administrative deadline, not a Bitcoin-native on-chain timelock — see
  Scenario B for the full terminology note
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
