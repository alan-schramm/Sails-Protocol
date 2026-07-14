# DATABASE.md
### Sails Protocol — Engineering Handoff · Document 3 of 20

> Schema lives at `prisma/schema.prisma` in the Satsails reference
> implementation. PostgreSQL is the reference implementation's choice — the
> protocol itself does not mandate any specific database (see
> `ARCHITECTURE.md` section 1).

---

## 1. The `moduleId` / `protocolVersion` Pattern (read this before touching the schema)

Every entity that belongs to a specific protocol module carries two fields:

```prisma
moduleId        String  @default("openp2p")     // which module owns this row
protocolVersion String  @default("0.1")          // which spec version created it
```

**Why:** without `moduleId`, when Sails OpenFinance ships in the future and
needs its own trades/offers/escrows, you'd either need new tables (duplicate
schema) or ambiguous shared tables. With `moduleId`, `OpenFinance` rows and
`OpenP2P` rows can coexist in the same `trades` table, cleanly distinguished
by a `WHERE moduleId = 'openfinance'` filter.

`protocolVersion` exists so that, as the Sails Protocol Spec evolves (e.g.
`0.1` → `0.2` changes the shape of an event payload), you can tell which
version's rules applied when a given row was created — critical for
long-lived data and for debugging disputes.

**Rule:** any new entity you add to this schema must include both fields, set
to the correct module's canonical name (see the module list in
`ARCHITECTURE.md` section 3) and the current spec version.

---

## 2. Enums

```prisma
enum AssetType {
  BTC
  USDT_ERC20
  USDT_TRC20
  USDT_LIQUID
  USDT_LIGHTNING
  LN_BTC
  LIQUID_BTC
  SPARK
  STACKS
  RSK_BTC
}

enum TradeSide {
  BUY
  SELL
}

enum OfferStatus {
  ACTIVE
  PAUSED
  COMPLETED
  CANCELLED
}

enum TradeStatus {
  PENDING
  ACTIVE
  COMPLETED
  DISPUTED
  CANCELLED
}

enum EscrowType {
  MULTISIG
  LIGHTNING_HODL
  LIQUID_COVENANT
  MOCK
}

enum EscrowStatus {
  CREATED
  FUNDS_LOCKED
  PAYMENT_PENDING
  COMPLETED
  DISPUTED
  REFUNDED
}

enum PaymentMethod {
  PIX
  TED
  BANK_TRANSFER
  CRYPTO_DIRECT
  LIGHTNING_DIRECT
  CASH
  OTHER
}
```

Note: `TradeStatus` and `EscrowStatus` are intentionally separate enums —
Trade is a coarser-grained lifecycle owned by OpenP2P, Escrow is the more
granular state machine owned by OpenSettlement. See
`PROTOCOL_SPECIFICATION.md` for how the 9-state canonical Trade Lifecycle
maps onto these two enums plus the Intent Engine's own lifecycle states.

---

## 3. Models

### `User` — owned by `openidentity`

```prisma
model User {
  id              String   @id @default(uuid())
  publicKey       String   @unique              // Ed25519, the sovereign identity
  displayName     String?
  peerId          String?  @unique              // HyperDHT peer id, set once P2P node starts
  reputationScore Float    @default(0)
  totalTrades     Int      @default(0)
  disputeCount    Int      @default(0)
  totalVolumeBtc  Float    @default(0)
  verified        Boolean  @default(false)
  moduleId        String   @default("openidentity")
  protocolVersion String   @default("0.1")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  offers             Offer[]
  buyerTrades        Trade[]           @relation("BuyerTrades")
  sellerTrades       Trade[]           @relation("SellerTrades")
  sentMessages       Message[]
  reputationGiven    ReputationEvent[] @relation("RaterEvents")
  reputationReceived ReputationEvent[] @relation("RatedEvents")

  @@map("users")
}
```

**Important:** `reputationScore`, `totalTrades`, `disputeCount`, and
`totalVolumeBtc` are written by the OpenReputation module's event handlers
(reacting to `settlement.escrow.released` and `openp2p.trade.disputed`), not
by OpenSettlement or OpenP2P directly. See `handlers.ts` in
`ARCHITECTURE.md` section 5 for the exact reactive flow. This was a real
coupling bug found and fixed during code review — do not reintroduce direct
writes to these fields from other modules.

### `Offer` — owned by `openliquidity` (NOT `openp2p` — this is deliberate)

