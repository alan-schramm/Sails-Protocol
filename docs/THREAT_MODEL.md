# THREAT_MODEL.md
### Sails Protocol — Engineering Handoff · Document 8 of 20

> Security is a **protocol-level property**, not an application-level
> policy. Every integrator that builds on Sails inherits the same threat
> mitigations described here — that's the point of putting them in the
> protocol spec rather than leaving them to each reference implementation.
> `TRUST_BOUNDARY.md` complements this catalog with the structural
> question it doesn't answer directly: at each hop in a real request
> flow, who is on the other side, and what can they lie about regardless
> of which threat below is or isn't in play.

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
| **API Abuse / DDoS** | Low | Rate limiting per IP is real (`@fastify/rate-limit`, resolved 2026-07-18 — see §4 below for the exact config and its still-open gaps). Per-keypair/API-key limiting and "API keys carrying their own reputation score" remain design intentions, not built. Sandbox environment kept separate from production. |
| **Custody Creep** | High | Architectural guarantee: no Sails server ever holds user keys or funds. The `SettlementProvider` interface enforces this at the code level — implementations must go through escrow, never direct custody. |
| **Malicious Arbiter Collusion** *(v7.4 — CTO review finding; updated 2026-07-29, RFC-021)* | High | An arbiter colluding with one counterparty to rule unfairly. Under `ARBITRATION_MODE=trusted-list` (default), mitigated by the Reputation-as-bond mechanism (`SECURITY_MODEL.md` §3) — a bad ruling damages the arbiter's `ReputationScore` publicly and permanently. Under `ARBITRATION_MODE=market` (`docs/rfcs/RFC-021-market-based-arbitration-and-payment-trust.md`), the mitigation is real, not just reputational: an appealed-and-overturned ruling triggers `MarketArbitrationProvider.slash()` — a real forfeit of posted collateral plus a reputation penalty, and the appeal panel that overturns the ruling is drawn weighted 70% toward reputation (not stake), so the same deep-capital arbiter who won first-instance selection doesn't also dominate the panel judging them. **Honestly disclosed residual risk, not closed by either mode:** capital-based Sybil collusion (an attacker funding both a colluding arbiter and the counterparty) has no closed-form solution here — RFC-021's own "Known Risks — Mitigated, Not Solved" section states this explicitly; slashing raises the real cost of collusion, it does not make it impossible. |
| **Fabricated Dispute Evidence** *(v7.4, updated 2026-08-02 — RFC-021 D8)* | Medium | A party submits falsified `Proof` (`PROTOCOL_SPECIFICATION.md` §1.8) to win a dispute. Mitigated by requiring `Proof.verifiedBy` from an independent party where possible, and — no longer purely future — by real, config-gated QVAC evidence analysis (`assessDisputeEvidence()`, off by default, `QVAC_AUTO_RESOLUTION_ENABLED`). This does not stop fabrication itself: a low-confidence or `INCONCLUSIVE` read from QVAC changes nothing (the dispute falls straight through to its assigned human arbiter, exactly today's behavior), and QVAC's own recommendation is never final on its own — either trade party can contest it within a window, forcing human review. QVAC being fooled by a convincing fabrication is a real, undiscovered-until-contested residual risk, not eliminated by this mitigation — see RFC-021's own "Known Risks" §D8 entries. |
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
- **QVAC-based fraud detection is mostly still unimplemented, with one
  real exception (updated 2026-08-02).** Every mitigation above that
  still reads "QVAC (future)" — Fake Liquidity's offer trust scoring,
  PIX/Fiat Proof Fraud's image analysis, Chat Phishing's URL detection —
  remains a design intention, not a working control; do not represent
  those as active protection in any external-facing material until they
  exist. The one exception: **Fabricated Dispute Evidence**'s row above
  is real, working, tested code (`qvac-agent.provider.ts`'s
  `assessDisputeEvidence()`, RFC-021 D8) — off by default
  (`QVAC_AUTO_RESOLUTION_ENABLED=false`), bounded (never final without a
  contest window either party can invoke), and deliberately
  payment-method-agnostic (not scoped to PIX specifically, this being a
  worldwide protocol).
- **The `PearPeerManager` singleton bug** (documented and fixed in
  `NODE_ARCHITECTURE.md`) was itself a threat — a second user's node could
  silently corrupt state. This is resolved as of this handoff, but is a
  good example of how an architectural bug becomes a security issue in a
  multi-tenant P2P system.
- **WebSocket auth reuses the full session token as a `?token=` query
  parameter** (DX audit, 2026-08-10 — not previously written down
  anywhere, including here). `chat.routes.ts`/`relay.routes.ts` can't use
  `requireAuth`'s `Authorization` header check because a browser can't
  set arbitrary headers on a WS upgrade request — `ws-auth.ts`'s
  `resolveParticipantFromToken()` resolves the query param against the
  *same* Redis session store `requireAuth` uses for every other route,
  not a separate, scoped, short-lived token minted just for the socket.
  Query strings can end up in server access logs, browser history, or a
  `Referer` header — a token that leaks this way grants the same access
  as a stolen `Authorization: Bearer` header would, not a narrower one.
  Genuinely constrained by the browser API, not an oversight; the
  disclosed gap is that the token reused here is full-privilege rather
  than WS-scoped and short-lived. A real fix (a separate, single-use,
  short-TTL token minted specifically for the WS handshake) is a design
  decision, not implemented as part of this audit pass.

---

## 5. Reporting and Response

No formal security disclosure process exists yet for this project. Until one
is established, treat any discovered vulnerability as High severity by
default and do not deploy affected code to any environment handling real
value.
