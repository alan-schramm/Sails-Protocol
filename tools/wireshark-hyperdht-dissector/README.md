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

Built as a genuine engineering-workflow improvement for Sails' own
Pears/HyperDHT debugging — as of 2026-08-08, no such dissector exists
publicly anywhere (checked the `holepunchto/hyperdht` repo directly;
nothing there either). This is a from-scratch v1, built by reading the
real source of `dht-rpc`, `hyperdht`, and `compact-encoding` — not a
guess, and not a copy of existing work, because none exists yet.

## What it decodes

- The `dht-rpc` request/response envelope (header byte, flags, transaction
  ID, source/destination address, node ID, auth token, command, DHT
  target, closer-nodes list, error code, value payload length).
- The HyperDHT command name for all 11 commands (`PEER_HANDSHAKE`,
  `PEER_HOLEPUNCH`, `FIND_PEER`, `LOOKUP`, `ANNOUNCE`, `UNANNOUNCE`,
  `MUTABLE_PUT/GET`, `IMMUTABLE_PUT/GET`, `PLUGIN`).
- Request/response correlation by transaction ID + queried-node address —
  `dht-rpc`'s wire format has no command field on a response (only the
  original requester knows what it asked), so this dissector remembers
  each request's command in a table as it sees it and looks it up again
  when the matching response arrives, so a response's `value` payload can
  be decoded with the same precision as its request. Shown in the Info
  column as `RESPONSE to LOOKUP (3) tid=1234`, or flagged explicitly as
  `(request not seen in this capture)` when the correlation can't be made
  (e.g. the capture started mid-session).
- A decode of every command's `value` payload where `persistent.js`'s own
  request handlers confirm the shape: `PEER_HANDSHAKE` (flags/mode/noise
  length), `PEER_HOLEPUNCH` (including its nested `holepunchPayload` —
  error/firewall/round), `ANNOUNCE`/`UNANNOUNCE` (shared schema, confirmed
  identical in `persistent.js`), `MUTABLE_PUT`/`MUTABLE_GET` (both
  directions), `IMMUTABLE_PUT`/`IMMUTABLE_GET` (raw content-addressed
  bytes — see the correction note below), `LOOKUP` reply's peer count,
  `PLUGIN` (plugin name/version/command). `FIND_PEER` carries no
  structured `value` and isn't decoded further.
- Cross-checked against `hyperdht`'s `lib/persistent.js` (the actual
  request *handlers*), not just `lib/messages.js`'s schema *definitions* —
  this caught a real mistake in the first draft: `IMMUTABLE_PUT`'s value
  was originally (wrongly) decoded using `MUTABLE_PUT`'s
  publicKey+seq+signature shape. `persistent.js`'s `onimmutableput()`
  shows it's actually just the raw bytes being stored, unwrapped,
  content-addressed by `hash(value) == target`. Fixed before this was
  ever used against real traffic.

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
- A few variable-length sub-fields inside otherwise-decoded payloads are
  still left as undecoded trailing bytes in this v1 for lower marginal
  debugging value relative to effort: `ANNOUNCE`'s `relayAddresses`/
  `refresh`/`signature`/`bump`, `PEER_HOLEPUNCH`'s `addresses`/
  `remoteAddress`/`token`/`remoteToken`, `LOOKUP` reply's actual peer list
  (only the count is decoded), `PLUGIN`'s trailing `value` buffer. Each is
  commented at its exact spot in `dissect_value()`.
- The tid-correlation table (see above) is a plain in-memory Lua table,
  reset whenever Wireshark reloads Lua plugins — a debugging aid scoped to
  one capture session, not a persistent store. A 16-bit tid could
  theoretically collide across two different concurrent request/response
  pairs to the *same* queried node before the first one's response
  arrives; not handled specially in this v1 (rare enough in practice not
  to be worth a more complex correlation key yet).

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

## Known limitations worth fixing next, if this gets used

- Live-traffic validation (see above) — the single most valuable next
  step, since everything else here is "correct per source reading," not
  "confirmed against real bytes."
- The variable-length trailing sub-fields listed above (relay address
  lists, signatures, hole-punch addresses/tokens, the actual `LOOKUP`
  peer list contents, `PLUGIN`'s value buffer).
- UDX — a separate, from-scratch effort: UDX doesn't appear
  anywhere in Sails' own code or dependencies (confirmed via a repo-wide
  search before starting this dissector), so unlike this HyperDHT/dht-rpc
  one, it wouldn't help debug anything Sails' own stack touches directly.
  Being pursued anyway as a distinct contribution — see
  `tools/wireshark-udx-dissector/` if that work has started.
