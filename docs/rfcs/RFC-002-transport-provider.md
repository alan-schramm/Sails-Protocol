# RFC-002: Transport Provider — Pears Is an Implementation, Not a Dependency

## Summary

Formalizes the `TransportProvider` interface already specified in
`PROTOCOL_SPECIFICATION.md` §4B, written up as a proper RFC for the
record. Pears/HyperDHT becomes the reference implementation's
`TransportProvider`, not a fixed protocol dependency.

## Motivation

The Protocol Quality Review found a real asymmetry: `SettlementProvider`
and `OpenFinanceAdapter` were both pluggable from the start; the P2P
transport layer (`PearNode`/`PearNodeRegistry`, `NODE_ARCHITECTURE.md`)
imported `HyperDHT`/`Hyperswarm` directly, with no interface boundary.
This broke `PRINCIPLES.md` Principle 6 ("Infrastructure Neutral") for
exactly one of the protocol's four pluggable dimensions.

## Alternatives Considered

1. **Treat Pears as foundational, like SHA-256 in Bitcoin.** Considered
   seriously. Rejected because the analogy doesn't hold: SHA-256 is a
   cryptographic primitive with no meaningful alternative-selection
   question at the protocol's timescale. P2P transport is not — a
   genuinely better DHT or NAT-traversal technology emerging in 5-8 years
   is a realistic scenario, not a hypothetical one.
2. **Introduce `TransportProvider` as an interface, Pears as its first
   implementation.** **Accepted.**

## Decision

```typescript
interface TransportProvider {
  name: string
  start(participant: Participant): Promise<PeerHandle>   // Participant, per RFC-001
  stop(peerId: string): Promise<void>
  joinTopic(topic: string): Promise<void>
  broadcast(topic: string, payload: unknown): Promise<void>
  sendToPeer(peerId: string, payload: unknown): Promise<boolean>
  onMessage(handler: (peerId: string, payload: unknown) => void): void
  onPeerConnected(handler: (peerId: string) => void): void
  onPeerDisconnected(handler: (peerId: string) => void): void
}
```

**Amendment (v8.7 — CTO review):** added a principle this RFC did not
originally state explicitly: **the protocol never assumes continuous
connectivity.** `sendToPeer`'s `Promise<boolean>` return was already
compatible with this (it can resolve `false` or queue), but the contract
is now explicit rather than implicit — a `TransportProvider` implementation
is free to be store-and-forward, to tolerate intermittent connectivity, or
to run over satellite, LoRa, or offline messaging relays, without the
protocol caring. This is a direct extension of the same reasoning that
motivated `TransportProvider` in the first place (Decision, above) and
connects concretely to the project's own sovereign-finance thesis —
someone with only intermittent connectivity is exactly who "sovereign"
needs to include, not an edge case to defer.

`PearsTransportProvider` wraps the existing `PearNode`/`PearNodeRegistry`
logic with zero behavioral change — a refactor scheduled for
Implementation Freeze, not a rewrite.

## Primitives Used or Extended

No primitive change. `TransportProvider` is Infrastructure-layer
(`ARCHITECTURE.md` §1), consumed by `Negotiation` (§1.4, via
`NegotiationChannel`) and `Discovery`'s peer-announcement mechanism (§1.3)
— neither primitive's own contract changes.

## Principle Alignment

- **Principle 6 (Infrastructure Neutral):** directly closes the gap this
  principle already claimed but didn't fully deliver for transport.
- **Principle 1 (Protocol First):** the reasoning in Alternatives above is
  a direct application — refusing to let one implementation's convenient
  technology choice become an unstated protocol commitment.

## Specification

See `PROTOCOL_SPECIFICATION.md` §4B for the full interface and
`NODE_ARCHITECTURE.md`'s revision note for how it maps onto existing code.

## Backward Compatibility

No `protocolVersion` bump. No data migration — this is an Infrastructure
Layer interface introduction around existing, unchanged behavior.

## Reference Implementation Plan

Satsails' reference implementation wraps `PearNode` as
`PearsTransportProvider` during Implementation Freeze. No second
implementation is planned in the near term — this RFC's purpose is making
one legitimately possible later, not building one now.
