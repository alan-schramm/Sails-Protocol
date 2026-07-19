# SDK_GUIDE.md
### Sails Protocol — Engineering Handoff · Document 5 of 20

> **Status: 🟢 v0.1 real, partial** *(2026-07-17)*. `@sails/sdk`
> (`packages/sails-sdk`) now exists as a real npm workspace package —
> this document is no longer purely aspirational, it is the spec a real
> implementation is checked against. `SailsClient`'s Protocol SDK layer
> (`identity`, `reputation`, `liquidity`, `openp2p`, `settlement`,
> `peers`) is genuinely implemented against the reference
> implementation's real, tested HTTP/WS routes (verified route-by-route
> against each `*.routes.ts` file directly, not assumed from this doc's
> prose — see this file's own section 2 note on `createIntent`/`trade()`
> deviations found that way). Of the six-verb Intent facade,
> `createIntent`/`cancelIntent` are real; `negotiate`/`submitProof`/
> `releaseAsset`/`dispute` throw `SailsNotImplementedError` with a
> specific reason and, where one exists, a real working alternative
> (`packages/sails-sdk/src/intent-facade.ts`'s own header has the full
> explanation — the blocker is server-side: no Intent -> Trade -> Escrow
> linkage, and the Proof primitive has zero routes yet). Its MVP release
> is branded **Sails P2P Trading SDK** — same package, scoped to what's
> actually being built first (P2P trading); see `PROJECT_CONTEXT.md`
> section 3 for the naming rule.

The SDK is where the developer diagram (`PROJECT_CONTEXT.md` section 3,
"The developer diagram") lands in code — `SailsClient` is what sits at the
"Sails P2P Trading SDK" layer, the one thing a wallet imports to get every
module below it:

```
                    Wallet
                       │
                       ▼
            Sails P2P Trading SDK   ← SailsClient, this document
                       │
   ════════════════════════════════════
              Sails Protocol
   ════════════════════════════════════
   OpenP2P          OpenSettlement
   OpenIdentity     OpenProof
   OpenReputation   OpenAgents
   OpenLiquidity    OpenFinance (roadmap)
   ════════════════════════════════════
      WDK      ·      Pears      ·      QVAC
   ════════════════════════════════════
   Bitcoin · Liquid · Lightning · USDT
```

See `docs/DEVELOPER_JOURNEY.md` for this same shape walked step by step,
with each step's real status called out (only OpenP2P is `✅ Proven` today
— everything below is this document's spec, not running code).

---

## 1. Why the SDK exists

The SDK is the developer-facing surface of the entire protocol. Instead of
an integrator learning 5 different module APIs and their event conventions,
they install one npm package and get a single typed client.

```bash
npm install @sails/sdk
```

The SDK adds **no new business logic** — it is a thin, typed wrapper around
the module APIs described in `API_REFERENCE.md`. If you ever find yourself
adding real logic inside the SDK that isn't already in a module's service
layer, that's a design smell: the logic belongs in the module, and the SDK
should just expose it.

---

## 2. The `SailsClient` Interface (canonical — do not diverge from this shape without updating this doc first)

