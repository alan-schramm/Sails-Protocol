# MULTISIG_TAPROOT_THRESHOLD_RESEARCH.md

## Status

Institutional research obligation. No architecture decision, implementation authorization, or production-readiness claim is made by this document.

Created 2026-09-11 from a CTO/Product discussion about the future Bitcoin escrow model.

## Why this exists

The current Sails `MULTISIG` provider is evidenced in the repository as a real 2-of-3 Bitcoin P2WSH/PSBT implementation. The repository also already records that this mechanism is proven with real BTC but is not, by that fact alone, the definitive future production model.

A future architecture decision is expected around a Taproot-based multisig/threshold construction. The key question is deliberately still OPEN:

> Should the future Taproot escrow use 2-of-2, 2-of-3, or another construction that preserves arbitration/recovery without making Sails a privileged fund-moving co-controller?

This question must not be resolved from implementation convenience alone.

## Required research before the decision

Before freezing any Taproot threshold model, perform an evidence-backed comparative review of at least:

- Peach Bitcoin
- Hodl Hodl
- Bisq

For each system, establish from primary/authoritative sources where possible:

1. escrow construction and script/threshold model;
2. who holds keys;
3. who signs cooperative settlement;
4. who signs disputed settlement;
5. whether the platform/operator is a required signer or can independently participate in fund movement;
6. recovery path and failure modes;
7. arbitration path;
8. whether an arbiter/platform signature is structurally required for ordinary trades or only exceptional paths;
9. custody/control implications of the architecture;
10. publicly documented regulatory treatment, enforcement history, or legal characterization relevant to signer/control roles.

## Regulatory/adversarial question

A project-owner observation raised Peach as a precedent where signer/control architecture may have interacted with regulatory treatment. This is **not recorded here as an established factual conclusion**. It is a research lead that must be verified from reliable sources before it can support a Sails architecture decision.

The governing question is:

> How do we preserve dispute resolution and recovery while minimizing any ability for Sails, a node operator, or an arbitrator to become a necessary co-controller of user funds?

The review must separate:

- technical ability to sign;
- contractual/operational role;
- actual custody/control;
- regulatory interpretation.

Do not infer one from another without evidence.

## Architecture decision criteria

Any future 2-of-2 vs 2-of-3 decision must explicitly compare at least:

- participant sovereignty;
- unilateral/platform control surface;
- dispute resolvability;
- recovery and liveness;
- key loss handling;
- collusion assumptions;
- malicious-arbiter assumptions;
- coordinator compromise;
- censorship resistance;
- UX burden;
- wallet compatibility;
- Taproot privacy/script-path properties;
- production-operability;
- regulatory/control surface.

## Current repository truth to preserve

- Current `MULTISIG` implementation: 2-of-3 Bitcoin P2WSH/PSBT.
- It has real mainnet proof, but that proof does not freeze the model as the final production architecture.
- Client-held buyer/seller keys and the current arbiter role are implementation facts, not a permanent Product Direction decision.
- A future Taproot threshold choice remains OPEN until a dedicated architecture mission is completed.

## Institutional classification

Category: Architecture research / OpenSettlement / Bitcoin escrow / regulatory-adversarial review.

Priority: before final production freeze of the Bitcoin escrow model; not a blocker for unrelated Day-0 work until that decision becomes execution-critical.

Disposition:

- BACKLOG DELTA DETECTED
- RESEARCH FIRST
- NO IMPLEMENTATION AUTHORIZED
- NO 2-of-2 OR 2-of-3 DECISION FROZEN

## Required future output

The dedicated mission must return:

1. verified Peach model and regulatory precedent;
2. verified Hodl Hodl model;
3. verified Bisq model;
4. comparison matrix;
5. 2-of-2 candidate architecture;
6. 2-of-3 candidate architecture;
7. other viable constructions if evidence warrants;
8. attack analysis;
9. recovery analysis;
10. regulatory/control analysis;
11. recommendation;
12. CTO Gate before any implementation.

DO NOT DUPLICATE. DO NOT LOSE. DO NOT INFLATE. DO NOT HIDE.
