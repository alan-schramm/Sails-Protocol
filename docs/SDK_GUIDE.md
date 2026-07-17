# SDK_GUIDE.md
### Sails Protocol — Engineering Handoff · Document 5 of 20

> **Status: 📋 Aspirational.** The `@sails/sdk` package does not exist yet.
> This document is the interface specification the future implementation
> must satisfy — written now so that the internal APIs (`API_REFERENCE.md`)
> are built in a way that naturally supports this SDK later, without
> requiring a rewrite.

The SDK is where the developer diagram (`PROJECT_CONTEXT.md` section 3,
"The developer diagram") lands in code — `SailsClient` is what sits at the
"Sails SDK" layer, the one thing a wallet imports to get every module
below it:

```
                    Wallet
                       │
                       ▼
                  Sails SDK          ← SailsClient, this document
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
  // Settlement status may pass through PENDING_BANK_SETTLEMENT (RFC-007 D3)
  // before COMPLETED — represents a payment held/processing at the payer's
  // financial institution, not yet a failure state.
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
}

type SettlementType = 'MOCK' | 'MULTISIG' | 'LIGHTNING_HODL' | 'LIQUID_COVENANT'

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

## 5. Build Plan (roadmap-linked — see `ROADMAP.md` for exact timing)

1. **Meses 1-3**: `@sails/protocol-spec` npm package published — just the
   types and interfaces above, zero implementation.
2. **Meses 4-6**: `@sails/sdk` v1.0 — a real HTTP/WebSocket client
   implementing `SailsClient` against the namespaced `/v1/{module}/` API
   described in `API_REFERENCE.md`.
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