```prisma
model Offer {
  id              String        @id @default(uuid())
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  asset           AssetType
  side            TradeSide
  priceUsd        Float
  priceBrl        Float?
  minAmount       Float
  maxAmount       Float
  paymentMethod   PaymentMethod
  paymentDetails  String?
  status          OfferStatus   @default(ACTIVE)
  network         String?
  description     String?
  requiresKyc     Boolean       @default(false)
  moduleId        String        @default("openliquidity")
  protocolVersion String        @default("0.1")
  intentType      String?                          // e.g. "TradeIntent"
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  trades Trade[]

  @@index([asset, side, status])
  @@index([userId])
  @@map("offers")
}
```

### `Trade` — owned by `openp2p`

```prisma
model Trade {
  id              String      @id @default(uuid())
  offerId         String
  offer           Offer       @relation(fields: [offerId], references: [id])
  buyerId         String
  buyer           User        @relation("BuyerTrades", fields: [buyerId], references: [id])
  sellerId        String
  seller          User        @relation("SellerTrades", fields: [sellerId], references: [id])
  asset           AssetType
  amount          Float
  priceUsd        Float
  totalUsd        Float
  status          TradeStatus @default(PENDING)
  escrowId        String?     @unique
  escrow          Escrow?
  network         String?
  moduleId        String      @default("openp2p")
  protocolVersion String      @default("0.1")
  intentType      String      @default("TradeIntent")
  completedAt     DateTime?
  cancelledAt     DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  messages         Message[]
  reputationEvents ReputationEvent[]

  @@index([buyerId])
  @@index([sellerId])
  @@index([status])
  @@map("trades")
}
```

### `Escrow` — owned by `opensettlement`

```prisma
model Escrow {
  id              String       @id @default(uuid())
  tradeId         String       @unique
  trade           Trade        @relation(fields: [tradeId], references: [id])
  type            EscrowType   @default(MOCK)
  status          EscrowStatus @default(CREATED)
  lockedAmount    Float
  asset           AssetType
  network         String?
  multisigAddr    String?
  redeemScript    String?
  txLockId        String?
  txReleaseId     String?
  timelockHours   Int          @default(24)
  moduleId        String       @default("opensettlement")
  protocolVersion String       @default("0.1")
  lockedAt        DateTime?
  expiresAt       DateTime?
  releasedAt      DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  events EscrowEvent[]

  @@map("escrows")
}
```

**Escrow state machine — valid transitions (enforced in application code,
not the database):**

```
CREATED         → FUNDS_LOCKED, REFUNDED
FUNDS_LOCKED    → PAYMENT_PENDING, DISPUTED, REFUNDED
PAYMENT_PENDING → COMPLETED, DISPUTED
COMPLETED       → (terminal)
DISPUTED        → COMPLETED, REFUNDED
REFUNDED        → (terminal)
```

### `EscrowEvent` — audit log, owned by `opensettlement`

```prisma
model EscrowEvent {
  id          String       @id @default(uuid())
  escrowId    String
  escrow      Escrow       @relation(fields: [escrowId], references: [id])
  fromStatus  EscrowStatus
  toStatus    EscrowStatus
  triggeredBy String
  note        String?
  createdAt   DateTime     @default(now())

  @@map("escrow_events")
}
```

Every escrow state transition writes a row here — this is the append-only
audit trail used for dispute resolution (see `SECURITY_MODEL.md`).

### `Message` — owned by `openp2p` (Negotiation primitive / Secretstream chat)

```prisma
model Message {
  id        String    @id @default(uuid())
  tradeId   String
  trade     Trade     @relation(fields: [tradeId], references: [id])
  senderId  String
  sender    User      @relation(fields: [senderId], references: [id])
  content   String
  msgType   String    @default("TEXT")   // TEXT | IMAGE | PAYMENT_PROOF | SYSTEM
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([tradeId])
  @@map("messages")
}
```

This table exists precisely because the messaging/negotiation module is
still necessary — see `PROJECT_CONTEXT.md` for why. `msgType =
PAYMENT_PROOF` is how the buyer proves to the seller that fiat was sent,
without the protocol ever touching the fiat itself.

### `ReputationEvent` — owned by `openreputation`

