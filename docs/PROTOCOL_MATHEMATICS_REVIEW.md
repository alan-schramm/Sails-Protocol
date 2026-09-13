# Sails Protocol Mathematics Review

**Type:** Institutional Memory / Evidence Obligation / Architecture Quality Review  
**Status:** Review task only. No implementation is authorized by this document.  
**Purpose:** Create a dedicated review track for the mathematical consistency of Sails Protocol wherever protocol meaning, economic outcomes, scoring, pricing, fees, probabilities, thresholds, timing, allocation, ranking, incentives or numeric representation depend on formulas.

## Why this exists

A protocol can be logically well-structured and still fail because its mathematics is inconsistent, numerically unstable, economically exploitable, dimensionally incoherent, implementation-dependent or represented incorrectly in the product.

This review exists to confront that class of risk explicitly.

> **Working code ≠ correct mathematics.**

> **Correct arithmetic ≠ correct economic model.**

> **Equivalent-looking formulas ≠ equivalent semantics.**

> **Numeric representation is part of protocol correctness when different implementations must agree.**

## Scope

The review should identify every place where Sails relies on quantitative semantics, including but not limited to:

- price and quote calculations;
- amount bounds and conversions;
- decimal precision and rounding;
- fees and fee allocation;
- reputation scoring and normalization;
- dispute-rate calculations;
- thresholds and eligibility rules;
- liquidity ranking and matching;
- contribution accounting and economic entitlement;
- incentive compatibility / no-cannibalization models;
- arbitration economics;
- time, expiry and timeout arithmetic;
- retries and probabilistic assumptions;
- rate limits, resource bounds and amplification ratios;
- settlement amounts and split calculations;
- multi-asset / multi-rail conversions;
- metrics presented to users when UI meaning differs from internal score meaning;
- any formula encoded differently across TypeScript, Rust, Go, SDKs or reference UIs.

## Review questions

For each quantitative rule ask:

1. What exact property is the formula meant to represent?
2. Are units/dimensions explicit and compatible?
3. Is decimal precision bounded and deterministic?
4. Can floating-point behavior change protocol meaning?
5. Is rounding defined once and at the correct boundary?
6. Are mathematically equivalent transformations actually semantically equivalent after rounding/clamping?
7. Can two conformant implementations produce different results from the same authoritative inputs?
8. Are zero, negative, maximum, overflow, underflow and boundary values defined?
9. Are ratios and percentages bounded where the UI or API implies a bounded scale?
10. Can a score grow beyond a range the UI presents as fixed?
11. Can an attacker manipulate the formula through Sybil behavior, wash trading, fragmentation, timing, replay, selective participation or threshold gaming?
12. Does the formula create perverse incentives?
13. Is the result advisory, local policy or protocol-authoritative?
14. Is a heuristic being presented as an objective truth?
15. Are claims broader than the mathematics actually supports?

## Required evidence style

The review should not rely only on code inspection. Use, where justified:

- algebraic derivation;
- boundary-value tests;
- property-based testing;
- fuzzing;
- invariant tests;
- simulations;
- cross-language vectors;
- adversarial economic scenarios;
- dimensional analysis;
- independent calculation/reference scripts;
- historical production examples where analogous failures are relevant.

## Classification

Each finding must be classified as one of:

- already correct and evidenced;
- correct but under-evidenced;
- implementation defect;
- mathematical/semantic defect;
- UI representation defect;
- economic incentive defect;
- interoperability/conformance risk;
- technical debt;
- Partner Beta blocker;
- Production Readiness requirement;
- future hardening;
- not applicable.

## Important boundaries

This review does **not** authorize a universal math engine, new scoring framework, token model, formal-methods stack, simulation platform or dependency.

> **Mathematical review ≠ mathematical overengineering.**

Use the smallest technique that can establish the property honestly.

## Proposed institutional task

Before Production Readiness is declared, perform a dedicated **Sails Protocol Mathematics & Economic Semantics Review** across all Day-0 value-moving, scoring, matching, fee, reputation and incentive mechanisms.

For Day-0 critical formulas, require evidence that:

> **Same authoritative inputs + same protocol version → same quantitative result within explicitly defined numeric semantics.**

Any formula affecting irreversible economic action, settlement, authority, entitlement or reputation must have explicit boundary behavior and adversarial evidence appropriate to its blast radius.
