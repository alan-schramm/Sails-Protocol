# HyperDHT / dht-rpc Wireshark Dissector

A standalone Wireshark Lua plugin for decoding the `dht-rpc` envelope and
HyperDHT command layer used by Pears/Hyperswarm — the transport underneath
Sails Protocol's `TransportProvider`
([src/infrastructure/p2p/transport-provider.ts](../../src/infrastructure/p2p/transport-provider.ts)).

**This is a developer debugging tool. It is not part of the Sails Protocol
product, is never installed with it, and does not affect anything in
`src/` or `packages/`.** It only helps a developer *look at* the network
traffic Pears/HyperDHT already generates.

## Why this exists

Tether/Holepunch have an open bounty on [tether.dev](https://tether.dev/)
for building Wireshark support for HyperDHT/DHT-RPC and UDX — as of
2026-08-08, no such dissector exists publicly anywhere (checked the
`holepunchto/hyperdht` repo directly; nothing there either). This is a
from-scratch v1, built by reading the real source of `dht-rpc`,
`hyperdht`, and `compact-encoding` — not a guess, and not a copy of
existing work, because none exists yet.

## What it decodes

- The `dht-rpc` request/response envelope (header byte, flags, transaction
  ID, source/destination address, node ID, auth token, command, DHT
  target, closer-nodes list, error code, value payload length).
- The HyperDHT command name (`PEER_HANDSHAKE`, `FIND_PEER`, `LOOKUP`,
  `ANNOUNCE`, `MUTABLE_PUT/GET`, `IMMUTABLE_PUT/GET`, `PLUGIN`, etc.).
- A best-effort partial decode of a few of the more common commands'
  `value` payloads (`PEER_HANDSHAKE`, `ANNOUNCE`, `MUTABLE_GET` response,
  `LOOKUP` reply's peer count). Everything else is shown as raw bytes
  rather than guessed at.

## What it does NOT do

- **It cannot see application data.** The Noise_XX handshake blob inside a
  `PEER_HANDSHAKE` payload, and everything sent over an established
  Hyperswarm connection afterward (including every Sails Intent/Offer/Chat
  payload — see
  [payload-crypto.ts](../../src/infrastructure/p2p/payload-crypto.ts)),
  is encrypted. This dissector shows that as opaque bytes and does not
  attempt to decrypt anything. It only decodes the plaintext DHT routing
  layer (bootstrap, lookup, announce, hole-punch coordination) — the part
  of a Kademlia DHT that has to be readable by any participant to route at
  all, the same trust model BitTorrent's mainline DHT uses.
- **It has not been validated against a live two-node HyperDHT capture.**
  This was built by reading `holepunchto/dht-rpc`'s `lib/io.js`,
  `holepunchto/hyperdht`'s `lib/constants.js`/`lib/messages.js`, and
  `holepunchto/compact-encoding`'s `index.js` directly — the encoding
  logic is transcribed faithfully from that source, but no live capture
  was available in the environment this was built in to confirm it
  against real bytes on the wire. Treat it as "should be correct per the
  source" until someone runs it against a real `.pcap`.
- Several `value` payload shapes are intentionally left undecoded in this
  v1 (`PEER_HOLEPUNCH`'s payload, `PLUGIN`'s payload, response-side
  `LOOKUP`/`MUTABLE_GET` correlation) — see the comments in `hyperdht.lua`
  next to `dissect_value()` for exactly which ones and why.

## Install

1. Find your Wireshark personal plugins folder: in Wireshark, go to
   **Help → About Wireshark → Folders**, and look for "Personal Lua
   Plugins".
2. Copy `hyperdht.lua` into that folder.
3. Restart Wireshark (or **Analyze → Reload Lua Plugins**).

## Use

- The dissector registers itself heuristically on UDP — any UDP packet
  whose first byte matches the `dht-rpc` request (`0x0B`) or response
  (`0x1B`) header will be picked up automatically.
- It's also bound to UDP port `49737` (HyperDHT's public bootstrap nodes'
  known port) for explicit **Right-click a packet → Decode As…** if the
  heuristic doesn't catch a particular capture.
- Useful display filter: `hyperdht`
- To capture your own Sails dev environment's Pears/HyperDHT traffic,
  capture on the interface your dev machine actually egresses through
  while a `POST /v1/peers/start` session is active
  ([pear.routes.ts](../../src/infrastructure/p2p/pear.routes.ts)).

## Known limitation worth fixing next, if this gets used

Response packets never carry the original command — only the requester
knows which command a given `tid` was replying to (`dht-rpc` correlates
by transaction ID, not by re-stating the command). This dissector doesn't
do request/response correlation yet, so response `value` payloads for
commands like `LOOKUP`/`MUTABLE_GET` are shown less precisely than their
request counterparts. Wireshark's `conversation`/`Pinfo` APIs support
this kind of stateful correlation; it just wasn't built in this v1.
