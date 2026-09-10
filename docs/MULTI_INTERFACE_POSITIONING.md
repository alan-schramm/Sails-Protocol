# Sails Protocol — Multi-Interface Positioning

**Type:** Positioning / Product Architecture / Institutional Draft  
**Status:** Working positioning material for later consolidation into canonical public docs  
**Purpose:** Explain why Sails intentionally spans UI, SDK, API, CLI, MCP/WebMCP and agent interfaces without becoming multiple products or multiple protocol meanings.

---

## Core Positioning

Sails Protocol is open infrastructure for building interoperable P2P Financial Marketplaces.

Its ambition is not limited to one kind of user interface.

The same economic coordination layer should be usable by:

- a basic user who only sees a wallet interface;
- an advanced user who wants more control and visibility;
- a developer integrating through an SDK;
- an operator using an API or CLI;
- an AI agent interacting through MCP, WebMCP or another machine-oriented interface.

The interface depth changes.

The protocol meaning does not.

> **Multiple interfaces, one economic reality.**

> **The user should choose the interface depth, not a different protocol meaning.**

---

## The Operating-System Product Analogy

Sails is not an operating system in the technical sense.

The useful analogy is product architecture.

Modern operating systems such as Android, iOS and Windows hide enormous internal complexity while supporting very different levels of user sophistication.

A basic user can operate the system without understanding processes, permissions, kernels, networking or storage internals.

A more advanced user can access deeper settings and automation.

A developer can use frameworks and APIs.

A power user can work through terminal and scripting interfaces.

All of them are interacting with the same underlying system.

Sails should pursue a similar product property for economic coordination:

> **increasing interface power without multiplying protocol semantics.**

The analogy stops there. Sails remains an open coordination infrastructure, not a general-purpose OS and not a mandatory runtime for users or developers.

---

## Progressive Interface Depth

Conceptually:

```text
Basic User
    ↓
Wallet / Partner UI
Web · Mobile · Desktop
    ↓
Reference UI
    ↓
SDK
    ↓
API
    ↓
CLI
    ↓
MCP / WebMCP / Agents
    ↓
Sails Protocol Semantics
```

This is not an authority hierarchy.

It is a progressive interface model.

The GUI is not more authoritative than the CLI.

The CLI is not more authoritative than the SDK.

An AI agent is not more authoritative than a human caller.

All interfaces must remain constrained by the same underlying authority, state, settlement and evidence semantics.

---

## Product Principle

> **Sails should expose increasing power through progressive interfaces, not increasing semantic complexity.**

The basic user should not need to understand:

- transport identity;
- gossip;
- settlement adapters;
- provider maturity;
- signed Offer facts;
- protocol state machinery.

The developer and operator should be able to inspect and control deeper layers where needed.

The system should reveal complexity progressively instead of forcing every user to understand the architecture.

> **Progressive disclosure of complexity. Constant sovereignty.**

---

## Why UI Is Part of the Strategy

The Sails Reference UI is not merely a visual demo.

It is executable integration guidance.

Its purpose is to demonstrate how a real product can be constructed on top of the public SDK and protocol contracts, and to accelerate independent implementations for web, mobile and desktop.

The protocol should increasingly disappear from the end user's mental model while remaining inspectable to developers and advanced users.

This gives Sails two simultaneous properties:

1. **centralized-grade product experience**;
2. **individual-grade sovereignty and open integration**.

The first must never be purchased by sacrificing the second.

---

## Why SDK Is Part of the Strategy

The SDK is the primary developer ergonomics surface.

It should let a wallet or application integrate the economic coordination capabilities of Sails without reconstructing marketplace, lifecycle, identity, reputation, settlement coordination and related behavior from scratch.

The desired developer experience is:

> **Keep your wallet stack. Plug into Sails.**

The SDK simplifies access to protocol capabilities. It must not become protocol authority.

---

## Why CLI Is Part of the Strategy

CLI support serves developers, operators, power users, automation and debugging.

It should expose the same economic concepts available through SDK/API surfaces, with stronger inspection and composition ergonomics.

A CLI must not create a parallel set of semantics or privileged economic actions merely because it is a lower-level interface.

A well-designed CLI also improves reproducibility, conformance testing, operator workflows and AI-assisted engineering.

---

## Why MCP / WebMCP / Agents Are Part of the Strategy

Machine interfaces allow AI agents and automation systems to interact with Sails through explicit, structured capabilities.

This should not mean giving AI more authority.

The desired model is:

```text
Human or Agent
      ↓
Structured Interface
      ↓
Same Sails capabilities
      ↓
Same authority rules
      ↓
Same economic semantics
```

> **Interface sophistication must not imply authority escalation.**

An agent may discover, inspect, propose, negotiate or execute only within the authority explicitly granted by the user and protocol.

---

## One System, Different Users

The product vision should accommodate at least three interaction classes without fragmenting the architecture:

### Basic user

Uses a wallet/app and completes financial interactions without needing protocol knowledge.

### Integrator / advanced user

Uses richer product controls, SDKs, APIs, dashboards or automation.

### Developer / operator / agent

Uses CLI, machine interfaces, MCP/WebMCP, programmatic workflows, observability and deeper protocol capabilities.

These are not three different Sails products.

They are three levels of access to one economic coordination system.

---

## Strategic Differentiation

Many financial protocols expose infrastructure and leave product integration almost entirely to downstream developers.

Many applications provide excellent UX but keep the underlying economic network closed inside the application.

Sails aims to combine the two properties:

> **open infrastructure underneath, coherent product experience above.**

The network should remain open across wallets, nodes, providers and interfaces while allowing each application to present a polished user experience.

> **Different interfaces. Shared economic meaning.**

> **Different stacks. Shared economic meaning.**

---

## Positioning Summary

Sails should eventually be understandable differently depending on who is looking at it:

For an end user:

> **A financial experience that simply works without requiring protocol knowledge.**

For a wallet or app developer:

> **Open infrastructure for turning a wallet into an interoperable P2P Financial Marketplace.**

For an advanced operator:

> **A programmable economic coordination layer accessible through SDK, API and CLI.**

For an AI system:

> **A structured capability surface where agents can participate without becoming protocol authority.**

All four descriptions must resolve to the same underlying protocol truth.

---

## Canonical Principles to Reconcile Into Future Public Material

> **Multiple interfaces, one economic reality.**

> **The user should choose the interface depth, not a different protocol meaning.**

> **Sails should expose increasing power through progressive interfaces, not increasing semantic complexity.**

> **Progressive disclosure of complexity. Constant sovereignty.**

> **Interface sophistication must not imply authority escalation.**

These statements are positioning and product-architecture guidance. They do not expand Day-0 implementation scope by themselves. Each interface remains subject to roadmap sequencing, evidence and production-readiness gates.
