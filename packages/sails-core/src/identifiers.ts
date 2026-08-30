/**
 * Branded (nominal) identifier types.
 *
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §13 requires that
 * identifiers crossing the Core boundary never be raw local database
 * IDs — an `InteractionId` and a `RulesetVersion` string must never be
 * accidentally interchangeable just because both happen to be plain
 * `string`s. TypeScript has no native nominal-typing feature, so this
 * file uses the standard "branded type" technique: a plain value
 * carrying a compile-time-only phantom tag that TypeScript's structural
 * checker treats as a distinct type.
 *
 * This is explicitly a TypeScript-specific *technique*, not a
 * TypeScript-specific *semantic*: the property that must survive in a
 * Rust or Go implementation is nominal distinctness between identifier
 * kinds (Rust's newtype pattern, Go's defined string types), never this
 * exact brand mechanism. Nothing about branding is encoded into any
 * wire or canonical representation — a branded value is, at runtime,
 * indistinguishable from its underlying primitive.
 */

declare const brand: unique symbol

/** A nominal wrapper around `T`, distinguished at compile time by `B`. */
export type Brand<T, B extends string> = T & { readonly [brand]: B }

function createBrandedString<B extends string>(value: string): Brand<string, B> {
  if (value.length === 0) {
    throw new Error('identifier value must not be empty')
  }
  return value as Brand<string, B>
}

export type InteractionId = Brand<string, 'InteractionId'>
export const createInteractionId = (value: string): InteractionId => createBrandedString(value)

/**
 * A discretionary actor's stable reference (K2 scope only). Distinct
 * from `SourceRef` below: every `ActorRef` may act as an Assertion
 * source, but not every Assertion source is a K2 discretionary actor
 * (a system observation or an oracle feed is a legitimate source with
 * no discretionary authority at all).
 */
export type ActorId = Brand<string, 'ActorId'>
export const createActorId = (value: string): ActorId => createBrandedString(value)

/**
 * The stable identity of whatever asserted something — human, agent,
 * provider, oracle, or the protocol/Runtime itself (`system`, per
 * `CORE_ARCHITECTURE.md` §19's explicit non-human-source allowance).
 * Deliberately just an identity, not a closed source-*kind* taxonomy —
 * Core never branches behavior on kind (Phase 2 of the Implementation
 * Architecture program found kind carries no Core-level semantic
 * weight); kind, where a Module wants to record it, is opaque metadata
 * carried in the Assertion's own content, never a Core-validated field.
 */
export type SourceRef = Brand<string, 'SourceRef'>
export const createSourceRef = (value: string): SourceRef => createBrandedString(value)

export type AssertionId = Brand<string, 'AssertionId'>
export const createAssertionId = (value: string): AssertionId => createBrandedString(value)

export type TransitionTypeId = Brand<string, 'TransitionTypeId'>
export const createTransitionTypeId = (value: string): TransitionTypeId => createBrandedString(value)

/**
 * Note: there is deliberately no `OutcomeId`. An Outcome only ever
 * exists as the conditional content of one Transition Record, and its
 * identity is derived from that Record's own identity — introducing an
 * independent identifier namespace for Outcome was attacked and
 * rejected during Core Implementation Architecture validation as
 * redundant (see `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §15).
 */
