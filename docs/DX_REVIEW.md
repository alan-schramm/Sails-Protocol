# DX Review — Sails P2P Trading SDK

Date: 2026-07-29
Scope: developer experience for a completely new integrator trying to use the SDK from an empty wallet.

## Executive summary

The repository already contains a real SDK and a real reference implementation, but the experience for a first-time external developer still feels like a guided internal walkthrough rather than a polished public package.

If I cloned this repository as a stranger and tried to integrate the SDK into an empty wallet, I would not struggle with the core concepts alone. I would struggle with discoverability, onboarding friction, ambiguous guidance, and the gap between “the code exists” and “the path is obvious.”

The biggest DX problem is not architecture. It is that the project is still asking the integrator to reconstruct the journey from scattered docs, examples, comments, and implementation details.

## The mental model I would try to build as a new developer

I would expect the following path:

1. Install the package.
2. Point it at a running Sails node.
3. Create an identity and authenticate.
4. Publish or discover an offer.
5. Open a trade.
6. Exchange chat messages.
7. Create/lock/complete an escrow.

That is a reasonable first integration journey. The current repository can support it, but the path is not yet obvious enough for a clean first try.

## Where a new developer would struggle

### 1) The entry point is not obvious enough

Pain point:
- The repository root is a full protocol implementation, not a simple SDK consumer experience.
- The public package is described as @satsails/p2p-trading-sdk, but the moment a developer opens the repo they are inside a monorepo with backend, UI, examples, and infrastructure all mixed together.
- The README is strong for a technical reader, but it still assumes prior context about protocol modules, wallets, and reference implementation terminology.

Why it hurts:
- A first-time integrator has to decide whether to read the protocol docs, the SDK guide, the API reference, or the example wallet first.
- That decision cost is real. It slows onboarding and creates doubt before the first line of code is written.

Suggested improvement:
- Add a short “Quick Start for Wallet Integrators” section at the top of [README.md](README.md) and [packages/sails-sdk/package.json](packages/sails-sdk/package.json).
- Put a copy-paste example near the top, before the architecture explanation.

### 2) The docs are distributed and partially overlapping

Pain point:
- The onboarding experience is spread across [README.md](README.md), [docs/SDK_GUIDE.md](docs/SDK_GUIDE.md), [docs/API_STABLE.md](docs/API_STABLE.md), [docs/DEVELOPER_JOURNEY.md](docs/DEVELOPER_JOURNEY.md), and the example under [examples/simple-wallet](examples/simple-wallet).
- Some docs explicitly say they are illustrative, while others are presented as the source of truth.

Why it hurts:
- A newcomer cannot easily tell which document is the authoritative path.
- The repo already contains “audit finding” commentary that points to drift and corrections, which is valuable for maintainers but not for a new user.

Suggested improvement:
- Create one canonical “Getting Started” guide for external developers.
- Make it the first document linked from the package README and the example README.
- Clearly mark one source of truth for the public contract and keep it short.

### 3) The package README is too implementation-heavy and not consumer-friendly

Pain point:
- The SDK package itself is documented mainly through the repo-level docs, while the actual public consumer experience is hidden behind a monorepo structure.
- A fresh integrator would likely look for a simple “how do I create a client and authenticate?” example before reading the architecture section.

Why it hurts:
- The SDK feels less like a product and more like an internal engineering artifact.

Suggested improvement:
- Add a minimal “first 20 lines” example to the SDK package docs:
  - create a client
  - authenticate
  - call one public method
- Keep the example in the package README, not only in the repo example.

### 4) The example is useful, but it is not yet a smooth first-contact experience

Pain point:
- The example in [examples/simple-wallet/src/index.ts](examples/simple-wallet/src/index.ts) is valuable, but it is still long and tied to local infrastructure assumptions.
- It includes a deliberate workaround for offer discovery and uses a low price to make the example work against a local data set.

Why it hurts:
- A new developer sees a “works on my machine” pattern rather than a clean, stable first use case.
- The example teaches the right flow, but it also teaches hidden caveats that are not obvious unless the reader already understands the backend state.

Suggested improvement:
- Split the example into two tiers:
  - “Minimal happy path” for first-time developers
  - “Full reference flow” for deeper exploration
