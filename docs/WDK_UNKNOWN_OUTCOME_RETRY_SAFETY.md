# WDK_USDT_EVM `lockFunds()` — Unknown-Outcome / Retry-Safety Investigation

**Mission:** CTO Mission #56 (`docs/TECHNICAL_DEBT_AUDIT.md` #56, `docs/BACKLOG.md`'s
"`WDK_USDT_EVM`'s `lockFunds()` — unknown-outcome / retry-safety evidence gap"
delta, discovered during Bounded Remediation F6's own review, 2026-09-07).
**Type:** Production-safety investigation / external side-effect semantics.
**Status:** Evidence only. No production code changed. No mechanism authorized
or implemented. `WDK_USDT_EVM` remains `PRODUCTION-INELIGIBLE`
(`docs/rfcs/RFC-019-settlement-custody-reference-vs-normative.md`,
`docs/PROVIDER_SUBSTITUTION_INVARIANCE_EVIDENCE.md`) — that classification is
unchanged by this document.

**Evidence-status legend (used throughout):** DEMONSTRATED (proven by reading
the real, unmodified source and/or by a test exercising the real,
unmocked orchestration code) / UPSTREAM DOCUMENTED (confirmed directly in the
installed `@tetherto/wdk-wallet-evm` package source) / REPOSITORY OBSERVED
(confirmed directly in this repository's own source) / INFERRED (a reasoned
conclusion from the above, not itself directly observed) / UNKNOWN (not
determinable from the evidence available in this environment) / NOT TESTED
(a scenario this mission did not execute).

---

## 1. Property Under Investigation

**Primary property:** a side-effecting external funding action must not be
repeated merely because the caller cannot determine whether the first attempt
succeeded.

**Secondary properties investigated:** whether retries distinguish FAILED
from UNKNOWN; whether reconciliation is possible before repeating a side
effect; how precisely any idempotence claim can be scoped; whether protocol
state silently treats uncertainty as final failure; whether recovery
re-decides economic authority.

This document does not start from a mechanism. It reports what the current,
real, unmodified code does — and does not do — against this property.

---

## 2. Real Call Path (traced from source, not inferred from naming)

```
POST /v1/settlement/escrow/:id/lock  (settlement.routes.ts:271-278)
  -> escrowService.lockFunds(escrowId, triggeredBy)   (escrow.service.ts:376-471)
       -> repo.findById(escrowId)                      [read: current status]
       -> tradeRepository.findById(escrow.tradeId)      [read: buyer/seller]
       -> isPartyOrAgent() authorization check
       -> claimEscrowTransition(escrowId, 'CREATED', 'FUNDS_LOCKED')  (escrow-lifecycle.ts:289-310)
            -> escrowRepository.claimTransition()  -- prisma.escrow.updateMany({ where: { id, status: 'CREATED' }, data: { status: 'FUNDS_LOCKED' } })
            -- ATOMIC: only one concurrent caller's WHERE clause matches; the loser gets count:0 and throws BEFORE reaching the provider.
       -- try {
       ->   provider.lockFunds(...)                     (WdkSettlementProvider.lockFunds, wdk-settlement.provider.ts:129-142)
              -> treasuryAccount() -> getWallet().getAccount(0)
              -> escrowAccount(tradeId) -> getWallet().getAccountByPath(`0'/0/${escrowIndexFor(tradeId)}`)
              -> treasury.transfer({ token, recipient: escrowAddress, amount })   (@tetherto/wdk-wallet-evm, WalletAccountEvm.transfer())
                   -> quoteSendTransaction() -- gas estimate, provider.getFeeData()  [read-only, no side effect]
                   -> sendTransaction()
                        -> populateTransactionEvm() -- provider.getTransactionCount(from, 'pending') [fresh nonce, every call, no cache]
                        -> signer.signTransaction()                                [local, no network]
                        -> provider.send('eth_sendRawTransaction', [signed])       *** THE EXTERNAL SIDE EFFECT ***
                        -> returns { hash }                                        -- hash is the RPC's ack of receipt into its mempool, NOT a confirmation
       ->   repo.updateLockResult(escrowId, { txLockId: result.txId, ... })   -- prisma.escrow.update(...) [no status field — already FUNDS_LOCKED]
       ->   (result.vout is always undefined for WDK_USDT_EVM -- escrowFundingEvidenceRepository.record() skipped)
       ->   emitEscrowTransition(...)                                         -- withEscrowFundingLock() -> escrowEvent create -> eventBus.emit('settlement.escrow.locked', ...)
       ->   return updated
       -- } catch (err) {
       ->   revertEscrowStatus(escrowId, escrow.status)   -- prisma.escrow.update({ where: { id }, data: { status: 'CREATED' } }), UNCONDITIONAL, swallows its own failure
       ->   throw err
       -- }