```typescript
interface SailsClient {
  // ── Intent-oriented facade (v7.2 — the primary interface, per PRINCIPLES.md
  // "Intent Driven" and API_REFERENCE.md section 0). An application should
  // reach for these six methods first — module-specific methods below exist
  // for advanced/direct use, not as the default pattern.
  createIntent<T extends IntentPayload>(payload: T): Promise<Intent<T>>
  cancelIntent(intentId: string): Promise<void>
  negotiate(intentId: string, event: NegotiationEvent): Promise<void>
  // event is one of OFFER_PROPOSED | COUNTER_OFFERED | TERMS_ACCEPTED |
  // TERMS_REJECTED | MESSAGE_EXCHANGED — see PROTOCOL_SPECIFICATION.md §1.4.
  // A HumanChatChannel-backed application typically wraps this with a chat
  // UI that sends MESSAGE_EXCHANGED events; an agent-driven integration
  // sends the structured events directly with no UI at all.
  submitProof(intentId: string, proof: ProofSubmission): Promise<Proof>
  // proof.claimType is open-ended (PROTOCOL_SPECIFICATION.md §1.8) — well-known
  // conventional values include 'payment_sent', 'invoice_paid',
  // 'oracle_verified', 'kyc_verified', 'collateral_held'. The SDK and Core
  // never special-case any of these; a new claimType needs no protocol change.
  // Media evidence attached via submitProof() is stored through an
  // EvidenceProvider (RFC-007) the Reference Implementation configures —
  // the SDK/Core never receive or hold the raw media, only the resulting
  // signed EvidenceReference. See the proof: namespace below for reading
  // that evidence back.
  releaseAsset(intentId: string): Promise<Settlement>
  // Designed (RFC-007 D3), not yet migrated: settlement status is intended
  // to eventually pass through PENDING_BANK_SETTLEMENT before COMPLETED —
  // representing a payment held/processing at the payer's financial
  // institution, not yet a failure state — but the real EscrowStatus enum
  // (prisma/schema.prisma) does not have this value today. Status note
  // added 2026-07-19 (consolidation audit) after this file, alongside
  // three others, described it as already live.
  dispute(intentId: string, reason: string): Promise<Dispute>
  // Escalation order (RFC-007 D4): Policy Engine → OpenAgents → a Trusted
  // Arbitrator via ArbitrationProvider → Settlement. Human arbitration is
  // the last stage, not the first — most disputes are expected to resolve
  // before ever reaching an ArbitrationProvider.

  // Sails OpenIdentity
  identity: {
    create(keypair: Ed25519Keypair): Promise<Participant>
    verify(challenge: Challenge): Promise<AuthToken>
    get(participantId: string): Promise<Participant>
  }

  // Sails OpenReputation
  reputation: {
    get(participantId: string): Promise<ReputationScore>
    // ReputationScore (RFC-007 D8) is computed exclusively from
    // recordOutcome() / SettlementOutcome events — rate() below never
    // feeds into it, and a CancelledByAgreement outcome always classifies
    // Neutral, never Negative.
    rate(tradeId: string, score: 1 | 2 | 3 | 4 | 5): Promise<void>
    // Informational feedback only as of RFC-007 — stored, displayed, but
    // does not alter ReputationScore. Do not build UI that implies this
    // is "leaving a rating that affects reputation."
    leaderboard(): Promise<ReputationScore[]>
  }

  // Sails OpenLiquidity — advanced/direct use; createIntent()+negotiate()
  // above is the path most applications should use instead
  liquidity: {
    publish(offer: OfferIntent): Promise<Offer>
    discover(intent: Intent): Promise<Offer[]>
    match(intent: Intent): Promise<Match | null>
    cancel(offerId: string): Promise<void>
  }

  // Sails OpenSettlement — advanced/direct use; releaseAsset()/dispute()
  // above is the path most applications should use instead
  settlement: {
    create(type: SettlementType, tradeId: string): Promise<Escrow>
    lock(escrowId: string): Promise<Escrow>
    release(escrowId: string): Promise<Escrow>
    dispute(escrowId: string, reason: string): Promise<Escrow>
  }

  // Sails OpenP2P — advanced/direct use; negotiate() above is the path
  // most applications should use instead
  openp2p: {
    trade(offerId: string): Promise<Trade>
    chat(tradeId: string): WebSocketChannel
    getMessages(tradeId: string): Promise<Message[]>
  }

  // Capability declaration/grants — RFC-005 (rfcs/RFC-005-capability-model.md),
  // real as of RFC-013 (rfcs/RFC-013-capability-registry-and-wallet-adapter.md).
  // Self-issued grants only today — a caller declares and grants
  // themselves scope over their own declared capabilities; a real
  // multi-party issuance flow (a module operator granting scope to an
  // agent it doesn't control) is separate follow-up work.
  capabilities: {
    register(input: { capabilityName: string; scope: string[]; constraints?: Record<string, unknown> }): Promise<CapabilityGrant>
    list(participantId: string): Promise<CapabilityGrant[]>
    revoke(grantId: string): Promise<void>
    // Convenience: derives scope directly from a WalletAdapter's own
    // getCapabilities() declaration instead of the caller re-assembling
    // it into a register() call by hand.
    registerFromWallet(wallet: WalletAdapter): Promise<CapabilityGrant>
  }

  // Sails OpenProof (RFC-006, RFC-007) — advanced/direct use; submitProof()
  // above is the path most applications should use to write evidence, this
  // namespace is for reading it back
  proof: {
    getEvidenceBundle(intentId: string): Promise<EvidenceBundle>
    // Aggregates that Intent's Claims/Proofs/Verifications/Timeline/
    // external references (RFC-007 D6) — a read model, not a lifecycle
    // verb, which is why it lives here and not in the six-method facade
    // above. What a dispute UI or an ArbitrationProvider implementation
    // calls instead of re-collecting evidence by hand.
  }
}
```

