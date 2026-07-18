# API_REFERENCE.md
### Sails Protocol — Engineering Handoff · Document 4 of 20

> Base URL (reference implementation, local dev): `http://localhost:3000`
> Docs UI (Swagger, when routes are restored): `http://localhost:3000/docs`
> WebSocket: `ws://localhost:3000/ws?userId=<uuid>`

---

## 0. The API Is Intent-Oriented, Not Resource-Oriented (v7.2 — CTO review finding)

**This is the single most important correction in this document.** An
earlier version of this API was designed around module resources —
`POST /v1/settlement/escrow`, `POST /v1/openp2p/trades` — which mirrors
how the reference implementation's database is organized, not how the
protocol thinks. That is backwards. Per Principle 2 (`PRINCIPLES.md`,
"Intent Driven"), every application-facing interaction should read as an
Intent-lifecycle verb, never as a module-specific CRUD action.

**Wrong (what this document used to imply):**
```typescript
const trade = api.createTrade(offerId, amount)
const result = api.buyBitcoin(sellerId, amount)
```

**Right (what any SDK or direct API integration must expose):**
```typescript
const intent = protocol.openP2P.createIntent({ asset: 'BTC', side: 'BUY', maxValue: 2000 })
protocol.negotiate(intent.id, { type: 'MESSAGE_EXCHANGED', by: myId, content: 'Sending payment now', at: now() })
protocol.submitProof(intent.id, { claimType: 'payment_sent', evidence: '...' })
protocol.releaseAsset(intent.id)
protocol.dispute(intent.id, { reason: '...' })
protocol.cancelIntent(intent.id)
```

### Canonical Intent Verbs

| Verb | Maps to (internally) | Primitive it invokes |
|---|---|---|
| `createIntent` | `POST /v1/{module}/intents` | Intent (`PROTOCOL_SPECIFICATION.md` §1.2) |
| `cancelIntent` | `PATCH /v1/{module}/intents/:id` (status → CANCELLED) | Intent |
| `negotiate` | Sends a `NegotiationEvent` over the Negotiation channel | Negotiation (§1.4) |
| `submitProof` | Submits a `Proof` — `claimType` is open-ended (`payment_sent`, `invoice_paid`, `oracle_verified`, `kyc_verified`, `collateral_held`, ...), never hardcoded at the API level | Proof (§1.8) |
| `releaseAsset` | `POST /v1/settlement/escrow/:id/release` | Settlement (§1.5) |
| `dispute` | `POST /v1/settlement/escrow/:id/dispute` | Dispute (§1.9) |

**RFC-007 note:** an escrow's status may pass through
`PENDING_BANK_SETTLEMENT` between `payment-sent` and `release` (§4 below)
— a payment held/processing at the payer's financial institution, not a
failure state. `dispute` now resolves through an explicit escalation
order (Policy Engine → OpenAgents → a Trusted Arbitrator via
`ArbitrationProvider` → Settlement) before ever reaching human
arbitration — the verb and its route are unchanged, only what happens
internally after the call.

**Revision note (Protocol Freeze, v8.3):** this verb table used to have
`confirmFiat`, hardcoding one specific `claimType` (`payment_sent`) into
the top-level API surface — a P2P-trading-specific leak into what's
supposed to be the universal Intent interface, flagged by the Protocol
Quality Review and confirmed correct. `submitProof` replaces it: a
`SwapIntent` submitting an `oracle_verified` proof, or a future
`LoanIntent` submitting `collateral_held`, use the exact same verb — the
Core never needs to know a new `claimType` exists.

**Why both layers exist:** the module-namespaced REST routes in the rest
of this document (`/v1/openp2p/`, `/v1/settlement/`, etc.) are the
*implementation* — how the reference implementation's Fastify server
actually routes HTTP requests, module by module, matching
`ARCHITECTURE.md`'s layer separation. The Intent verbs above are the
*interface* — what `@sails/sdk` (`SDK_GUIDE.md`) exposes to an
application, and what any future non-TypeScript implementation must expose
too, regardless of how its own internal routing is organized. An
application built on Sails should never need to know that `releaseAsset`
happens to be implemented by calling into the OpenSettlement module — that
is exactly the kind of module-awareness the protocol is supposed to hide.