```prisma
model ReputationEvent {
  id              String   @id @default(uuid())
  tradeId         String
  trade           Trade    @relation(fields: [tradeId], references: [id])
  raterId         String
  rater           User     @relation("RaterEvents", fields: [raterId], references: [id])
  ratedId         String
  rated           User     @relation("RatedEvents", fields: [ratedId], references: [id])
  score           Int
  comment         String?
  moduleId        String   @default("openreputation")
  protocolVersion String   @default("0.1")
  createdAt       DateTime @default(now())

  @@unique([tradeId, raterId])
  @@map("reputation_events")
}
```

`@@unique([tradeId, raterId])` is a deliberate anti-abuse constraint — one
participant can only rate a given trade once.

---

### `Claim`, `Proof`, `EvidenceVerification` — owned by no single module (RFC-003)

**Added v8.20 — these tables were missing entirely; earlier versions of this
document predate RFC-003's Claim/Proof/Verification split.**

```prisma
model Claim {
  id              String   @id @default(uuid())
  claimedBy       String   // a participantId (User.id) — see RFC-001
  claimType       String   // open string: 'payment_sent', 'invoice_paid',
                            // 'oracle_verified', 'collateral_held', ...
  assertion       Json
  moduleId        String   @default("openproof")  // RFC-006 — was unset before OpenProof existed
  protocolVersion String   @default("0.1")
  createdAt       DateTime @default(now())

  proofs Proof[]
  @@map("claims")
}

model Proof {
  id          String   @id @default(uuid())
  claimId     String
  claim       Claim    @relation(fields: [claimId], references: [id])
  evidence    Json     // opaque — signature, receipt image ref, oracle payload
  submittedAt DateTime @default(now())

  verifications EvidenceVerification[]
  @@map("proofs")
}

model EvidenceVerification {
  id         String   @id @default(uuid())
  proofId    String
  proof      Proof    @relation(fields: [proofId], references: [id])
  verifiedBy String   // a participantId, an arbiter, or a QVAC agent identifier
  verdict    String   // 'ACCEPTED' | 'REJECTED'
  reason     String?
  verifiedAt DateTime @default(now())

  @@map("evidence_verifications")
}
```

Named `EvidenceVerification` here (not `Verification`) only to avoid a
reserved-word collision in some ORMs — the primitive itself is still
called `Verification` in `PROTOCOL_SPECIFICATION.md` §1.8.

### `Capability`, `CapabilityGrant` — Core components, not module-owned (RFC-005)

```prisma
model Capability {
  id             String   @id @default(uuid())
  capabilityName String   @unique  // 'trade-coordination', 'settlement', ...
  version        String
  events         String[] // {module}.{entity}.{action} namespace this owns
  states         String[]
  requiredGrants String[]
  api            String[]
  moduleId       String   // which module implements this capability

  @@map("capabilities")
}

model CapabilityGrant {
  id             String    @id @default(uuid())
  grantedTo      String    // a participantId or an Agent identifier
  capabilityName String
  scope          String[]
  constraints    Json?
  issuedBy       String
  createdAt      DateTime  @default(now())
  revokedAt      DateTime?

  @@map("capability_grants")
}
```

### A note on `Participant` (RFC-001) and this schema

`User` (above) remains the concrete table — it already has the right
shape (`publicKey`, `verificationLevel` via a level field, etc.) to satisfy
the `Participant` interface `Identity` implements. No new `Participant`
table is needed at the reference-implementation level; `Participant` is a
Core-level TypeScript abstraction (`PROTOCOL_SPECIFICATION.md` §1.1), not
a distinct persisted entity — `User.id` already serves as `participantId`
everywhere `Claim.claimedBy`, `CapabilityGrant.grantedTo`, etc. reference
one.



| Key pattern | Purpose |
|---|---|
| `trade:room:<tradeId>` | Last ~100 chat messages cached, TTL ~48h |
| `users:online` | Set of currently connected userIds (WebSocket) |
| `offers:<asset>:<side>` | Cached order book slice per asset/side |
| `reputation:<userId>` | Cached reputation score |
| `escrow:state:<escrowId>` | Cached current escrow state |

None of this is mandated by the protocol — a different reference
implementation could use any cache strategy or none at all.

---

## 5. Not Yet Implemented (Intent Engine's own tables)

`PROTOCOL_SPECIFICATION.md` describes a generic `intents` /
`intent_payloads` / `intent_transitions` table design for the future Intent
Engine core. **These tables do not exist yet** in `schema.prisma`. Today,
`Offer` with its `intentType` field is a stand-in for `TradeIntent`. Building
the full generic Intent Engine tables is a `Meses 1-3` / `Meses 4-6` roadmap
item — see `ROADMAP.md` and `TODO.md`.