- Add a note in the example README explaining that the local environment may need a few seeded offers to make discovery behave predictably.

### 5) Authentication and session lifecycle are present, but not obvious enough

Pain point:
- The SDK has a clear identity flow, but a first-time user still has to discover that they must create a participant, authenticate, and then keep the session token alive across calls.
- The current API is reasonable, but the developer experience around “what must happen first” is implicit.

Why it hurts:
- A fresh integrator is likely to hit a confusing auth failure before understanding that they need to authenticate first.

Suggested improvement:
- Provide a tiny onboarding snippet that shows authentication as a required first step.
- Add a short convenience pattern such as “client.auth.ready()” or “client.ensureAuthenticated()” if the package wants to soften this path without changing architecture.

### 6) The trade/escrow flow is conceptually rich, but the user-facing path is not yet guided

Pain point:
- The SDK supports the full flow from offer to escrow, but the conceptual sequence is not obvious from the public API alone.
- The user must learn that there is a distinction between identity, liquidity, openp2p, chat, and settlement, and that some flows are asynchronous and event-driven.

Why it hurts:
- The SDK is powerful, but the first integration still feels like a protocol exercise rather than a product API.

Suggested improvement:
- Provide a “common workflow” checklist in the docs:
  - create participant
  - authenticate
  - publish offer
  - discover offer
  - open trade
  - start chat
  - create escrow
  - lock funds
  - mark payment
  - release funds
- This can be a documentation-only improvement and would significantly reduce friction.

### 7) Errors are technically informative, but not developer-friendly enough

Pain point:
- The transport layer and service layer already throw structured errors, but a new integrator still needs to infer what failed from a low-level message.
- Some error paths are likely to feel like protocol internals rather than actionable guidance.

Why it hurts:
- When something fails, the integrator has to debug the backend and the SDK at the same time.

Suggested improvement:
- Standardize error messages around a small set of actionable patterns:
  - auth required
  - network issue
  - invalid state transition
  - not found
  - unsupported provider/address format
- Add a short error-handling example in the docs.

### 8) The SDK has a lot of power, but the discoverability of the public surface is still uneven

Pain point:
- The package exports many useful types, but it is still not obvious which methods are intended for first-time use and which are advanced or experimental.
- The docs already hint that some methods are “advanced/direct use,” but a new developer would still need to infer that from comments and examples.

Why it hurts:
- It feels like the SDK is capable, but not yet “guided for first use.”

Suggested improvement:
- Add a simple “Recommended first calls” section in the package docs:
  - identity.create
  - identity.authenticate
  - liquidity.publish
  - liquidity.discover
  - openp2p.trade
  - openp2p.chat
  - settlement.create
  - settlement.lock
- This is purely an ergonomics improvement, not an API redesign.

### 9) Provider-specific requirements are still too easy to hit by surprise

Pain point:
- The release path in the UI and example uses different address expectations depending on the escrow provider.
- A new integrator would have to understand those nuances before successfully completing a real settlement flow.

Why it hurts:
- The SDK can feel inconsistent because the “happy path” is partly dependent on the provider chosen and the environment.

Suggested improvement:
- Add provider-specific guidance in the docs for the supported settlement flows.
- Clearly separate “demo mode” from “real deployment mode.”

## What would make the biggest improvement quickly

The highest-impact DX improvements would be these, in order:

1. A short public quick-start for wallet integrators
2. One canonical getting-started guide with a single path from install to first trade
3. A minimal copy-paste example in the package README
4. Clearer error guidance and state-transition guidance
5. A simple “common workflow” checklist for the main happy path

These are all documentation and ergonomics improvements. They do not require changing the architecture.

## Recommended DX principles for the next iteration

- Make the first integration path obvious in under 2 minutes.
- Keep one happy path and one advanced path, not five competing mental models.
- Prefer explicit examples over implicit knowledge.
- Treat “I can’t tell what to do next” as a product issue, not a documentation issue.
- Make the package feel like a product that someone can adopt, not just a protocol implementation that someone can inspect.

## Bottom line

The SDK is already better than a prototype. The main DX gap is that the project still assumes the developer has already been brought inside the repository’s thinking.

For a public release, the next step should be to make the first 30 minutes of integration feel obvious, guided, and low-friction.
