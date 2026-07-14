# NODE_ARCHITECTURE.md
### Sails Protocol — Engineering Handoff · Document 6 of 20

> Covers the P2P transport layer (Pears / HyperDHT / Hyperswarm) and the
> broader question of "who runs the infrastructure" for the protocol as a
> whole. This is Infrastructure Layer material — see `ARCHITECTURE.md`
> section 1 for how it relates to Domain/Application/Protocol layers.

**Revision note (Protocol Freeze, v8.3):** everything below describes
Pears/HyperDHT — today's implementation. As of `PROTOCOL_SPECIFICATION.md`
§4B, this is formally one implementation of a `TransportProvider`
interface, not a fixed protocol dependency. `PearNode`/`PearNodeRegistry`
below is not being rewritten — it becomes `PearsTransportProvider`,
wrapped behind the interface, during Implementation Freeze. Read this
document as "how the reference implementation's transport adapter works
today," not as "the protocol's only possible transport."

---

## 1. No Single Server — a Network of Participants

The protocol's infrastructure is explicitly designed to be distributed
across participant types, not controlled by any single company (including
Satsails). Progressive decentralization: starts with Satsails-operated
bootstrap infrastructure, migrates toward community-operated as adoption
grows.

| Node type | Who runs it | Role |
|---|---|---|
| **User Nodes** | Individual participants running the Pears/Sails client | Announce offers to HyperDHT topics, chat via Secretstream. Base of the network. |
| **Wallet Nodes** | Wallet apps that integrated the SDK (e.g. Satsails Wallet) | Act as P2P nodes on behalf of their users |
| **Liquidity Nodes** | OTCs, market makers, payment providers | Standing offers, high volume, high uptime |
| **Reputation Nodes** | Anyone — validates the public reputation graph | Consensus via protocol rules, not a central authority |
| **Arbiter Nodes** | Bonded community volunteers | Handle dispute resolution (see `SECURITY_MODEL.md`) |
| **Bootstrap Nodes** | Initially Holepunch's public defaults, later Satsails-operated, eventually community-operated | Entry point for new peers joining the DHT |

---

## 2. The `PearNode` / `PearNodeRegistry` Pattern (as implemented today)

This is the concrete implementation detail in
`infrastructure/p2p/pear.service.ts`. Understanding this is required before
touching any P2P-related code.

### The problem this solves

An earlier version of this file had a single class (`PearPeerManager`)
implemented as a **process-wide singleton** — but its `start(userId, ...)`
method took a `userId` parameter, implying multiple users could run
concurrently. In practice, a second call to `start()` silently replaced the
first user's DHT node and keypair. This is a real bug that was found during
code review and fixed.

### The fix — two classes with distinct responsibilities

```typescript
class PearNode extends EventEmitter {
  // One DHT node for ONE user. No static/singleton state.
  // Owns: keyPair, dht, swarm, peers map, topic announcements — all
  // instance fields, none shared across instances.
  constructor(private readonly ownerUserId: string) { ... }
  async start(secretKeyHex: string): Promise<string> { ... }
  async stop(): Promise<void> { ... }
  // ... joinTopic, joinTradeTopic, broadcast, sendToPeer, getStatus ...
}

class PearNodeRegistry {
  // THIS is the singleton — exactly one per server process.
  // Owns a Map<userId, PearNode>, handing out or reusing one PearNode
  // per active user.
  private nodes = new Map<string, PearNode>()

  async start(userId: string, secretKeyHex: string): Promise<string> {
    let node = this.nodes.get(userId)
    if (!node) {
      node = new PearNode(userId)
      this.nodes.set(userId, node)
    }
    return node.start(secretKeyHex)
  }
  // ... stop, stopAll, get, isRunning, getStatus, activeCount ...
}

export const pearNodeRegistry = new PearNodeRegistry()
```

**Rule:** route handlers and any other code must depend on
`pearNodeRegistry`, and must never construct a `PearNode` directly. This is
what enforces "one DHT identity per user, N users per process" as the
guaranteed shape rather than an accident of whichever user called `start()`
last.

---

## 3. Topic Derivation

Topics are 32-byte SHA-256 hashes of well-known strings — any peer that
knows the topic name can independently derive the same key and find others
announcing on it. No directory server is involved.

```typescript
function deriveTopic(name: string): Buffer {
  return createHash('sha256').update(`sails:v1:${name}`).digest()
}

const TOPICS = {
  marketplace: deriveTopic('marketplace'),        // global — all peers announce here
  btc: deriveTopic('offers:BTC'),                  // per-asset topics
  lnBtc: deriveTopic('offers:LN_BTC'),
  liquidBtc: deriveTopic('offers:LIQUID_BTC'),
  usdtErc20: deriveTopic('offers:USDT_ERC20'),
  usdtLiquid: deriveTopic('offers:USDT_LIQUID'),
  trade: (tradeId: string) => deriveTopic(`trade:${tradeId}`),  // private per-trade channel
}
```

Note the `sails:v1:` prefix — this replaced an earlier `satsails:v1:` prefix
as part of the Sails Protocol / Satsails Wallet naming separation (see
`PROJECT_CONTEXT.md`). If you find `satsails:v1:` anywhere in derived
topics, that's legacy and should be migrated carefully — changing the topic
prefix changes the derived hash, which breaks discovery between old and new
clients unless handled with a migration window.

---

## 4. Connection Handling — What Belongs Here vs What Doesn't

`PearNode` only handles the generic `HANDSHAKE` message type (exchanging
`userId` to map `peerId ↔ userId`). Any other message type (chat content,
offer announcements, payment proof) is forwarded as a generic `message`
event:

```typescript
this.emit('message', { peerId: remotePeerId, message: msg })
```

Domain modules (Sails OpenP2P for chat, Sails OpenLiquidity for offer
announcements) attach their own listeners to this event instead of
`PearNode` knowing the shape of a chat message or an offer. This was a fix
applied during code review — the previous version had `PearPeerManager`
special-case `OFFER_ANNOUNCE` and `CHAT_MESSAGE` message types directly,
with dead, no-op handler bodies that just logged to console. Both were
removed; the generic forwarding pattern above replaced them.

**Rule going forward:** if you need to handle a new message type over P2P,
do not add a new `if (msg.type === 'X')` branch inside `PearNode`. Instead,
subscribe to the generic `message` event from the owning domain module.

---

## 5. Known Open Design Question (not yet decided)

None remaining as of this handoff — the singleton-vs-multi-user question
was the one open item, and it's resolved per section 2 above. If you find
another cross-cutting infrastructure design question while building out the
missing routes (`TODO.md`), document it here in the same style before
picking a default — don't silently decide alone if it affects the shared
transport layer.

---

## 6. Bootstrap Configuration

```typescript
// config.pear.bootstrapNodes — array of "host:port" strings
// Empty array → uses Holepunch's default public bootstrap nodes
// Non-empty → uses your own bootstrap nodes (needed in restrictive
// network environments, e.g. corporate firewalls blocking default nodes)
```

This is a reference-implementation configuration concern
(`config/index.ts`, which is one of the missing files — see `TODO.md`), not
a protocol-level requirement.
