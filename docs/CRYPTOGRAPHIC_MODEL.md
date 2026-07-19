# CRYPTOGRAPHIC_MODEL.md
### Sails Protocol — Cryptographic Mechanics, Consolidated

> Not numbered in `00-INDEX.md`'s canonical 20 — added the same way
> `TRANSACTION_WALKTHROUGH.md`/`TRUST_BOUNDARY.md` were. Requested
> directly by the project owner, relaying a CTO-role architectural
> review: cryptographic mechanics existed in this codebase (identity
> signing, payload encryption, hash-chained event logs) but only as
> scattered file-level doc comments — `ARCHITECTURE.md` names three of
> them in passing in its module tree, `NODE_ARCHITECTURE.md` names none,
> `SECURITY_MODEL.md` mentions "Ed25519 keypair" and "E2E via
> Secretstream" without mechanics. Nothing tied them together with what
> each one actually guarantees — and, as importantly, what it doesn't.
>
> **Every claim below was checked against the actual code at the time
> this was written (2026-07-19).** Where a real cryptographic property
> (e.g. forward secrecy) is absent, that's stated as an open gap, not
> implied to exist because "the system uses encryption."

---

## 1. Identity: Ed25519 Keypairs

Every `Participant` (RFC-001) is identified by an Ed25519 public key —
one keypair, used for two distinct purposes that are easy to conflate:

1. **Signing** — proving control of an identity (authentication, below).
2. **P2P networking** — the same keypair *is* the node's HyperDHT/
   Hyperswarm identity (`infrastructure/p2p/pear.service.ts`'s
   `PearNode.start(secretKeyHex)`; the derived `peerId` is literally
   `publicKey.toString('hex')`). There is no separate "network key" —
   this is one primitive, not two, confirmed by grep: nothing in this
   codebase generates a second keypair for transport identity.

No production or staging deployment of this reference implementation
should ever store a raw secret key. See `TRUST_BOUNDARY.md`'s boundary
1b for the one place a secret key currently transits the backend at
all (`/v1/peers/start`, held only in memory, never persisted) — a known
gap against this ideal, not the intended shape.

---

## 2. Authentication: Challenge-Response (Replay Protection)

**Guarantee: an attacker who observes a past signed request cannot
replay it to authenticate as that participant.**

Flow (`common/middleware/auth.ts`):

1. Client requests a challenge for their claimed `publicKey`
   (`POST /v1/identity/challenge`).
2. Server generates a random 32-byte nonce (`crypto.randomBytes`),
   stores it in Redis keyed by `publicKey` with a short TTL
   (`config.auth.challengeTtlSeconds`).
3. Client signs the nonce with their Ed25519 secret key, client-side.
4. Client sends `{ publicKey, signature }`.
5. Server verifies the signature against the stored nonce
   (`nacl.sign.detached.verify`) — **then immediately deletes the
   challenge from Redis**, before checking anything else. A captured
   `{publicKey, signature}` pair cannot be reused, because the nonce it
   was computed over no longer exists server-side after first use.
6. On success, the server issues a short-lived opaque session token
   (also random, also Redis-backed with its own TTL —
   `config.auth.sessionTtlSeconds`) — every subsequent request in that
   window authenticates via the session token (`Authorization: Bearer
   ...`), not by re-signing per request.

**What this does not protect against:** a compromised secret key. Like
any signature scheme, whoever holds the secret key can always
authenticate as that identity — there is no second factor.

---

## 3. Payload Confidentiality: Sealed-Box Encryption Over Pears

**Guarantee: a payload sent peer-to-peer is unreadable by anyone except
the intended recipient, even if the underlying transport's own
encryption is weak, absent, or a future `TransportProvider` (RFC-002)
implementation doesn't provide any.**

`infrastructure/p2p/payload-crypto.ts` — built specifically because
Hyperswarm's own Noise_XX handshake (via `@hyperswarm/secret-stream`,
transitive through `hyperdht`) only encrypts the *wire transport*
between two already-connected peers; nothing encrypted a *payload*
itself before this file existed. This is an explicit application-layer
step, not a redundant one.

Mechanics:

- `PearNode`'s identity keypair is Ed25519 (**signing** curve), but
  `crypto_box_seal` (the sealed-box primitive used) needs a Curve25519
  (**encryption** curve) key. Every public key is converted via
  libsodium's standard, deterministic, lossless
  `crypto_sign_ed25519_*_to_curve25519` birational map before use —
  verified byte-for-byte round-trip against a real generated HyperDHT
  keypair before this file was written (`payloadCrypto.ts`'s own header
  comment; unit-verified for real in `tests/payloadCrypto.test.ts`).