**Deviations found while implementing v0.1, not silently matched:**
- `createIntent(payload)` → real signature is `createIntent(type,
  payload, agentId?)` — `type` is required since more than one
  `IntentType` exists in the frozen shape even though only `TradeIntent`
  has a registered handler today; `agentId` is optional. **Closed since
  this section was first written:** a gap audit found `POST
  /api/v1/intents` accepted a bare `participantId` in the body with zero
  authentication — the route now derives it from the authenticated
  session (`requireAuth`) instead, the same pattern every other mutating
  route in this codebase uses, so `participantId` is no longer a caller
  argument at all. `createIntent()`/`cancelIntent()` both now send the
  real auth header — call `identity.authenticate()` (or
  `client.setSessionToken()`) first, same requirement every other
  authenticated SDK call already has.
- `openp2p.trade(offerId)` → real signature is `trade(offerId, amount)`
  — `POST /v1/openp2p/trades`'s body requires `amount`.

## 3. Fundamental Protocol Types (also part of `@sails/protocol-spec`)

```typescript
type Intent = TradeIntent | PaymentIntent | LoanIntent | SwapIntent | EarnIntent | AgentIntent

interface TradeIntent {
  type: 'trade'
  asset: AssetType
  side: 'BUY' | 'SELL'
  maxValue?: number
  minValue?: number
  currency?: string
  fiatMethod?: FiatMethod
  network?: Network
  slippageTolerance?: number
  // RFC-013 (rfcs/RFC-013-capability-registry-and-wallet-adapter.md) —
  // additive counterparty-matching constraints, not yet enforced during
  // matching (OpenLiquidity follow-up work) — this is the vocabulary.
  minReputationRating?: number // 0-5, mirrors ReputationScore's scale
  kycRequired?: boolean
}

// WDK_USDT_EVM was missing from this list until a 2026-07-19
// consolidation audit caught it — it's the second real, tested
// SettlementProvider (@tetherto/wdk-wallet-evm, wdk-settlement.provider.ts),
// not an aspirational value.
type SettlementType = 'MOCK' | 'MULTISIG' | 'LIGHTNING_HODL' | 'LIQUID_COVENANT' | 'WDK_USDT_EVM'

// RFC-005 (rfcs/RFC-005-capability-model.md) — the permission-grant side
// of the Capability model; real as of RFC-013. Field-name drift found
// 2026-07-19 (consolidation audit): RFC-005's own design named this
// field `grantId`, copied here verbatim — but the real Prisma model and
// the real GET/POST /v1/capabilities routes both call it `id`. Expect
// `id` from the actual API today; `grantId` below matches the design
// doc, not (yet) the live response shape. See PROTOCOL_SPECIFICATION.md
// §1.10 for the full note and TODO.md for the reconciliation this needs.
interface CapabilityGrant {
  grantId: string
  grantedTo: string
  capabilityName: string
  scope: string[]
  constraints?: Record<string, unknown>
  issuedBy: string
}

// RFC-013 — optional `SailsClient` constructor argument. Lets a wallet's
// own signing/balance/address logic plug into the SDK; deliberately
// transport- and chain-agnostic (asset is a string key, tx/signedTx are
// unknown), same discipline SettlementProvider/TransportProvider already
// use server-side. `getPeerId()`, not `getNodeId()` — matches this
// codebase's own existing vocabulary (User.peerId, pearNodeRegistry).
interface WalletAdapter {
  getPeerId(): Promise<string>
  getAddress(asset: string): Promise<string>
  getBalance(asset: string): Promise<string>
  signTransaction(asset: string, tx: unknown): Promise<unknown>
  broadcastTransaction(asset: string, signedTx: unknown): Promise<string>
  getCapabilities(): Promise<{
    assets: string[]
    fiatRails: string[]
    supportsP2PTrading: boolean
    supportsOnchainSettlement: boolean
  }>
}

interface ReputationScore {
  participantId: string
  total: number        // 0-100
  tradeScore: number
  volumeScore: number
  settlementScore: number
  disputeRate: number
}
```

