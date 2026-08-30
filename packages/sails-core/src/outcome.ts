/**
 * Outcome & DestinationBinding.
 *
 * `docs/CORE_ARCHITECTURE.md` §22 and
 * `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §15-16. An Outcome
 * represents authorized economic meaning when — and only when — a
 * Transition actually authorizes one; not every Transition has one.
 * Content stays opaque to generic Core: no `EconomicEffect`, no
 * `relationGroup`, and no richer economic ontology — both were
 * evaluated and explicitly rejected during architecture validation
 * (the "generic policy engine" attack was resolved by the CONDITIONAL
 * fact that K3 only activates for outcome-bearing Transitions, never by
 * giving Core its own economic type system).
 *
 * There is no independent `OutcomeId` — see `identifiers.ts`'s own note
 * for why: identity is derived from the containing Transition Record,
 * since exactly one Outcome exists per Record.
 */

/**
 * The existence and reference of a destination binding must be
 * structurally visible (this type existing as its own field on
 * `Outcome`, distinct from `content`); its internal, rail-specific
 * value may remain fully opaque. This is precisely what closes the
 * "right amount, wrong recipient" failure mode found during Red Team:
 * amount-only correspondence checking inside an undifferentiated opaque
 * blob cannot catch a substituted destination, but a visible,
 * decision-time-bound reference can be independently compared later.
 *
 * Core never learns to parse a Bitcoin address, an IBAN, a Lightning
 * invoice, or an EVM account — `reference` stays opaque to Core; only
 * the responsible Module/correspondence evaluator needs canonical
 * interpretation of whatever shape it contains.
 */
export interface DestinationBinding<TReference = unknown> {
  readonly reference: TReference
}

/**
 * `Outcome<TContent, TDestination>` — content is opaque to Core;
 * `destinationBinding` is optional because not every Outcome has an
 * economically material destination (e.g. a pure state-adjustment
 * outcome with no transfer at all).
 */
export interface Outcome<TContent = unknown, TDestination = unknown> {
  readonly content: TContent
  readonly destinationBinding?: DestinationBinding<TDestination>
}

export function createOutcome<TContent = unknown, TDestination = unknown>(input: {
  readonly content: TContent
  readonly destinationBinding?: DestinationBinding<TDestination>
}): Outcome<TContent, TDestination> {
  return { ...input }
}
