# THREAT_MODEL.md
### Sails Protocol — Engineering Handoff · Document 8 of 20

> Security is a **protocol-level property**, not an application-level
> policy. Every integrator that builds on Sails inherits the same threat
> mitigations described here — that's the point of putting them in the
> protocol spec rather than leaving them to each reference implementation.

---

## 1. Threat Catalog

| Threat | Severity | Mitigation |
|---|---|---|
| **Fake Liquidity** | High | QVAC (once implemented) detects offers with zero completion history. Trust limits: new peers have low trade caps until volume is proven (see `SECURITY_MODEL.md` section on trust limits). |
| **Sybil Attack** | High | Reputation requires real Bitcoin volume — zero volume means low score means low trust limits. Creating many fake identities has real economic cost, not just effort. |
| **PIX / Fiat Proof Fraud** | High | QVAC image analysis + pattern matching (future). Repeated fake receipts from the same keypair get auto-flagged. Today, this relies on the counterparty's own judgment plus dispute resolution. |
| **Chat Phishing** | Medium | URL detection in Secretstream messages (future QVAC capability). Suspicious patterns — links, urgency, requests to pay outside the agreed method — should be flagged. |
| **Reputation Manipulation** | Medium | Anti-double-rating enforced at the database level (`@@unique([tradeId, raterId])`). QVAC (future) detects coordinated rating groups: same IP, same timing, circular trades between colluding accounts. |
| **Escrow Exploit** | High | Escrow is always architecturally separate from the application (see `ARCHITECTURE.md` layer-violation fix). Multisig 2-of-3 — no single entity controls funds alone. Third-party security audit required before mainnet (see `ROADMAP.md`). |
| **API Abuse / DDoS** | Low | Rate limiting per keypair + IP (not yet implemented — see `TODO.md`). API keys carrying their own reputation score. Sandbox environment kept separate from production. |
| **Custody Creep** | High | Architectural guarantee: no Sails server ever holds user keys or funds. The `SettlementProvider` interface enforces this at the code level — implementations must go through escrow, never direct custody. |
| **Malicious Arbiter Collusion** *(v7.4 — CTO review finding)* | High | An arbiter colluding with one counterparty to rule unfairly. Mitigated by the Reputation-as-bond mechanism (`SECURITY_MODEL.md` §3) — a bad ruling damages the arbiter's `ReputationScore` publicly and permanently, across every module that reads reputation, not just the one dispute. |
| **Fabricated Dispute Evidence** *(v7.4)* | Medium | A party submits falsified `Proof` (`PROTOCOL_SPECIFICATION.md` §1.8) to win a dispute. Mitigated by requiring `Proof.verifiedBy` from an independent party where possible, and by QVAC-assisted evidence analysis (future — see `THREAT_MODEL.md` §4 for current-gap honesty on QVAC status). |
| **Arbitration Griefing** *(v7.4)* | Low | A party opens disputes in bad faith purely to delay settlement. Mitigated by the Dispute primitive's `openedBy` field feeding directly into Reputation's dispute-rate component (`PROTOCOL_SPECIFICATION.md` §1.6) — frequent bad-faith disputes are visible and penalized. |

---

## 2. Lessons From Bisq (why this threat model exists in this shape)

A comparable non-custodial P2P protocol (Bisq) suffered security incidents
that were **not** failures of Bitcoin itself — they were failures of
protocol and application architecture: absent custody controls, isolated
escrow logic, weak multisig enforcement, and reputation systems vulnerable
to Sybil attacks.

Sails Protocol's threat model was designed learning directly from those
failure modes:

- **No custody, ever** — eliminates the largest attack surface outright
  (there is no hot wallet, cold wallet, or treasury to compromise)
- **Escrow isolation** — compromising the reference implementation's
  infrastructure does not expose funds in escrow, because escrow logic is
  architecturally separate (see the layer-violation fix in
  `ARCHITECTURE.md`)
- **Multisig, not single-key release** — no one party (including Satsails)
  can unilaterally move funds
- **QVAC-assisted fraud detection runs locally** — no cloud dependency, no
  centralized honeypot of user financial intent data
- **Anti-Sybil reputation tied to real volume** — much more expensive to
  attack than a simple account-creation-based reputation system

---

## 3. Threat Severity Definitions

- **High** — could result in loss of user funds, systemic trust failure, or
  regulatory exposure. Must be mitigated before any mainnet/production
  deployment with real value at stake.
- **Medium** — degrades trust or user experience but does not directly risk
  fund loss. Should be mitigated before wide public adoption.
- **Low** — operational/availability concern. Should be addressed but does
  not block early-stage deployment.

---

## 4. What Is NOT Yet Mitigated (be honest about current gaps)

- **No rate limiting exists in the current code fragment** — `TODO.md` has
  this as an open item.
- **No production security audit has been performed.** The roadmap
  (`ROADMAP.md`) allocates 20% of grant funding specifically to third-party
  audits, scoped initially to OpenP2P + OpenSettlement (the two modules with
  real code).
- **QVAC-based fraud detection is entirely unimplemented** — every
  mitigation above that references "QVAC (future)" is a design intention,
  not a working control. Do not represent it as active protection in any
  external-facing material until it exists.
- **The `PearPeerManager` singleton bug** (documented and fixed in
  `NODE_ARCHITECTURE.md`) was itself a threat — a second user's node could
  silently corrupt state. This is resolved as of this handoff, but is a
  good example of how an architectural bug becomes a security issue in a
  multi-tenant P2P system.

---

## 5. Reporting and Response

No formal security disclosure process exists yet for this project. Until one
is established, treat any discovered vulnerability as High severity by
default and do not deploy affected code to any environment handling real
value.