Full definitions of `PaymentIntent`, `LoanIntent`, `SwapIntent`,
`EarnIntent`, `AgentIntent` payloads are in `PROTOCOL_SPECIFICATION.md`
section on the Intent Engine — copy them from there verbatim when
implementing the SDK types, do not redefine them independently.

`EvidenceBundle`, `EvidenceReference`, `Timeline`/`TimelineEntry`,
`ArbitrationProvider`, and `OperationalProfileGrant` (RFC-007,
`rfcs/RFC-007-real-world-p2p-requirements.md`) follow the same rule — copy
their shapes from `PROTOCOL_SPECIFICATION.md` §1.1/1.8/1.9 verbatim, they
are not redefined here.

---

## 4. Expected Usage (what "done" looks like)

```typescript
import { SailsClient } from '@sails/sdk'

const sails = new SailsClient({
  wdk: await WDK.fromKeypair(keypair),
  network: 'mainnet',
})

// Discover counterparties for a trade intent
const matches = await sails.liquidity.discover({
  type: 'trade',
  asset: 'BTC',
  side: 'BUY',
  maxValue: 2000,
  currency: 'BRL',
  fiatMethod: 'PIX',
})

// Start a trade with the best match
const trade = await sails.openp2p.trade(matches[0].id)

// Open the negotiation channel
const chat = sails.openp2p.chat(trade.id)
chat.onMessage((msg) => console.log(msg))
chat.send({ content: 'Sending payment now', msgType: 'TEXT' })

// Lock, then release escrow once payment is confirmed
const escrow = await sails.settlement.create('MULTISIG', trade.id)
await sails.settlement.lock(escrow.id)
// ... buyer sends fiat directly to seller, shares proof via chat ...
await sails.settlement.release(escrow.id)

// Rate the completed trade
await sails.reputation.rate(trade.id, 5)
```

---

## 4B. Internal SDK Layering (v7.4 — CTO review finding)

`SailsClient` (section 2) is the *public* interface — one flat object an
application imports. Internally, the SDK implementation should not be one
monolithic class behind that interface; it should be four layers, so that
adding a new module never requires touching the layers below it:

```
Wallet / Application
    ↓
Capability SDK    — checks/requests permissions before any call proceeds
                    (talks to the Capability Registry, ARCHITECTURE.md §1B)
    ↓
Intent SDK        — the createIntent/negotiate/submitProof/releaseAsset/
                    dispute/cancelIntent facade (API_REFERENCE.md §0)
    ↓
Protocol SDK       — module-specific methods (identity, reputation,
                    liquidity, settlement, openp2p) — what section 2's
                    interface calls "advanced/direct use"
    ↓
Transport          — HTTP/WebSocket client, retry logic, auth headers
```

**Why this ordering matters:** when Sails OpenFinance ships, its
`LoanIntent`/`EarnIntent` methods only need to be added at the Protocol SDK
layer — the Capability SDK, Intent SDK, and Transport layers underneath
need zero changes. This is the same "additive, never breaking" discipline
`moduleId`/`protocolVersion` enforces at the database level
(`DATABASE.md` section 1), applied to the SDK's own internal structure.

## 4C. Wallet Stack Compatibility (illustrative — WalletAdapter is real, most rows below are not)