```

Every arrow above was read directly from `escrow.service.ts`, `escrow-lifecycle.ts`,
`escrow-repository.ts`, `wdk-settlement.provider.ts`, and
`node_modules/@tetherto/wdk-wallet-evm/src/{wallet-account-evm.js,wallet-account-read-only-evm.js,utils/tx-populator-evm.js}`
(installed version `1.0.0-beta.16`) — not assumed from either file's naming or
its own header comments.

---

## 3. Economic Action Boundary

**The first point at which external economic reality can diverge from local
Sails state is `provider.send('eth_sendRawTransaction', [signed])` inside
`WalletAccountEvm.sendTransaction()`.** DEMONSTRATED (source reading): this is
a single `await` on the underlying `ethers.JsonRpcProvider`'s JSON-RPC call.
Once the target node has received and accepted this call into its own mempool,
the transaction is externally real and visible to that node (and, once
propagated, to the wider network) — regardless of whether the JSON-RPC
*response* (the tx hash) ever reaches this process.

Bounded state model (analytical only — **not implemented, not authorized**):

| State | Meaning |
|---|---|
| `NOT_ATTEMPTED` | `provider.lockFunds()` never called |
| `PRE_SUBMISSION_FAILURE` | threw before `eth_sendRawTransaction` was ever sent (config error, gas quote failure, signing failure — DEMONSTRATED safe to retry, see §13) |
| `SUBMISSION_UNKNOWN` | `eth_sendRawTransaction` was sent; the response was lost/timed out/errored before this process observed a hash |
| `SUBMITTED` | a hash was returned to this process (mempool-accepted, not yet confirmed) |
| `CONFIRMED` | the transaction was mined (this repository's WDK integration never checks for this — see §7) |
| `REVERTED` | the transaction was mined but failed on-chain (an ERC-20 `transfer()` can revert; the current code never checks the call's return value or a receipt — see §7) |

`WdkSettlementProvider.lockFunds()` treats `SUBMITTED` (a hash was returned)
as the ONLY success signal. It has no representation at all for `CONFIRMED`
or `REVERTED`, and `SUBMISSION_UNKNOWN` is REPOSITORY OBSERVED to collapse,
unconditionally, into the same bucket as `PRE_SUBMISSION_FAILURE` the moment
the promise rejects — see §5.

---

## 4. Current Sails State Model — What Is Actually Written, and When

DEMONSTRATED by direct reading of `escrow.service.ts:376-471` and
`escrow-repository.ts`:

| Point in the flow | DB write | Persists `txLockId`? |
|---|---|---|
| Before `claimEscrowTransition` | none | no |
| `claimEscrowTransition` succeeds | `status: CREATED -> FUNDS_LOCKED` (atomic `updateMany`) | no — status only |
| `provider.lockFunds()` throws (any point, any reason) | `revertEscrowStatus`: `status -> ` (the escrow's pre-claim status, e.g. `CREATED`) | **no — the real external `txId`, if one exists, is discarded** |
| `provider.lockFunds()` succeeds, `repo.updateLockResult()` throws | same unconditional revert as above | **no — same discard, even though the transfer genuinely succeeded** |
| `provider.lockFunds()` succeeds, `repo.updateLockResult()` succeeds, `emitEscrowTransition()` throws | same unconditional revert | **no — same discard, even though both the transfer AND the txLockId write succeeded; the write is not rolled back, but the escrow's *status* is reverted underneath it** |
| Full success | `txLockId`, `txLockVout: null`, `multisigAddr` (escrow address), `lockedAt`, `expiresAt` persisted; `settlement.escrow.locked` emitted | yes |

**Process crash:** REPOSITORY OBSERVED — nothing in this path uses a
database transaction spanning the provider call. A crash between "external
transfer accepted by the RPC node" and "any of the three subsequent writes"
leaves the escrow durably at `FUNDS_LOCKED` (the claim already committed)
with **no `txLockId`, no `lockedAt`, no `expiresAt`** — an escrow claiming to
be locked with none of the evidence that would normally accompany that claim,
and the real transfer's hash is nowhere in Sails at all. A crash strictly
before the RPC call (e.g., during `getWallet()`, `escrowAccount()`, or gas
quoting) leaves the escrow durably `FUNDS_LOCKED` with no external transfer
having happened — the opposite divergence, and also unrecoverable without an
external chain check, since nothing distinguishes this state from the crash
case above by looking at the database alone.

**Timeout:** identical to "provider throws" from `escrow.service.ts`'s own
point of view — a timeout surfaces as a rejected promise, indistinguishable
in the catch block from a `PRE_SUBMISSION_FAILURE`. See §6.

---

## 5. WDK API Contract — Return Type, Hash Timing, Confirmation Semantics

All UPSTREAM DOCUMENTED, from direct reading of the installed
`@tetherto/wdk-wallet-evm@1.0.0-beta.16` source (no version claim is made
about any other release):

- `WalletAccountEvm.transfer(options)` returns `Promise<{ hash: string, fee: bigint }>`.
- `hash` comes from `this._provider.send('eth_sendRawTransaction', [signed])`
  — this is `ethers.JsonRpcProvider`'s raw pass-through of the JSON-RPC call.
  Per the JSON-RPC/Ethereum execution-API specification (not this
  repository's code — UPSTREAM DOCUMENTED against the wider EVM ecosystem,
  not against WDK specifically), this method returns as soon as the node
  accepts the transaction into its own transaction pool — **it does not wait
  for mining, confirmation, or even successful propagation to peers.**
- **Nothing in `transfer()`/`sendTransaction()` calls `provider.waitForTransaction()`
  or polls a receipt.** DEMONSTRATED by direct reading — `sendTransaction()`
  returns `{ hash, fee }` the instant `eth_sendRawTransaction` resolves; no
  further await exists in that function.
- **No idempotency key, request identity, or client-generated nonce is ever
  passed by `WdkSettlementProvider`.** `treasury.transfer({ token, recipient,
  amount })` supplies no `nonce` field (confirmed: `wdk-settlement.provider.ts`'s
  three call sites for `transfer()` never set one) — `populateTransactionEvm()`
  therefore always falls through to `Number(await provider.getTransactionCount(from, 'pending'))`,
  a **fresh RPC read on every single call**, never a client-cached sequence
  number.
- **Error behavior:** `sendTransaction()`/`transfer()` throw a plain `Error`
  (or whatever `ethers.JsonRpcProvider.send()` throws — a JSON-RPC error
  object, a network error, or an abort) with **no distinction anywhere in
  this call chain between "the node rejected the request outright" and "the
  request may have been accepted but the response was lost."** This is the
  single most direct piece of evidence for this mission's central question:
  the WDK wrapper itself provides no signal to distinguish these two cases.
- **Timeout behavior:** `WalletManagerEvm`'s provider is constructed as
  `new JsonRpcProvider(rpcUrl)` (a bare URL string — `wallet-manager-evm.js:97/107`)
  — REPOSITORY+UPSTREAM OBSERVED. Unlike `safe-guard-evm.provider.ts` (F1,
  `docs/TECHNICAL_DEBT_AUDIT.md` #51), which explicitly constructs its
  `ethers` provider with a configured `FetchRequest.timeout`,
  **`wdk-settlement.provider.ts`/`config.wdk` configure no timeout at all**
  (`src/config/index.ts:533-537`: `wdk: { seedPhrase, rpcUrl, usdtContract }`
  — three plain strings, no `FetchRequest`/timeout option). This is a new,
  directly observed finding, not previously covered by F1 (F1's own scope
  named only `multisig.provider.ts`/`safe-guard-evm.provider.ts`). It does
  not change this mission's conclusion, but it does mean the "unknown
  outcome" window for `WDK_USDT_EVM` specifically has **no caller-side
  bound at all** today — an RPC call that never responds would hang the
  request indefinitely rather than fail within a bounded time. **This is
  registered as a related, unresolved evidence gap in §16, not fixed here**
  — fixing it is exactly the kind of "make the provider production-ready"
  change this mission is not authorized to perform, and bounding a call's
  wait time would not, by itself, resolve the retry-safety property this
  mission investigates (a bounded timeout still produces an UNKNOWN outcome,
  just sooner).
- **Request identity / idempotency key:** UPSTREAM DOCUMENTED — none exists
  anywhere in `@tetherto/wdk-wallet-evm@1.0.0-beta.16`'s `transfer()`/
  `sendTransaction()` API surface.

---

## 6. EVM Nonce Analysis — Does It Provide Effective Idempotence Here?

**No — not as this specific caller uses it.** DEMONSTRATED by direct reading
of `tx-populator-evm.js:107`:

```js
nonce: (tx.nonce != null) ? Number(tx.nonce) : Number(await provider.getTransactionCount(from, 'pending'))
```

- Nonce is **automatically managed**, freely queried fresh from the RPC node
  on every call — never cached client-side, never explicitly supplied by
  `WdkSettlementProvider`.
- **If the first transfer was genuinely broadcast and the RPC node the
  second call reaches has that transaction in its own mempool view**, the
  second call's `getTransactionCount(from, 'pending')` returns a nonce ONE
  HIGHER than the first — the second call becomes a fully independent,
  valid transaction. **Both can confirm. This is a real duplicate-transfer
  pathway, not a hypothetical one** — it requires no adversarial timing,
  only "the first transfer's response was lost, and the node's mempool
  state is visible when the retry happens" (the common case, not an edge
  case, for a lost HTTP/RPC response over an otherwise-healthy connection).
- **If the second call reaches the RPC node BEFORE the first transaction has
  propagated into that node's mempool view** (a narrower race — same node
  processed the first request but the response never reached this process
  before the second attempt started), the second call could receive the
  SAME nonce. Ethereum nodes generally require a **strictly higher fee** to
  accept a same-nonce replacement (informally ~10%+ bump on most clients);
  `WdkSettlementProvider` never bumps a fee for a retry — it re-quotes fresh
  fee data every call, which is not a guaranteed increase. In this branch,
  the second call is more likely to be **rejected outright** ("replacement
  transaction underpriced" or equivalent) — but the FIRST transaction may
  still confirm normally, meaning the escrow is left at `CREATED` locally
  while the treasury has, in fact, already sent the funds. **This is a
  distinct risk from the duplicate-transfer case: a false-negative state
  divergence**, not a double-spend, but still a real Sails-state-vs-chain
  divergence with the identical root cause.
- **Does WDK cache nonce state across process restart?** No — REPOSITORY+UPSTREAM
  OBSERVED: there is no persisted nonce anywhere in this integration; every
  call queries the RPC node fresh. A process restart changes nothing about
  this (nothing was cached to lose).

**Conclusion, stated at the correct level of confidence:** EVM nonce
semantics do **not** make retrying `lockFunds()` safe for this specific
caller. Depending on the RPC node's own mempool-visibility timing at the
moment of retry, the outcome ranges from "two independent, both-confirmable
transfers" to "the retry is rejected but the original still confirms
unrecorded" — **neither branch is safe**, and this integration has no
mechanism to detect or steer toward either outcome. **Semantic Idempotence
≠ Operational Identicalness**, as the mission brief itself states: nothing
about "the EVM has nonces" makes THIS caller's specific, cache-free,
identity-free usage of them safe.

---

## 7. Failure Window Matrix

| # | Window | External funds moved? | Local state after | Retry safe? | Reconciliation possible? | Evidence |
|---|---|---|---|---|---|---|
| A | Failure before signing (config error, gas quote failure) | No | Reverted to pre-claim status | **Yes** | N/A — nothing to reconcile | DEMONSTRATED (§13, test 2; also `tests/escrowReleaseControls.test.ts`'s existing "provider lock failure... Retry" test, for a different provider) |
| B | Failure after signing, before RPC send (a Node-local exception, e.g. `_provider` undefined) | No | Reverted | **Yes** | N/A | INFERRED from source structure — not independently tested; behaviorally identical to A from `escrow.service.ts`'s point of view |
| C | RPC rejects before accepting into mempool (invalid nonce far out of range, insufficient balance the node checks pre-admission, malformed tx) | No | Reverted | **Yes** | N/A | INFERRED — a clean RPC-level rejection with no side effect; not distinguished from D by the current code, but genuinely safe if the rejection is real |
| D | RPC accepts the tx into its mempool but the response to `eth_sendRawTransaction` is lost (network drop, timeout, proxy/load-balancer failure) | **Unknown at call time — likely yes** | Reverted (identical code path to A) | **No — DEMONSTRATED unsafe** (§13, test 1) | Only externally: the escrow address is deterministically re-derivable (`escrowIndexFor(tradeId)`, no persisted secret needed) so an operator *could* query that address's on-chain history — but Sails itself persists no txId/nonce to automate this | This is the mission's "submit then throw" scenario — DEMONSTRATED directly via the real orchestration code, §13 |
| E | Tx enters mempool, local process dies before the JS-level response is even processed | Yes | Escrow durably `FUNDS_LOCKED` (claim already committed) with **no** `txLockId`/`lockedAt`/`expiresAt` | **No further "retry" is even offered by `assertEscrowTransition`** — a `FUNDS_LOCKED` escrow with no lock evidence is stuck, not retryable, and not automatically flagged as anomalous | Same as D — external re-derivation only | REPOSITORY OBSERVED (§4) — not independently tested (would require an actual process-kill against a live RPC, out of this mission's safe-testing scope) |
| F | Tx confirms but the caller (HTTP client) times out first | Yes | Depends entirely on whether the SERVER-SIDE `lockFunds()` call itself also times out or completes — if it completes, state is correct (full success path); if the server-side call ALSO times out (e.g., waiting on a slow but eventually-successful RPC round trip), same as D | Same as D if the server-side call also errored; otherwise **N/A — this window resolves to full success**, only the HTTP client is confused | Client could `GET /v1/settlement/escrow/:id` to check current status rather than blindly retrying — REPOSITORY OBSERVED that route exists (`settlement.routes.ts`) and is a safe, non-mutating way to check; **nothing forces a client to do this**, and the route (§9) has no idempotency-key protection if it doesn't | INFERRED from route structure |
| G | Tx reverts on-chain (e.g., insufficient token balance in the treasury account, a real ERC-20-level failure) | No net funds moved (revert), but gas was spent | `WdkSettlementProvider` has **no receipt check at all** — a reverted transaction still returns a hash from `eth_sendRawTransaction` (the RPC accepted the tx; on-chain execution failure is a separate, later fact this code never queries) — **Sails would record this as a SUCCESSFUL lock, `FUNDS_LOCKED`, with a real txLockId, when in fact no USDT ever moved to the escrow address.** | N/A — this is a silent-success-that-was-actually-a-failure, not a retry question | Only externally (checking the tx's on-chain receipt status) | DEMONSTRATED by source reading — `lockFunds()` uses only `result.hash`, never checks `result.status`/a receipt. **This is a separate, arguably more severe finding than the retry-safety question this mission was scoped to** — flagged in §16 as its own new backlog delta, not conflated with the retry-safety property, and not fixed here |
| H | Provider returns tx hash, but the subsequent DB write (`updateLockResult`) fails | Yes | Reverted to pre-claim status, txId discarded | **No — DEMONSTRATED unsafe** (§13, test 1 — this is the exact scenario tested) | Same as D | DEMONSTRATED |
| I | DB writes provisional `FUNDS_LOCKED` claim but the provider call never actually happens (impossible in the current code — the claim and the provider call are sequential in the same function, not concurrent/queued) | No | N/A — REPOSITORY OBSERVED this window does not exist in the current implementation; `claimEscrowTransition` and `provider.lockFunds()` are directly sequential `await`s in one function body, not decoupled by a queue | N/A | N/A | REPOSITORY OBSERVED (ruled out, not merely assumed safe) |
| J | Duplicated logical request after restart (an operator, or a script, re-issues the same `POST .../lock` after a crash left the escrow in the state described in E) | Yes (again) | A second real transfer for the same escrow | **No — DEMONSTRATED unsafe by the same mechanism as D/H** | Same as D | Same underlying mechanism as D; not independently re-tested as its own scenario (would be the same code path) |

---

## 8. Retry Surfaces — Repository-Wide Search

REPOSITORY OBSERVED (`grep -rniE "retry|queue|redelivery|BullMQ"` across `src/`):

| Surface | Classification | Applies to `lockFunds()`? |
|---|---|---|
| `bounded-rpc.ts`'s `withBoundedRetry()` | Automatic, opt-in per call site | **No** — `wdk-settlement.provider.ts` never imports or uses `bounded-rpc.ts` at all. This file's own header comment already states the exact governing principle ("a mutating/broadcast/submission call must never request it... retrying could duplicate an already-accepted economic action") but `WdkSettlementProvider.lockFunds()` isn't wired through this module either way — it has no retry AND no bound |
| `multisig.provider.ts`'s `EXPLORER_READ_RETRY` | Automatic, but explicitly scoped to read-only explorer calls (F1) | No — different provider, read-only calls only |
| `RedisStreamsEventStore.subscribe()`'s XCLAIM-based redelivery | Automatic, at-least-once, **but this store is a documented Reference implementation** (`event-store.ts`'s own header: "Redis Streams, BullMQ, a Postgres outbox table... is a Reference") | **Not connected today** — `SailsEventBus`'s default/active store is `PostgresEventStore` (confirmed, Missão 05.7), whose own `subscribe()` is "deliberately unchanged from `InMemoryEventStore`'s own [approach]" (event-store.ts:210-219) — a plain in-process listener list, no ack/redelivery. See §9 |
| `POST /v1/settlement/escrow/:id/lock` (HTTP) | Manual/client-driven | **Yes** — no idempotency-key header, no request-identity mechanism, nothing beyond `escrowService.lockFunds(id, participantId)`. A client that times out and resubmits reaches this exact code path again |
| `executeSettlement()` (`settlement-orchestrator.ts:134`), invoked from `eventBus.on('openp2p.trade.created', ...)` (`handlers.ts:553-562`, gated by `config.features.autoSettleOnMatch`, off by default) | Event-driven | **Yes, in principle** — see §9 for whether this event can actually be redelivered under the active store |
| Operator/API replay (a human resubmitting the same HTTP request, or a script retrying on a 5xx/timeout) | Manual | **Yes** — nothing in this path (route, service, repository) rejects a semantically-duplicate request beyond the atomic status claim, which only protects CONCURRENT attempts, not sequential ones after a completed-and-reverted attempt |
| Process-restart replay of a stuck escrow (an operator manually re-triggering `lockFunds()` for an escrow found stuck at `CREATED` after a crash) | Manual | **Yes** |

**No automatic retry library, queue, or job-redelivery mechanism is wired to
`WdkSettlementProvider.lockFunds()` today.** The exposure is entirely
**manual/logical retry** (a human or a client-side retry policy resubmitting
the same HTTP request) plus the event-driven `autoSettleOnMatch` path — not
"no retry risk merely because no retry library is used," per the mission's
own explicit caution.

---

## 9. Event/Handler Duplication — `openp2p.trade.created` → `executeSettlement`

DEMONSTRATED, by direct reading of `event-bus.ts` and `event-store.ts`:

- `SailsEventBus.on(event, listener)` calls `this.store.subscribe(event, ...)` (`event-bus.ts:491-495`).
- The active, default store is `PostgresEventStore` (confirmed elsewhere this
  session, F7's own closure evidence: `event-bus.ts`'s constructor default,
  no config/env override exists anywhere in `src/`).
- `PostgresEventStore.subscribe()`'s own header comment states it is
  "deliberately unchanged from `InMemoryEventStore`'s own [approach]... not a
  new consumer-group mechanism" (`event-store.ts:210-219`) — i.e., a plain,
  synchronous, in-process listener registry. `publish()` is the durable part
  (writes `durableEventRecord`); delivery to `on()` listeners is NOT durable,
  NOT acknowledged, and NOT redelivered.
- **Classification for this specific path, under the confirmed active store:
  AT-MOST-ONCE / BEST-EFFORT.** A crash between `eventBus.emit('openp2p.trade.created', ...)`
  and the listener completing simply loses that invocation — it is not
  automatically redelivered, and `executeSettlement()`/`lockFunds()` is not
  automatically re-invoked by any mechanism this repository has wired up
  today.
- **Caveat, not overclaimed as impossible:** `RedisStreamsEventStore` (same
  file) DOES implement genuine at-least-once/XCLAIM redelivery, and if a
  future deployment configuration ever switched `SailsEventBus`'s active
  store to it, this specific handler WOULD become subject to that
  redelivery — this document does not assert no configuration could ever
  create event-driven duplication, only that the confirmed, current, active
  configuration does not.
- Separately: `handlers.ts`'s own comment on this listener states the
  `emit()` call site (`trade.service.ts`) does not await it — a slow or
  failing `executeSettlement()` cannot block trade creation, and any error
  is caught and logged (`handlers.ts:559-561`), not silently retried.

**Net finding:** the event-driven path does not, today, add an automatic
redelivery-based duplication risk beyond what §8's manual/logical retry
surface already covers. It is disclosed here in full rather than dismissed,
per the mission's own instruction not to assume "no retry library = no
risk."

---

## 10. API Duplication — `POST /v1/settlement/escrow/:id/lock`

DEMONSTRATED, `settlement.routes.ts:271-278`:

```ts
app.post('/v1/settlement/escrow/:id/lock', {
  preHandler: requireAuth,
  ...docsOnlySchema({ tags: ['open-settlement'], params: idParam }),
}, async (request, reply) => {
  const { id } = idParam.parse(request.params)
  const escrow = await escrowService.lockFunds(id, participantId(request))
  return reply.code(200).send(success(escrow))
})
```

- No request body at all — nothing for an idempotency-key header/field to
  attach to today.
- No `Idempotency-Key` header handling anywhere in this route or in
  `requireAuth`/the shared route middleware (checked: no repository-wide
  match for `idempotency` outside this document and the mission brief that
  produced it).
- The ONLY guard against a duplicate request is `claimEscrowTransition`'s
  atomic status claim — which, as established throughout this document,
  protects CONCURRENT duplicate requests (both racing against the same
  `CREATED` status) but not a SEQUENTIAL retry issued after the first
  request's own catch block already reverted the escrow back to `CREATED`.
- No unique DB constraint exists on anything that would catch a duplicate
  lock attempt for the same escrow (the `@@unique([txLockId, txLockVout])`
  constraint `updateLockResult()`'s own catch block handles is for a
  DIFFERENT escrow claiming the SAME on-chain outpoint — a MULTISIG/Bitcoin
  concept; `WdkSettlementProvider` never populates `txLockVout` at all, so
  this constraint cannot fire for `WDK_USDT_EVM`).

**Conclusion:** a duplicate user/client/operator request against this route
can repeat the logical lock action, precisely in the window this document's
§7 failure matrix identifies (D/H/J) — confirmed as a state guard
(`claimEscrowTransition`), not an external-side-effect idempotence
mechanism, per the mission's own explicit "do not confuse state guard with
external idempotence" instruction.

---

## 11. Adversarial Tests — Real, Against the Unmocked Orchestration Code

New file: `tests/wdkLockFundsRetrySafety.test.ts`. Only the provider boundary
(`wdkSettlementProvider`) and the database (`../src/common/database`) are
mocked — `escrow.service.ts`, `escrow-lifecycle.ts`, and `escrow-repository.ts`
run for real, unmocked, matching this repository's own established
"mock the boundary, test what's actually new" convention
(`tests/escrowProviderWiring.test.ts`, `tests/escrowReleaseControls.test.ts`).

**Test 1 — the critical "submit then throw" scenario — DEMONSTRATED RETRY-SAFETY GAP:**

1. The mocked provider resolves successfully with a real-looking txId
   (`0xREAL_EXTERNAL_TRANSFER_1`) — standing in for a genuinely completed
   external transfer.
2. The following `prisma.escrow.update()` call (the real `updateLockResult()`
   persistence write) is made to reject, simulating an ordinary operational
   fault (a dropped DB connection) — deliberately NOT a provider-specific or
   exotic failure.
3. `escrowService.lockFunds()` is confirmed to reject with that exact
   simulated error.
4. Confirmed: the provider was called exactly once. The first `update()` call
   did attempt to persist `txLockId: '0xREAL_EXTERNAL_TRANSFER_1'` (proving
   the attempt was genuinely made) — and that exact call is the one that
   rejected, so the value it attempted to carry was never durably written.
   The second `update()` call (`revertEscrowStatus`) reverts `status` to
   `CREATED` with no `txLockId` field at all — confirmed by direct inspection
   of its call arguments.
5. A subsequent, independent call to `escrowService.lockFunds()` for the
   SAME escrow (simulating a retry against the now-`CREATED` status) is
   confirmed to succeed, and — the dispositive assertion — **the mocked
   provider is confirmed called a SECOND time**, with a second, different
   simulated txId (`0xREAL_EXTERNAL_TRANSFER_2`).

**Result: DEMONSTRATED RETRY-SAFETY GAP.** Not "funds can definitely be
drained" and not "an exploitable double-spend" — precisely: a caller-visible
failure that occurs after a real external side effect is observationally
identical, in this code, to a failure that occurred before one, and the
current design's own retry path (revert-then-retry) invokes the real
provider a second time without any check for whether the first attempt's
external effect already occurred.

**Test 2 — contrast case, the scenario the existing design DOES handle safely:**
a provider failure that occurs before any external side effect (a
configuration error) is confirmed safe to retry — the provider is called
once for the failure, once for the successful retry, never twice
successfully. This mirrors `tests/escrowReleaseControls.test.ts`'s own
pre-existing "a provider lock failure leaves the escrow unpersisted...
Retry" test (written for a different provider) — included here in the same
file specifically so the boundary between "safe" and "not yet proven safe"
is explicit in one place, not just asserted in prose.

**Test 3 — the boundary that IS already protected:** once an escrow has
genuinely, durably reached `FUNDS_LOCKED` (persisted, not merely claimed), a
further `lockFunds()` call is correctly rejected by `assertEscrowTransition`
before the provider is ever touched. This is not in question, and this
document does not claim otherwise — the gap is bounded strictly to the
window between "the provider call resolved" and "the resulting state was
durably persisted," not the whole lifecycle.

All three tests pass against the real, unmodified orchestration code as it
exists on this branch today (see §17 for the exact validation run).

**Not executed in this mission (disclosed, not silently skipped):**
- **Duplicate invocation via true concurrency** (two simultaneous calls) —
  already covered by the EXISTING, pre-dated `claimEscrowTransition` design
  and its own established test coverage (`tests/escrowReleaseControls.test.ts`,
  the 2026-07-20 robustness-audit fix); not re-proven here since it is not
  the property in question.
- **A real testnet lost-response reproduction** (actually broadcasting a
  Sepolia transaction, then simulating a lost RPC response, then observing a
  real second broadcast) — NOT TESTED. This mission's own scope explicitly
  forbids sending real (even testnet) transactions as new infrastructure
  build-out beyond what's minimally needed, and the mocked-boundary test
  above already demonstrates the exact code-level mechanism without that
  infrastructure cost. If a future mission wants ground-truth confirmation
  against a real Sepolia node's actual mempool-visibility timing, that is a
  distinct, larger piece of evidence this document does not claim to have
  produced.
- **A literal process-kill mid-flight** (failure window E) — NOT TESTED, for
  the same reason; the DB-write-ordering analysis in §4 is REPOSITORY
  OBSERVED (read directly from the code's lack of a spanning transaction),
  not independently reproduced by killing a real process.

---

## 12. Reconciliation — What Would Let Sails Check Before Retrying?

**Minimum external identity needed to reconcile the original action:**
the escrow's destination address (`escrowIndexFor(tradeId)` — deterministic,
re-derivable from `tradeId` alone, no persisted secret required) plus a time
window (roughly "since this escrow was created") would let an external chain
query (e.g., `eth_getLogs` for `Transfer` events into that address, or a
block-explorer API call) determine whether a transfer already arrived.

**Does Sails persist enough to reconcile automatically today? No.**
DEMONSTRATED (§4): no `txLockId`, no nonce, no request timestamp survives a
reverted attempt. The ONLY thing that survives is the escrow row itself
(`tradeId`, hence the re-derivable address) — sufficient for a MANUAL,
EXTERNAL reconciliation an operator could perform, but nothing this codebase
currently automates.

**Does current rollback/failure handling overwrite uncertainty as FAILED?**
**Yes — DEMONSTRATED.** `revertEscrowStatus()` is unconditional; there is no
`UNKNOWN`/`SUBMISSION_UNKNOWN` state anywhere in `Escrow.status`'s real enum
(`CREATED | FUNDS_LOCKED | PAYMENT_PENDING | DISPUTED | COMPLETED | REFUNDED
| SPLIT | EXPIRED` — `escrow-lifecycle.ts`'s `VALID_TRANSITIONS`). Every
provider failure, regardless of cause, is treated identically: revert to the
pre-claim status, exactly as if nothing had happened.

---

## 13. Failure Classification — Does Sails Need to Distinguish These?

**Analytical conclusion only — no enum/state change authorized or made.**

Yes: the evidence above supports that a genuine distinction exists between
at least `DEFINITELY_FAILED` (windows A/B/C — no external effect, safe to
retry as-is today) and `UNKNOWN_OUTCOME` (windows D/H/J — an external effect
may have occurred, current code cannot tell, and retrying is not proven
safe). `CONFIRMED_SUCCESS` and `CONFIRMED_REVERT` (window G) are a related
but distinct gap — this integration never checks a transaction receipt at
all, so it cannot today distinguish "confirmed and succeeded" from
"confirmed and reverted on-chain," independent of the retry-safety question.

---

## 14. Recovery/Reconciliation Relation to the Frozen Baseline

This document does not import the MULTISIG reorg-sweep mechanism
(`multisig-funding-reorg-sweep.ts`) by assumption. **Interface Uniformity ≠
Security Uniformity**, per the mission's own instruction: MULTISIG's
`lockFunds()` is a read-only verification against externally-already-funded
collateral (the buyer/seller fund the address themselves; the provider only
observes) — a thrown error there genuinely has no new side effect, which is
exactly why the existing #56 debt-ledger entry (before this mission)
correctly named this as WDK-specific, not a general pattern. `WDK_USDT_EVM`
is a fundamentally different case: `lockFunds()` itself is the funding
action (`treasury.transfer()`), custodial and self-initiated, not an
observation of someone else's action.

**Can `WDK_USDT_EVM` currently satisfy the already-established
recovery/reconciliation property this repository expects of a production
settlement rail?** No — provider-specific evidence, not an assumption: it
has no reorg-sweep equivalent, no funding-evidence ledger equivalent to
`escrowFundingEvidenceRepository` (that table is only ever populated when
`result.vout !== undefined`, which `WdkSettlementProvider` never sets), and
no receipt/confirmation check at all (§7, window G).

---

## 15. Cross-Rail Maturity — Preserved, Not Silently Upgraded

Unchanged by this document, restated for the record:

- `WDK_USDT_EVM`: server-custodial-reference-implementation; legacy
  destination authority; no capability-profile enforcement; recovery **NOT
  DEMONSTRATED** (this document adds evidence of WHY, it does not change the
  verdict); correspondence **NOT DEMONSTRATED**; **PRODUCTION-INELIGIBLE**
  (enforced today by a real, fail-closed boot-time check —
  `src/config/index.ts:777-784` — refusing to start if
  `NODE_ENV=production && MOCK_ESCROW=false && WDK_SEED_PHRASE` is set).

---

## 16. PRODUCTION-INELIGIBLE Containment Assessment

**YES, operationally** — the fail-closed boot guard (§15) means this
provider cannot be activated in a real production deployment today; the
retry-safety gap this document demonstrates cannot currently cause real
financial harm in production because the provider cannot run there at all.

**NO, architecturally** — the property gap is real, demonstrated against the
provider's actual code, and would need to be resolved (or the provider
would need to remain permanently non-production, a separate decision this
document does not make) before any future production eligibility could be
considered. `PRODUCTION-INELIGIBLE` is not used here as a reason to delete
or soften this finding — it is registered in full, as the mission requires.

---

## 17. Validation

- `git diff --check`: clean.
- `package.json`/`package-lock.json`: unchanged (no diff).
- No production source file changed. Only additions: this document, one new
  test file (`tests/wdkLockFundsRetrySafety.test.ts`), and the BACKLOG/audit
  sync described in §19.
- Targeted run: `tests/wdkLockFundsRetrySafety.test.ts`,
  `tests/wdkSettlementProvider.test.ts`, `tests/escrowProviderWiring.test.ts`,
  `tests/escrowReleaseControls.test.ts`, `tests/escrowCircuitBreaker.test.ts`,
  `tests/escrowEventHashChain.test.ts` — **6 suites, 129 tests, 0 failures.**
- `npx tsc --noEmit` (root): clean.
- **Disclosed environmental condition, not caused by this mission's
  changes:** this local machine currently has multiple stale
  `.claude/worktrees/agent-*` directories (full repository copies, including
  `packages/sails-sdk`) left behind by unrelated parallel Agent-tool
  sessions on this same host. Their presence collides with Jest's Haste
  module map (`@satsails/p2p-trading-sdk` resolves to 5 different
  `package.json` files) and prevents a plain `npx jest` from starting at
  all, independent of anything in this mission's own diff. Every test run
  in this document was performed with a **local, non-committed** CLI
  override (`--modulePathIgnorePatterns='<rootDir>/.claude/worktrees/'` in
  addition to the repository's own existing `<rootDir>/dist/` entry) to work
  around this — `jest.config.js` itself was not modified, since permanently
  fixing this collision is unrelated to WDK retry-safety and belongs to
  whoever owns those other sessions' worktree cleanup. The full, untargeted
  suite (`npx jest` with no path filter) could not be run to completion on
  this machine in this state; the targeted run above is what this
  environment allows, and is reported as such rather than a full-suite
  result being fabricated.

---

## 18. Property Verdict

**Claude recommendation: C — STRUCTURAL GAP.**

The current `WdkSettlementProvider`/`escrow.service.ts` design cannot safely
distinguish an unknown outcome from a definite failure, and cannot
reconcile an ambiguous prior attempt before retrying, without an
architectural change (some form of persisted pre-broadcast intent and/or
post-broadcast identity, reconciled before any retry is permitted — no
specific mechanism is chosen here, see §19). This is not a narrow,
single-line fix: the gap exists precisely because `lockFunds()`'s current
design persists nothing about the external call until AFTER it fully
succeeds, and reverts unconditionally on any failure at any point in
between.

This verdict is **Claude's recommendation only.** The CTO decides final
disposition, per the mission's own governing rule.

**Demonstrated vs. inferred vs. unknown, summarized:**
- **DEMONSTRATED** (by a real test against the unmocked orchestration code):
  the exact "submit then throw" retry-safety gap (§11, Test 1); the
  contrast safe case (§11, Test 2); the already-protected concurrent-claim
  boundary (§11, Test 3).
- **REPOSITORY/UPSTREAM OBSERVED** (direct source reading, no test needed):
  the full call path (§2); the DB-write ordering and crash windows (§4);
  the WDK API's hash-timing and no-idempotency-key contract (§5); the nonce
  auto-management with no caching (§6); the retry-surface inventory (§8);
  the event-delivery semantics under the active store (§9); the API route's
  lack of any idempotency mechanism (§10); the missing receipt/confirmation
  check (§7, window G — a related but separate finding).
- **INFERRED**: the qualitative outcome ranges in §6's nonce analysis
  (which exact branch occurs depends on RPC-node-internal timing this
  environment cannot directly observe); windows B/C/F's classification.
- **UNKNOWN**: whether any currently-configured deployment uses
  `RedisStreamsEventStore` instead of `PostgresEventStore` (this document
  confirms the default/observed configuration, not every possible one);
  real-world RPC-node mempool-visibility timing under Sails' actual
  infrastructure (NOT TESTED — no live adversarial network test was run).

---

## 19. Minimum Mechanism Candidates — NOT AUTHORIZED, Recorded Only

Per the mission's explicit instruction, no mechanism is chosen or
implemented here. For the record, so a future authorized mission does not
re-derive this from scratch:

- **PROPERTY:** a side-effecting external funding action must not be
  repeated merely because the caller cannot determine the first attempt's
  outcome.
- **Candidate mechanism classes** (examples only, not authorized, not
  ranked as a recommendation):
  - Persist a pre-broadcast intent (e.g., the populated-but-unsigned
    transaction's nonce, or a locally-generated idempotency key) BEFORE
    calling `transfer()`, so a retry can first check "did my last attempt's
    nonce already land on-chain?" before broadcasting a new one.
  - Introduce an explicit `UNKNOWN`/`SUBMISSION_UNKNOWN` intermediate
    `Escrow.status` (or a parallel field) that `revertEscrowStatus()` moves
    to instead of `CREATED` whenever the failure occurred after
    `provider.lockFunds()` was actually invoked — distinguishing "never
    tried" from "tried, outcome unclear."
  - A provider-specific operation journal (WDK-only, not a cross-provider
    abstraction) recording `{ tradeId, nonce, timestamp }` before broadcast,
    reconciled against the chain (via the deterministically-derivable escrow
    address) before any retry proceeds.
  - Add a receipt/confirmation wait (`provider.waitForTransaction()`) to
    close window G (§7) — a related, not identical, property.
- **Alternatives considered and why they are not proposed:** a generic
  cross-provider `IdempotencyManager`/transaction registry (rejected by
  this document's own COBRA/Rube Goldberg check, §21 — no second provider
  has this exact problem today, since MULTISIG/LIGHTNING_HODL/SAFE_GUARD_EVM's
  `lockFunds()` calls are read-only verifications, not self-initiated
  transfers).
- **Tradeoffs, migration impact, test obligations:** explicitly not
  evaluated here — that is the next mission's work, only if the CTO
  authorizes pursuing a specific candidate.

---

## 20. Checks

**Goodhart Check:** this document does not conclude "duplicate transfer
proven, funds definitely at risk" merely because that would be a more
dramatic finding — the actual conclusion (STRUCTURAL GAP, with the specific,
bounded windows named) is what the evidence supports, no more and no less.
Windows A/B/C/F are explicitly reported as safe or likely-safe, not
inflated to match the unsafe windows.

**COBRA Check:** no new QVAC/agent/AI responsibility was invented; no
deterministic validation, replay protection, or settlement truth was moved
to AI. No mechanism was implemented — only investigated and documented.

**Rube Goldberg Check:** the property is answerable, and any future fix is
almost certainly answerable, provider-locally (inside `wdk-settlement.provider.ts`/
`escrow.service.ts`'s WDK-specific branch) — no cross-protocol machinery,
generic idempotency framework, or new orchestration abstraction is proposed
or needed to describe this finding.

**Sacrifice Check:**
- **Safety property currently missing:** retry-after-ambiguous-failure
  safety for `WDK_USDT_EVM`'s `lockFunds()` specifically.
- **Evidence proving that:** §11 (a real test against the unmocked
  orchestration code, not a hypothetical).
- **Minimum mechanism that could close it:** not chosen here — §19 names
  candidate classes only.
- **What it would cost:** unknown until a specific candidate is chosen and
  scoped — at minimum, additional persisted state and a reconciliation step
  before every retry, which adds latency/complexity to the happy path in
  proportion to how it's built.
- **What would be sacrificed:** none of this document's findings require
  sacrificing anything today — no behavior changed.
- **Does it belong in this provider or the core?** In this provider
  specifically, per the Rube Goldberg check above — nothing here suggests
  the other three real providers share this exact exposure (their
  `lockFunds()` calls are read-only verifications, not self-initiated
  transfers), so a shared/core mechanism is not evidenced as necessary.

---

## 21. New Backlog Deltas Registered By This Mission

1. **The retry-safety gap itself — now DEMONSTRATED, not merely a
   hypothesis.** Supersedes (does not delete) the original 7-open-question
   framing in `docs/TECHNICAL_DEBT_AUDIT.md` #56 — that entry is preserved
   verbatim below its original text, with a dated pointer to this document.
2. **New, independent finding: no timeout is configured for `WDK_USDT_EVM`'s
   RPC provider** (§5) — unlike `SAFE_GUARD_EVM`'s F1-remediated explicit
   bound. Not previously covered by F1 (F1's own scope named only
   `multisig.provider.ts`/`safe-guard-evm.provider.ts`). EVIDENCE
   OBLIGATION for a future mission, not fixed here.
3. **New, independent finding: no on-chain receipt/confirmation check
   exists** — a reverted (but RPC-accepted) transfer would be recorded as a
   successful lock with a real `txLockId`, even though no USDT actually
   moved (§7, window G). Related to, but analytically distinct from, the
   retry-safety property this mission was scoped to investigate. EVIDENCE
   OBLIGATION / IMPLEMENTATION DEFECT candidate for a future mission — not
   fixed here.
4. **Environmental/infrastructure finding, not a code defect:** stale
   `.claude/worktrees/` directories from unrelated parallel sessions
   currently break a plain `npx jest` on this machine via a Haste
   module-map collision (§17). Not this mission's to fix (ownership
   ambiguous, out of WDK-retry-safety scope) — disclosed so it is not
   mistaken for a regression introduced by this branch.

None of these four items authorize or imply any implementation. All are
evidence obligations or disclosed conditions for a future, separately
authorized mission.