---

## 1. Namespacing Convention (mandatory going forward)

All routes follow: **`/v1/{module}/{resource}`**

This lets any integrator know exactly which protocol module they're calling
into. The legacy routes below (`/offers`, `/trade/*`, `/escrow/*` with no
module prefix) are what currently exists in old code fragments — they must
be migrated to the namespaced form as part of the `Meses 1-3` roadmap phase.
Keep a temporary alias layer during migration so existing integrators don't
break; do not delete the legacy path until a deprecation window has passed.

---

## 2. Sails OpenIdentity — `/v1/identity/`

| Method | Path | Description |
|---|---|---|
| POST | `/v1/identity/participants` | Register a new identity via Ed25519 public key |
| GET | `/v1/identity/participants/:id` | Fetch a participant's profile |
| POST | `/v1/identity/challenge` | Issue an auth challenge |
| POST | `/v1/identity/authenticate` | Verify the signed challenge, issue session token |

Legacy equivalents (pre-namespacing): `POST /identity/create`, `GET
/identity/:id`, `POST /identity/challenge`, `POST /identity/authenticate`,
`POST /identity/verify-signature` (dev utility), `GET /identity/keypair`
(⚠️ dev-only, generates test keypairs — must never be exposed in production).

---

## 3. Sails OpenLiquidity — `/v1/liquidity/`

| Method | Path | Description |
|---|---|---|
| GET | `/v1/liquidity/offers` | List offers, filterable by asset/side/paymentMethod/price range |
| POST | `/v1/liquidity/offers` | Publish a new offer |
| GET | `/v1/liquidity/offers/:asset/book` | Order book: bids + asks + spread for one asset |
| PATCH | `/v1/liquidity/offers/:id/status` | Pause / activate / cancel an offer |
| POST | `/v1/liquidity/match` | Find the best match for a given Intent |

Legacy equivalents: `POST /offers`, `GET /offers`, `GET
/offers/orderbook/:asset`, `PATCH /offers/:id/status`.

---

## 4. Sails OpenSettlement — `/v1/settlement/`

| Method | Path | Description |
|---|---|---|
| POST | `/v1/settlement/escrow` | Create an escrow for a trade |
| GET | `/v1/settlement/escrow/:id` | Escrow detail + event history |
| POST | `/v1/settlement/escrow/:id/lock` | `CREATED → FUNDS_LOCKED` |
| POST | `/v1/settlement/escrow/:id/payment-sent` | `FUNDS_LOCKED → PAYMENT_PENDING` |
| POST | `/v1/settlement/escrow/:id/release` | `PAYMENT_PENDING` or `PENDING_BANK_SETTLEMENT → COMPLETED` |
| POST | `/v1/settlement/escrow/:id/dispute` | `→ DISPUTED`. Delegates to `dispute.service.ts`'s `raiseDispute()` (persists a `Dispute` row + assigns an arbiter), not `escrow.service.ts`'s `openDispute()` directly — that's the lower-level transition `raiseDispute()` calls as its first step. |
| POST | `/v1/settlement/escrow/:id/refund` | `→ REFUNDED` |
| POST | `/v1/settlement/disputes/:id/resolve` | Only the assigned arbiter (RFC-007 D4) may call this. `ruling`: `RELEASE` (releases to `releaseToAddress`, required for this ruling), `REFUND`, or `SPLIT` (recorded, moves no funds — `SettlementProvider` has no split operation yet, `BACKLOG.md` P2). Requires `TRUSTED_ARBITRATORS` configured (`.env.example`) — returns a config error otherwise, not a boot failure. |