- **Anonymous sealed boxes** (`crypto_box_seal`), not authenticated
  `crypto_box_easy` with a persistent nonce — deliberate: a sealed box
  needs only the recipient's public key to encrypt, matching
  `sendToPeer(targetParticipantId, payload)`'s existing shape (the
  sender already knows who they're sending to; no separate nonce
  management or key announcement needed).
- **Sender authentication of a payload's origin is a different, already
  solved problem** — the Ed25519 keypair that authenticated the
  underlying Hyperswarm connection already tells the recipient who
  they're connected to. This layer's only job is keeping the payload's
  *contents* opaque to anything that isn't that specific peer — not
  proving who sent it (the transport layer already does that) and not
  hiding metadata (who is talking to whom is visible at the DHT layer;
  this is content confidentiality, not traffic analysis resistance).

**What this does not protect against — stated explicitly, per this
document's own discipline:**

- **No forward secrecy.** `crypto_box_seal` uses the recipient's
  long-term identity key directly. If a participant's secret key is
  ever compromised, every sealed-box payload ever sent to them,
  historically, becomes decryptable — there is no per-session ephemeral
  key rotation. A production hardening pass should evaluate whether a
  ratcheting scheme (e.g. Noise-based, similar to Signal's Double
  Ratchet) is warranted once real financial-detail payloads flow
  through this path at scale.
- **No non-repudiation for payload content.** Sealed boxes prove *only*
  that the sender knew the recipient's public key — not who sent it. As
  noted above, sender identity is established at the transport layer,
  not by this encryption step, and that's a deliberate scope split, not
  an oversight — but it means this specific primitive gives you
  confidentiality only, never authenticity of the payload's contents on
  its own.

---

## 4. Integrity: Hash-Chained Event Logs

**Guarantee (where implemented): a past event cannot be silently edited
or deleted without the tamper being detectable.**

Two related but *not identical* things exist under this name — worth
being precise about, since conflating them would misstate what's
actually protected:

### 4.1 `IntentEvent` — real, implemented today

`core/intent-engine.ts`'s `transitionIntent()` computes, for every
state-transition write:

```
entryHash = sha256(fromStatus | toStatus | triggeredBy | prevHash)
```

`prevHash` is the previous `IntentEvent`'s `entryHash` for that same
`intentId` (`'genesis'` for the first). Each hash is computed once, at
write time, and persisted — never recomputed on read, which is what
makes tampering detectable at all (RFC-008's own point: a live-computed
hash on every read would just re-derive an internally-consistent hash
after a rewrite, defeating the purpose).

### 4.2 The general cross-module `Timeline` (RFC-007 D5 / RFC-017) — no hash chain yet

`core/timeline.ts`'s `TimelineEntry` (used by `SocialEngineeringAgent`
and any future consumer needing a cross-module event history keyed by
`correlationId`, not just one Intent) carries `eventId`/`occurredAt`/
`payload` — **no `entryHash`/`prevHash`, no `verifyChain()`.** RFC-008
designed the hash-chain mechanism generally, but only `IntentEvent`
actually has it wired in. Extending it to the general `Timeline` is
real, scoped future work, not done — described here so this document
doesn't imply protection that doesn't exist yet at that layer.

### 4.3 What hash-chaining does and doesn't give you

A hash chain proves *internal consistency* — that entry N's hash
correctly derives from entry N-1's — not that entry N-1 itself was ever
true, and not that the chain hasn't been silently truncated (only the
remaining entries re-verify; a deleted prefix is undetectable from the
chain alone). RFC-008's own D1 (`TimestampAnchor`, third-party-anchored
proof of a hash's existence at a point in time) is the mechanism that
closes the truncation/backdating gap — **that anchoring mechanism is
designed (RFC-008 D1) but not implemented**; no code path calls an
`anchor()` today. Treat the current hash chain as tamper-evidence for
the entries you can see, not as a trustless timestamping guarantee.

---

## 5. What This Document Deliberately Does Not Repeat

- **Who is on the other side of an encrypted channel, and whether
  they're trusted** — `TRUST_BOUNDARY.md`. This document is about what
  the cryptography guarantees; that one is about who's on each side of
  a boundary and what they can lie about regardless of encryption.
- **The attacks these mechanisms mitigate, and which threats remain
  open** — `THREAT_MODEL.md`.
- **Reputation being tied to a keypair, trust limits scaling with
  reputation, dispute resolution** — `SECURITY_MODEL.md`. This document
  only covers the cryptographic primitives those mechanisms are built
  on, not the trust policy built on top of them.
