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

- ~~No rate limiting exists in the current code fragment~~ **Resolved**
  *(2026-07-18)* — `@fastify/rate-limit` is real, registered globally
  (`config.rateLimit.max`/`timeWindow`, default 100/minute per IP) with a
  tighter, independently-tracked override on `/v1/identity/challenge` and
  `/v1/identity/authenticate` (`config.rateLimit.authMax`/`authTimeWindow`,
  default 10/minute per IP each — RT-002's own "this is the field that
  matters most" note), verified in `tests/rateLimit.test.ts`. Not pooled
  across the two auth routes into one shared budget — a deliberate
  simplification (`app.ts`'s own comment), not an oversight. Still open:
  no per-API-key tier (only per-IP), and a deployment behind a reverse
  proxy needs Fastify's `trustProxy` option configured separately for
  `request.ip` to reflect the real client.
- ~~The Intent API (`POST /api/v1/intents`, `DELETE /api/v1/intents/:id`)
  had no authentication at all~~ **Resolved** *(2026-07-18)* — found
  during a general gap audit (not a report from an external party):
  `participantId` was accepted directly from the request body with zero
  proof of ownership, the exact RT-002 vulnerability
  `common/middleware/auth.ts`'s own doc comment specifically warns
  against ("a route that reads `req.body.userId` directly instead of
  `req.participantId` set by this middleware is exactly the RT-002
  vulnerability again") — reintroduced in this one route, which predates
  the auth middleware and was never retrofitted. Both routes now require
  `requireAuth`; `participantId` is derived from the session only.
  `intentEngine.cancel()` also had no ownership check at all — any caller
  could cancel any Intent by id — now requires and verifies
  `cancelledBy` matches the Intent's own `participantId`. `@sails/sdk`'s
  `createIntent()`/`cancelIntent()` updated to send real auth headers;
  `participantId` dropped as a caller-supplied argument entirely (closing
  a previously-noted `SDK_GUIDE.md` deviation as a side effect — the SDK
  now matches its documented one-argument-plus-payload shape). Verified
  in `tests/routes.test.ts`'s new "Intent API" block and
  `packages/sails-sdk/tests/client.test.ts`.
- ~~No escrow mutation verified the caller was actually a party to the
  trade~~ **Resolved** *(2026-07-18)* — same audit, a deeper instance of
  the same class of bug: `escrow.service.ts`'s `lockFunds()`/
  `markPaymentSent()`/`releaseFunds()`/`refundFunds()`/`openDispute()`
  all trusted `triggeredBy` at face value with no check it was the
  trade's actual buyer/seller (or, for release/refund, the dispute's
  assigned arbiter) — any authenticated participant on the platform could
  lock, confirm, release, refund, or dispute *any other trade's* escrow
  via `settlement.routes.ts`'s direct routes. `dispute.service.ts`'s own
  `raiseDispute()`/`resolveDispute()` already validated their own callers
  correctly and were not the gap; the lower-level `EscrowService` methods
  they call into (and that other routes call into directly) were. Fixed
  with real ownership checks in every method, verified in the new
  `tests/escrowReleaseControls.test.ts` "ownership/IDOR checks" block (11
  new tests covering all five methods, including that a dispute arbiter
  is still correctly authorized to release/refund).
- ~~`POST /v1/capabilities/:grantId/revoke` let any authenticated
  participant revoke any grant, not just their own~~ **Resolved**
  *(2026-07-18)* — `capabilityRegistry.revoke()` now verifies the caller
  is the grant's own `grantedTo` (self-issued grants only in this pass,
  RFC-013's own scope cut — `grantedTo === issuedBy` always holds today).
- ~~`POST /v1/reputation/rate` never verified the rater/rated were
  actual trade counterparties~~ **Resolved** *(2026-07-18)* — lower
  severity than the findings above (ratings are informational only,
  `reputation.service.ts`'s own header comment — never touch
  `reputationScore`), but still a real spam/abuse vector: an
  authenticated participant could rate a trade they had nothing to do
  with, attributed to an arbitrary `ratedId`. `rate()` now verifies
  `raterId` is the trade's buyer or seller and `ratedId` is specifically
  the *other* party.
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
