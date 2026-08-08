# Security Audit Report — Sails P2P Trading SDK

## Executive Summary

| Metric | Value |
|---|---|
| **Vectors Audited** | 12 categories (SQLi, Auth Bypass, CSRF, XSS, SSRF, Replay, Signature Replay, Race Conditions, Escrow Bypass, Intent Spoofing, WebSocket Hijacking, Privilege Escalation) |
| **Critical Vulnerabilities** | 0 |
| **High** | 2 (`POST /v1/settlement/escrow` party check missing; `GET /v1/openp2p/trades/:id` data exposure) |
| **Medium** | 2 |
| **Low** | 6 |
| **Total Findings** | 10 |

---

## Category Summaries

### 1. SQL Injection — No Vulnerabilities
All queries use Prisma Client parameterized object-literal `where` clauses. Zero usage of raw SQL (`$queryRaw`, `$executeRaw`, `Prisma.sql`). User input validated via Zod schemas at all HTTP boundaries. `participantId` derived from authenticated session, never trusted from request body.

### 2. Auth Bypass — 3 Findings

**MEDIUM — `GET /v1/openp2p/trades/:id` (trade.routes.ts:61)**
- Unauthenticated route returns Trade with `messages`, `offer.paymentDetails`
- Attack: leaked trade UUID allows reading full chat history + seller payment instructions
- Risk: sensitive negotiation data exposure

**MEDIUM — `GET /v1/openp2p/trades/by-intent/:intentId` (trade.routes.ts:74)**
- Exposes Trade + Escrow + Offer (incl. paymentDetails) without auth
- IntentId may be exposed in API responses to counterparty

**MEDIUM — `POST /v1/settlement/escrow` (settlement.routes.ts:90)**
- Authenticated user can create escrow on any trade
- Session `participantId` not passed to `createEscrow()`
- Attack: block legitimate escrow, manipulate lockedAmount/type

**LOW — `POST /v1/liquidity/match` (liquidity.routes.ts:120)**
- Unauthenticated POST, but read-only best-match search
- No `participantId` used, no impersonation possible

**LOW — `POST /v1/identity/participants` (identity.routes.ts:31)**
- No specific rate limit override (uses global 100/min/IP only)
- Sybil registration vector

### 3. CSRF — No Vulnerabilities
Bearer token in `Authorization` header (CSRF-immune). Zero cookie usage anywhere. CORS `origin: true` is not a CSRF risk with Bearer auth.

### 4. XSS — No Vulnerabilities
Backend is JSON-only API. No `innerHTML`/`document.write`/`dangerouslySetInnerHTML` in SDK or components. User data (displayName, paymentDetails, evidence) stored as strings. Client SDK renders text only.

### 5. SSRF — No Vulnerabilities
No HTTP requests to user-controlled URLs. HyperDHT uses DHT lookup, not arbitrary HTTP fetch. WebSocket `?token=` query param has logging exposure (LOW, documented).

### 6. Replay Attacks — No Vulnerabilities
Challenge-response: 32-byte `randomBytes` nonce, deleted immediately after verification (`redis.del`, auth.ts:73). Session tokens: 256-bit entropy. WebSocket: token validated at handshake, party-checked per message.

### 7. Signature Replay — No Vulnerabilities
- **Ed25519** (identity): challenge is random 32-byte nonce, single-use
- **ECDSA secp256k1** (custody providers): non-deterministic signing via `auxRNG`
- **Payment account signing**: hash-bound to specific account, non-replayable

### 8. Race Conditions — No Vulnerabilities (Fixed)

**Verified fix at `intent-engine.ts:148-154`**
```typescript
const claim = await prisma.intent.updateMany({
  where: { id: intentId, status: currentStatus },  // Optimistic concurrency
  data: { status: toStatus },
})
if (claim.count === 0) {
  throw new ValidationError(`Intent already transitioned`)
}
```
- Codebase comment documents this as "Robustness-audit fix (2026-07-20)"
- `updateMany` with conditional `WHERE status:` prevents TOCTOU
- `writeIntentEvent()` hash chain protected by only one writer proceeding

### 9. Escrow Bypass — Critical Finding

**CRITICAL — `POST /v1/settlement/escrow` party check missing (settlement.routes.ts:90)**
- `createEscrow()` only checks Trade exists + has no escrow
- Does NOT verify caller is `trade.buyerId` or `trade.sellerId`
- Any authenticated user can lock funds to a different user's trade
- Risk: escrow hijacking, fund lock denial-of-service

See "Priority Recommendations" below.

### 10. Intent Spoofing — No Vulnerabilities
- `participantId` from session in all routes (intentRoutes.ts:84,103)
- `claimedBy`/`raisedBy` server-derived
- `assertValidTransition()` + `updateMany` conditional prevents race
- Transitions validated: `OPEN → CANCELLED/COMMITTED`, `COMMITTED → FULFILLED`, `FULFILLED → SETTLING`

### 11. WebSocket Hijacking — No Vulnerabilities
- `joinTrade()`: verifies `participantId` is `trade.buyerId` or `trade.sellerId` (chat.routes.ts:111-118)
- `sendMessage()`: re-verifies party membership (chat.routes.ts:142)
- Token via `?token=`, validated before WebSocket upgrade
- Messages encrypted via libsodium (`payload-crypto.ts`)

### 12. Privilege Escalation — No Vulnerabilities
- All mutating routes use `(request as any).participantId` from session
- `isPartyOrAgent()` checks participant ID or `agent:service:participantId` delegation
- Service layer performs independent verification (defense-in-depth)

---

## Priority Recommendations

| Priority | Finding | File | Recommendation |
|---|---|---|---|
| **P0** | Escrow creation party check missing | settlement.routes.ts:90 | Pass `request.participantId` to `createEscrow()`, verify party membership in escrow.service.ts |
| **P1** | Trade detail exposure without auth | trade.routes.ts:61 | Add `requireAuth` + party check, or limit returned fields |
| **P1** | Intent-trade lookup exposure | trade.routes.ts:74 | Same fix as above |
| **P2** | Escrow detail exposure | settlement.routes.ts:99 | Add party membership verification |
| **P3** | WebSocket token in URL | chat.routes.ts:82 | Document operational risk; consider JWT auth upgrade |

---

## Verified Security Patterns (Positive Findings)

1. **Ed25519 challenge-response auth**: one-time-use challenges, 256-bit entropy, deleted after verification
2. **Session tokens**: 256-bit `randomBytes(32)`, Redis-backed with TTL, Bearer header auth (CSRF-immune)
3. **Server-derived identity**: `triggeredBy`/`claimedBy`/`raisedBy` never trusted from request body
4. **Optimistic concurrency**: `updateMany({ where: { status: currentStatus } })` pattern fixes race conditions
5. **Defense-in-depth**: route-level auth + service-layer party checks (escrow.service.ts, dispute.service.ts)
6. **Hash-chained events**: RFC-008 hash chain for tamper evidence (intent-engine.ts `writeIntentEvent`)
7. **WebSocket party checks**: enforced on both JOIN_TRADE and SEND_MESSAGE
8. **Encrypted P2P messages**: libsodium authenticated encryption in payload-crypto.ts
