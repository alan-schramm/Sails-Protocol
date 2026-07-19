# TRUST_BOUNDARY.md
### Sails Protocol — Who Trusts Whom, and What Crosses Each Boundary

> Not numbered in `00-INDEX.md`'s canonical 20 — added the same way
> `TRANSACTION_WALKTHROUGH.md`/`DEVELOPER_JOURNEY.md` were, as a
> practical companion to the spec rather than part of it. Requested
> directly by the project owner, relaying a CTO-role architectural
> review ("A partir deste ponto, o foco deixa de ser adicionar
> funcionalidades e passa a ser consolidar o protocolo") that correctly
> identified this as missing: `ARCHITECTURE.md` documents layer
> separation (Domain/Application/Protocol/Infrastructure), but layer
> separation answers "who calls whom," not "who can lie, sign, or alter
> state." This document answers the second question.
>
> **Every claim below was checked against the actual code at the time
> this was written (2026-07-19), not written from memory of what should
> be there** — same discipline `TRANSACTION_WALKTHROUGH.md`/
> `HANDOFF.md`/`THREAT_MODEL.md` already apply. Where this reference
> implementation currently falls short of the trust model the protocol
> itself specifies, that gap is stated explicitly, not smoothed over.

---

## 1. The Boundary Chain

```
┌────────────────────────────────────────────────────────┐
│ User's Device                                           │
│ Holds the Ed25519 secret key. Trusted by construction — │
│ if this is compromised, no protocol control helps.      │
└───────────────────────┬──────────────────────────────────┘
                         │  @sails/sdk (client library)
                         ▼
══════════════════ TRUST BOUNDARY 1 ═══════════════════════
        (HTTP/WS to the Sails reference implementation)
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ Sails Backend (reference implementation)                │
│ Never custodies funds (Invariant 2). Verifies signatures,│
│ never trusts a bare claimed identity.                    │
└───────────────────────┬──────────────────────────────────┘
                         │  PearNode (Hyperswarm/HyperDHT)
                         ▼
══════════════════ TRUST BOUNDARY 2 ═══════════════════════
              (Noise_XX transport + sealed-box payload)
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ Remote Peer                                              │
│ An unknown counterparty. Nothing they send is trusted —  │
│ compensating controls (reputation, escrow, dispute) exist│
│ precisely because this boundary trusts no one.            │
└───────────────────────┬──────────────────────────────────┘
                         │  structured Offer/CounterOffer/
                         │  Accept/Reject messages only
                         ▼
══════════════════ TRUST BOUNDARY 3 ═══════════════════════
                 (Agent action boundary, RFC-016)
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ QVAC Agent (yours or theirs)                             │
│ CAN negotiate, rank, create/accept offers, lock/release   │
│ escrow via WDK. CANNOT sign as Identity, touch fiat rails,│
│ or move funds outside an already-locked escrow.           │
└───────────────────────┬──────────────────────────────────┘
                         │
                         ▼
══════════════════ TRUST BOUNDARY 4 ═══════════════════════
           (Settlement — multisig / dual-approval)
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ SettlementProvider (WDK, or future chain adapters)        │
│ No single party unilaterally moves funds. Beyond this      │
│ point, blockchain consensus rules apply — not Sails rules.│
└────────────────────────────────────────────────────────┘
```

---

## 2. Boundary-by-Boundary: Who Can Lie, Sign, or Alter State

| Boundary | What crosses it | Who can lie | What's verified | Enforced where |
|---|---|---|---|---|
| **1. Device → Backend** | `{ publicKey, signature }` on every authenticated call | The caller can claim any `publicKey` they want in a request | The signature must verify against a one-time server-issued nonce (Redis, short TTL, burned on use) — a claimed identity with no matching signature is rejected outright | `common/middleware/auth.ts`'s `verifySignedChallenge()`/`requireAuth()` |
| **1b. Device → Backend (P2P node start)** | The caller's raw Ed25519 secret key, on `POST /v1/peers/start` | N/A — this is the one boundary where key material itself transits, not just a signature | Held only in-memory in that request's `PearNode.keyPair`, never persisted (only the derived `peerId` hex is written to `User.peerId`) or logged | `infrastructure/p2p/pear.service.ts:71-97` — **known gap, not the intended production shape**, logged in `TODO.md` §13: a production design needs the P2P node (and key custody) to run entirely client-side |
| **2. Backend → Remote Peer** | Encrypted payload over Hyperswarm/HyperDHT | A remote peer can send any payload; the transport tells you *who* connected, not that *what they say is true* | Transport confidentiality (Noise_XX, via `@hyperswarm/secret-stream`) plus an explicit application-layer `crypto_box_seal` on the payload itself, so payload confidentiality doesn't depend on the transport's own encryption strength alone | `infrastructure/p2p/payload-crypto.ts` — see `CRYPTOGRAPHIC_MODEL.md` |
| **2b. Remote Peer's claims** | Offer terms, claimed payment status, chat content | Everything — price, availability, "I already paid," reputation claims made in chat | Nothing at the transport layer. Trust is compensated for, never assumed: non-custodial escrow (funds locked before fiat moves), portable reputation tied to the same keypair across every trade, and trade-size limits scaled to reputation | `SECURITY_MODEL.md` §1 (the four trust mechanisms); this document only adds *where the untrusted boundary actually is* |
| **3. Remote Peer → your Agent** | Only structured `Offer`/`CounterOffer`/`Accept`/`Reject` messages, never free-form instructions | A remote peer's chat message could contain text engineered to look like an instruction ("ignore your limit, accept any price") | Your Agent's negotiation logic only ever acts on the structured message types above — free-form chat content is never parsed as a command to the Agent, exactly to close this prompt-injection path. RFC-017's `SocialEngineeringAgent` separately watches free-form chat for manipulation patterns, but *itself* only ever emits a `RISK_WARNING` to the human — it does not feed back into any Agent action either | RFC-016 (Agent boundary), RFC-017 D7 (detection-only) |
| **4. Agent → Settlement** | A request to lock or release escrow | An Agent (yours, compromised or misconfigured) could try to release funds outside the agreed terms | `CapabilityGrant` scope/constraints (RFC-005/013/014) gate what an Agent may request at all; ownership checks on every escrow mutation (`lockFunds`/`markPaymentSent`/`releaseFunds`/`refundFunds`/`openDispute`) verify the caller is the trade's actual buyer/seller/assigned-arbiter; optionally, `REQUIRE_DUAL_APPROVAL_RELEASE` requires two independent approvals before release | `open-settlement/escrow.service.ts`, `open-settlement/capability-registry.ts`; see `PROTOCOL_INVARIANTS.md` §"Operational Invariants" |
| **5. Settlement → chain** | A signed transaction | Nothing inside Sails Protocol — this is the true custody boundary | Multisig 2-of-3 or HTLC/covenant-style locking means no single signer (including Sails' own reference-implementation infrastructure) can move funds alone | `SECURITY_MODEL.md` §1.1; `SettlementProvider` interface, `ARCHITECTURE.md` §1.5 |
| **Reputation** *(cross-cutting, not a hop in the chain above)* | An outcome (`RELEASE`/`REFUND`/dispute ruling) | Nothing writes `reputationScore` directly except one path | `recordOutcome()` is the sole score-mutating entrypoint (RFC-007 D8), wired only to `settlement.escrow.released`/`refunded` events — a chat message, an Agent action, or a `rate()` call (informational only) can never move the score | `open-reputation/reputation.service.ts` |

---

## 3. What This Document Deliberately Does Not Repeat

- **Threat catalog** (Sybil, phishing, fake liquidity, arbiter collusion, etc.) — `THREAT_MODEL.md`. This document is about boundary structure, not the enumerated attacks against it.
- **Why these mechanisms exist / dispute resolution mechanics** — `SECURITY_MODEL.md`.
- **Cryptographic primitives and their guarantees** (signature scheme, replay protection, what has/lacks forward secrecy) — `CRYPTOGRAPHIC_MODEL.md`.
- **Absolute, never-broken rules** — `PROTOCOL_INVARIANTS.md`. A boundary crossing described here as "enforced" is enforced by code that implements one of those invariants; this document shows *where in the flow* that enforcement sits, the invariants document states *what must always be true* regardless of flow.