`WalletAdapter` (section 3, real as of RFC-013,
`rfcs/RFC-013-capability-registry-and-wallet-adapter.md`) is deliberately
transport- and chain-agnostic, so it can sit in front of any wallet's own
signing stack. This table is a roadmap/positioning reference for what
that looks like across common wallet toolkits — **only the interface
itself and the reference implementation's own WDK-based usage are real
today; every other row is an unimplemented compatibility target, not a
built adapter.** Do not cite this table as evidence that BDK/LDK/mobile
integrations exist in this repository — they don't.

| SDK Toolkit | Primary Language | Asset Focus | Typical Fit | Status |
|---|---|---|---|---|
| WDK (Tether Wallet Development Kit) | TypeScript/JS | BTC, stablecoins, EVM assets | Corporate/consumer wallets, agent-driven automation | 🟢 Reference implementation (`wdk-settlement.provider.ts`, real signed testnet transfers) |
| BDK (Bitcoin Dev Kit) | Rust | Bitcoin on-chain | Security-focused/multisig wallets | 📋 Compatible in principle — no `WalletAdapter` implementation exists yet |
| LDK (Lightning Dev Kit) | Rust/C++ | Bitcoin Lightning | Instant/micro payments | 📋 Compatible in principle — Lightning would be exposed as a `WalletAdapter`-declared capability, not built |
| EVM wallet SDKs | TypeScript/Solidity | ERC-20 tokens | Web3/DApp wallets | 📋 Compatible in principle — `WalletAdapter`'s `asset`/`signTransaction` are already chain-agnostic, no EVM-specific adapter built beyond the WDK one above |
| Mobile SDKs | Kotlin/Swift | Whatever the host wallet supports | Consumer mobile wallets | 📋 Compatible in principle — `@sails/sdk` itself is JS/TS only (SDK_GUIDE.md section 6); a mobile wallet would bridge to it, not run it natively |
| Custodial APIs | Any | Custodial assets | Fintechs, OTCs, banks | 📋 Compatible in principle — a custodial `WalletAdapter` would need its own `CapabilityGrant` constraints (RFC-013) marking custody, not modeled yet |

## 5. Build Plan (roadmap-linked — see `ROADMAP.md` for exact timing)

1. **Meses 1-3**: `@sails/protocol-spec` npm package published — just the
   types and interfaces above, zero implementation. **Still not started**
   — `packages/sails-sdk/src/types.ts` currently defines its own response
   types locally (that file's own header explains why: reconciling them
   with `@sails/p2p-schemas`'s differently-shaped `OfferSchema` is real,
   separate follow-up work, not done silently as part of v0.1).
2. **Meses 4-6**: `@sails/sdk` v1.0 — a real HTTP/WebSocket client
   implementing `SailsClient` against the namespaced `/v1/{module}/` API
   described in `API_REFERENCE.md`. **v0.1 landed 2026-07-17**, ahead of
   this doc's own roadmap timing — Transport + Protocol SDK layers are
   real and tested (`packages/sails-sdk/tests/`, 33 tests: real
   `tweetnacl` Ed25519 signing verified against `auth.ts`'s exact byte
   encoding, every module's request shape checked against its real
   route). Intent facade is partial (see section 2's note above and
   `intent-facade.ts`'s header) — reaching v1.0 needs the Proof primitive
   built and an Intent -> Trade -> Escrow linkage to exist server-side,
   neither of which this SDK pass added (SDK_GUIDE.md section 1: "no new
   business logic" — that linkage is Core/module work, not SDK work).
3. **Meses 7-9 / 10-12**: SDK support for `AgentIntent` (OpenAgents) and
   `LoanIntent`/`SwapIntent`/`EarnIntent` (OpenFinance) as those modules
   ship specs.

## 6. Constraints for Whoever Builds This

- TypeScript-first. No required constructor arguments beyond `wdk` and
  `network` — sane defaults for everything else.
- Must work in both Node.js and browser environments (the reference wallet
  is a consumer-facing app).
- Must not hardcode `localhost:3000` — base URL is configurable.
- Errors thrown by the SDK should be typed subclasses matching the
  `AppError` hierarchy in the reference implementation, not raw HTTP error
  objects — see `API_REFERENCE.md` section 9 for the response shape to wrap.