`PENDING_BANK_SETTLEMENT` (RFC-007 D3, `DATABASE.md`'s `EscrowStatus`) is
an additive status between `PAYMENT_PENDING` and `COMPLETED` — no new
route, existing `release`/`dispute` routes already handle it as a valid
source state (see `DATABASE.md`'s updated transition table).

Legacy equivalents: `POST /escrow/create`, `GET /escrow/:id`, `GET
/escrow/trade/:tradeId`, `POST /escrow/lock`, `POST /escrow/payment-sent`,
`POST /escrow/release`, `POST /escrow/dispute`, `POST /escrow/refund`.

**Note:** these routes exist now (`modules/open-settlement/settlement.routes.ts`),
wrapping `escrow.service.ts`'s class methods (`createEscrow`, `lockFunds`,
`markPaymentSent`, `releaseFunds`, `refundFunds`, `getEscrow`,
`getEscrowByTrade`) and `dispute.service.ts`'s `raiseDispute()`/
`resolveDispute()` directly — this was previously the gap `TODO.md`
tracked; see that file's "Resolved Items" section.

---

## 5. Sails OpenP2P — `/v1/openp2p/`

| Method | Path | Description |
|---|---|---|
| POST | `/v1/openp2p/trades` | Start a trade from an offer |
| GET | `/v1/openp2p/trades/:id` | Trade detail with escrow + messages |
| PATCH | `/v1/openp2p/trades/:id/status` | Update trade status (ACTIVE/DISPUTED/CANCELLED) |
| WS | `/v1/openp2p/chat` | WebSocket negotiation channel (see below) |
| GET | `/v1/openp2p/chat/:tradeId/messages` | Message history for a trade |

Legacy equivalents: `POST /trade/create`, `GET /trade/:id`, `PATCH
/trade/:id/status`, `WS /ws`, `GET /chat/:tradeId/messages`, `GET
/chat/online`.

### WebSocket protocol (client → server)

```json
{ "type": "JOIN_TRADE", "payload": { "tradeId": "..." } }
{ "type": "SEND_MESSAGE", "payload": { "tradeId": "...", "content": "...", "msgType": "TEXT" } }
{ "type": "LEAVE_TRADE", "payload": { "tradeId": "..." } }
{ "type": "PING", "payload": {} }
```

### WebSocket protocol (server → client)

```
NEW_MESSAGE            — a new chat message in a joined trade room
TRADE_STATUS_UPDATE    — trade status changed
ESCROW_STATUS_UPDATE   — escrow status changed (auto-pushed via event bus)
USER_ONLINE / USER_OFFLINE
PONG
ERROR
```

---

## 6. Sails OpenReputation — `/v1/reputation/`

| Method | Path | Description |
|---|---|---|
| GET | `/v1/reputation/:participantId` | Full score breakdown |
| GET | `/v1/reputation/peer/:peerId` | Same score breakdown, looked up by portable Pears identity (RFC-013) instead of internal `participantId` |
| GET | `/v1/reputation/leaderboard` | Top participants by score |
| POST | `/v1/reputation/rate` | Rate a completed trade (score 1-5) |

Legacy equivalents: `GET /reputation/:userId`, `GET
/reputation/leaderboard`, `POST /reputation/rate`.

**RFC-007 note:** `POST /rate` is informational feedback only as of
RFC-007 — it no longer feeds the score `GET /:participantId` returns.
`ReputationScore` is computed exclusively from `recordOutcome()` /
`SettlementOutcome` events (`PROTOCOL_SPECIFICATION.md` §1.6). A trade
cancelled by agreement always classifies Neutral and can never reduce the
counterparty's score, regardless of any `rate()` call made against it.

**RFC-013 note:** `GET /v1/reputation/peer/:peerId` resolves
`User.peerId` → `participantId`, then returns the exact same
`ReputationScore` shape — no new scoring logic. `peerId` (Pears' real
contribution — a portable Ed25519 public key) is the identity substrate;
the score itself remains exclusively computed and stored by this module.

---

## 7. P2P Transport (Infrastructure — Pears/HyperDHT) — `/v1/peers/`

| Method | Path | Description |
|---|---|---|
| POST | `/v1/peers/start` | Start a HyperDHT node for the caller's userId (via `PearNodeRegistry`) |
| POST | `/v1/peers/stop` | Stop the caller's node |
| GET | `/v1/peers/status` | Connection status: peer count, active topics |
| POST | `/v1/peers/join-topic` | Announce on an asset-specific topic |
| POST | `/v1/peers/join-trade` | Open a private per-trade P2P channel |
| POST | `/v1/peers/broadcast-offer` | Broadcast an offer to connected peers |

**Implementation note:** these routes must call into `pearNodeRegistry`
(the `Map<userId, PearNode>` registry — see `NODE_ARCHITECTURE.md`), never
instantiate `PearNode` directly. This was a specific architectural fix
applied during code review to correctly support multiple concurrent users
in a single server process.

---

## 7B. Sails OpenAgents — Capability Registry — `/v1/capabilities/`

*(new — RFC-013, `rfcs/RFC-013-capability-registry-and-wallet-adapter.md`)*

| Method | Path | Description |
|---|---|---|
| POST | `/v1/capabilities/register` | Self-issued `CapabilityGrant` — the caller declares and grants themselves scope over their own capabilities |
| GET | `/v1/capabilities/:participantId` | List active (non-revoked) grants |
| POST | `/v1/capabilities/:grantId/revoke` | Revoke a grant |

**RFC-013 note:** this is the real implementation of RFC-005's
`CapabilityGrant` (`PROTOCOL_SPECIFICATION.md` §1.10) — a Core component
(`core/capability-registry.ts`), not an OpenAgents-owned resource; the
routes live here because capability declaration maps onto RFC-005's own
`agent-delegation` capability, the closest existing module owner. Only
self-issued grants exist today — a real multi-party issuance flow (a
module operator granting scope to an agent it doesn't control) is
separate follow-up work, not claimed done here.

---

## 8. Event Catalog (internal — mirrors `common/events/event-bus.ts`)

These are not HTTP endpoints — they are the internal typed events every
module emits/listens to. Documented here because API consumers using
webhooks will see these same names.

```
# Sails OpenP2P
openp2p.trade.created
openp2p.trade.status_changed
openp2p.trade.completed
openp2p.trade.disputed
openp2p.trade.cancelled
openp2p.message.sent

# Sails OpenSettlement
settlement.escrow.created
settlement.escrow.locked
settlement.escrow.payment_pending
settlement.escrow.pending_bank_settlement  # RFC-007 D3
settlement.escrow.released
settlement.escrow.disputed
settlement.escrow.refunded

# Sails OpenReputation
reputation.score.updated

# Sails OpenLiquidity
liquidity.offer.created
liquidity.offer.status_changed

# Sails OpenProof (RFC-007 addition; claim.*/proof.*/verification.*
# already exist per RFC-003/BACKLOG.md P0 but are not yet listed in this
# catalog — a pre-existing gap in this doc, not introduced by RFC-007)
proof.duplicate_detected  # RFC-007 D1 — ProofRegistry found the same
                           # fingerprint on a different intentId; a flag
                           # for Dispute/Policy Engine, not an auto-block

# Cross-module (P2P transport)
peer.connected
peer.disconnected
```

**Naming rule:** `{module}.{entity}.{action}`. This replaced an earlier,
unnamespaced convention (`trade.created`, `escrow.created`, etc.) found
during code review — the old names are dead, do not reintroduce them.

---

## 9. Error Response Shape

```json
{
  "success": false,
  "error": "VALIDATION_ERROR | NOT_FOUND | ESCROW_ERROR | INTERNAL_ERROR | ...",
  "message": "Human-readable description",
  "details": []
}
```

`ZodError` → HTTP 400 with `VALIDATION_ERROR`. Custom `AppError` subclasses
(`NotFoundError`, `EscrowError`, etc.) → their own `statusCode`. Anything
else → HTTP 500, message redacted outside development mode.

---

## 10. Health / Meta Endpoints

```
GET /health   → { status, timestamp, version, protocol: "Sails Protocol",
                   module: "Sails OpenP2P", referenceImplementation: "Satsails Wallet",
                   features: { mockEscrow, mockSettlement } }
GET /         → { name, protocol, referenceImplementation, docs, ws, version }
```
