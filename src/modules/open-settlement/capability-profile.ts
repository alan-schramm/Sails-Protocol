/**
 * Escrow-type -> required client capability profile — Missão 11 Fase
 * 9.1 §4/§5/§6, made fail-closed by Fase 9.1.1 (CTO decision).
 *
 * The canonical profile STRING itself (`MULTISIG_CAPABILITY_PROFILE_V1`)
 * and what "known" means live in `@satsails/p2p-schemas` — the shared
 * vocabulary both server and SDK import, same precedent
 * `bitcoin-network.ts` (Fase 8.1) already established: never two
 * independently-written copies of the same classification that could
 * silently drift. This file only adds the one thing that's genuinely
 * server-specific: WHICH escrow types require a profile at all, and the
 * gate function `submitParticipantKey()` calls before it will derive and
 * persist a MULTISIG deposit address.
 *
 * §6 finding, disclosed here rather than silently acted on: `moduleId`/
 * `protocolVersion` (present on nearly every Prisma model, mandated by
 * MASTER_COORDINATION.md) are per-ROW PROVENANCE fields — "which Sails
 * module/protocol version created this entity" — with no real read-side
 * enforcement anywhere (grepped: every occurrence is a column default,
 * never a WHERE clause or a check). They answer a different question
 * than "does this wallet implement the MULTISIG flow" and reusing them
 * for that would be a category error, not a simplification — hence a
 * genuinely new, purpose-built field (`EscrowParticipantKey.capabilityProfile`)
 * rather than repurposing either of those two.
 *
 * **Fase 9.1.1 CTO decision (2026-08-24), supersedes Fase 9.1's own
 * grandfathering choice:** the original phase treated an OMITTED
 * `capabilityProfile` as backward-compatible/compatible-by-default,
 * reasoning there was no production compatibility obligation yet to
 * protect. The CTO rejected that as the final protocol behavior —
 * "unknown capability = unsupported" must include the omitted case, not
 * only an explicitly-wrong one, with no exception for backward
 * compatibility, no exception for a Satsails-branded caller, no brand
 * of any kind. For real MULTISIG commitment: every required participant
 * must declare a profile, it must be a known profile, and it must be
 * compatible — before the deposit address is derived. There is no
 * silent-pass path left for this escrow type.
 */
import type { EscrowType } from '../../common/types/trade'
import { EscrowError } from '../../common/errors'
import { MULTISIG_CAPABILITY_PROFILE_V1, isKnownCapabilityProfile } from '@satsails/p2p-schemas'

export { MULTISIG_CAPABILITY_PROFILE_V1, isKnownCapabilityProfile }

// Only MULTISIG has a required profile today — LIGHTNING_HODL/SAFE_GUARD_EVM
// are deliberately left unlisted (no capability-declaration story wired
// for them this phase; the shared `submitParticipantKey()` path they also
// go through simply skips the check for any type absent here — see
// findCapabilityCommitBlocker()'s own `!required` early return). Extending
// this map, not the check logic itself, is how a future rail (Taproot,
// Lightning, EVM) would add its own requirement — deliberately not done
// here, per this phase's own "no future-profile implementation" boundary.
const REQUIRED_CAPABILITY_PROFILE: Partial<Record<EscrowType, string>> = {
  MULTISIG: MULTISIG_CAPABILITY_PROFILE_V1,
}

/** Throws if `profile` is a non-empty string the server doesn't recognize.
 *  Called at submission time, independent of escrow type — a garbage
 *  declaration is rejected immediately, not silently stored and only
 *  discovered later at the commit gate. Does NOT decide whether an
 *  OMITTED profile is acceptable — that's escrow-type-dependent
 *  (findCapabilityCommitBlocker()'s own job, checked at the commit
 *  gate) — this function only ever validates a value that was actually
 *  provided. */
export function assertKnownCapabilityProfile(profile: string | undefined): void {
  if (profile === undefined) return // nothing to validate yet — commit-gate enforces presence where required
  if (!isKnownCapabilityProfile(profile)) {
    throw new EscrowError(
      `Unrecognized capability profile '${profile}'. Known profiles: ${MULTISIG_CAPABILITY_PROFILE_V1}.`
    )
  }
}

/** The real "trade must not commit to MULTISIG unless every required
 *  participant has a compatible profile" gate (§4, fail-closed per Fase
 *  9.1.1) — called for BOTH keys once both exist, immediately before
 *  deriving/persisting the deposit address (`submitParticipantKey()`'s
 *  own `!escrow.multisigAddr` branch). Returns the blocking role and why
 *  (`'missing'` — no declaration at all, or `'incompatible'` — declared
 *  something other than what's required; an unknown-string declaration
 *  never reaches this function at all, since `assertKnownCapabilityProfile()`
 *  already rejected it at submission time), or `null` only when this
 *  escrow type has no requirement wired (LIGHTNING_HODL/SAFE_GUARD_EVM/
 *  MOCK today) or both participants are genuinely compatible. No
 *  identity-based exception exists anywhere in this function — every
 *  `participantId`, Satsails-operated or not, is checked identically. */
export function findCapabilityCommitBlocker(
  escrowType: EscrowType,
  buyerProfile: string | null | undefined,
  sellerProfile: string | null | undefined
): { role: 'buyer' | 'seller'; reason: 'missing' | 'incompatible'; declared: string | null } | null {
  const required = REQUIRED_CAPABILITY_PROFILE[escrowType]
  if (!required) return null // no requirement wired for this escrow type yet

  if (!buyerProfile) return { role: 'buyer', reason: 'missing', declared: null }
  if (buyerProfile !== required) return { role: 'buyer', reason: 'incompatible', declared: buyerProfile }
  if (!sellerProfile) return { role: 'seller', reason: 'missing', declared: null }
  if (sellerProfile !== required) return { role: 'seller', reason: 'incompatible', declared: sellerProfile }
  return null
}
