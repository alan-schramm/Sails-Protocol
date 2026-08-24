// tests/capabilityProfile.test.ts
//
// Missão 11 Fase 9.1 §4/§5/§6, made fail-closed by Fase 9.1.1 (CTO
// decision) — direct unit coverage for capability-profile.ts's two pure
// functions. No mocks: both are plain functions with no I/O.
//
// Note on coverage shape: findCapabilityCommitBlocker()'s own
// 'incompatible' branch is, today, UNREACHABLE through the real public
// API — with exactly one known profile (MULTISIG_CAPABILITY_PROFILE_V1)
// mapped to exactly one escrow type (MULTISIG), assertKnownCapabilityProfile()
// already guarantees any value that reaches this function is either
// absent or exactly the one value that's also the requirement, so
// tests/escrowProviderWiring.test.ts's own submitParticipantKey() suite
// cannot exercise a real 'incompatible' (as opposed to 'missing') block.
// Tested directly here instead, so the underlying logic is proven
// correct in isolation ahead of a second profile actually existing
// (Gen-2) — not exercising speculative code, proving already-shipped
// code stays correct once it becomes reachable.

import { MULTISIG_CAPABILITY_PROFILE_V1 } from '@satsails/p2p-schemas'
import { assertKnownCapabilityProfile, findCapabilityCommitBlocker } from '../src/modules/open-settlement/capability-profile'

describe('assertKnownCapabilityProfile() — Missão 11 Fase 9.1 §4/§5', () => {
  it('does not throw when the profile is omitted at submission time (presence is enforced separately, at the commit gate)', () => {
    expect(() => assertKnownCapabilityProfile(undefined)).not.toThrow()
  })

  it('does not throw for the one currently-known profile', () => {
    expect(() => assertKnownCapabilityProfile(MULTISIG_CAPABILITY_PROFILE_V1)).not.toThrow()
  })

  it('throws for an unrecognized declared profile', () => {
    expect(() => assertKnownCapabilityProfile('some-made-up-profile-v7')).toThrow(
      "Unrecognized capability profile 'some-made-up-profile-v7'"
    )
  })

  it('throws for an empty string (present but empty is not the same as omitted)', () => {
    expect(() => assertKnownCapabilityProfile('')).toThrow('Unrecognized capability profile')
  })
})

describe('findCapabilityCommitBlocker() — Missão 11 Fase 9.1.1, fail-closed', () => {
  it('blocks with reason "missing" when the buyer declared nothing at all', () => {
    expect(findCapabilityCommitBlocker('MULTISIG', null, MULTISIG_CAPABILITY_PROFILE_V1))
      .toEqual({ role: 'buyer', reason: 'missing', declared: null })
    expect(findCapabilityCommitBlocker('MULTISIG', undefined, MULTISIG_CAPABILITY_PROFILE_V1))
      .toEqual({ role: 'buyer', reason: 'missing', declared: null })
  })

  it('blocks with reason "missing" when the seller declared nothing, even though the buyer did', () => {
    expect(findCapabilityCommitBlocker('MULTISIG', MULTISIG_CAPABILITY_PROFILE_V1, null))
      .toEqual({ role: 'seller', reason: 'missing', declared: null })
  })

  it('blocks with reason "missing" when NEITHER party declared anything — no grandfathering left', () => {
    expect(findCapabilityCommitBlocker('MULTISIG', null, null)).toEqual({ role: 'buyer', reason: 'missing', declared: null })
    expect(findCapabilityCommitBlocker('MULTISIG', undefined, undefined)).toEqual({ role: 'buyer', reason: 'missing', declared: null })
  })

  it('returns null (commit-ready) only when both parties declare the correct required profile', () => {
    expect(findCapabilityCommitBlocker('MULTISIG', MULTISIG_CAPABILITY_PROFILE_V1, MULTISIG_CAPABILITY_PROFILE_V1)).toBeNull()
  })

  it('returns null for an escrow type with no wired requirement (LIGHTNING_HODL, SAFE_GUARD_EVM today) regardless of what was declared, including nothing', () => {
    expect(findCapabilityCommitBlocker('LIGHTNING_HODL', null, null)).toBeNull()
    expect(findCapabilityCommitBlocker('LIGHTNING_HODL', 'anything-at-all', 'anything-else')).toBeNull()
    expect(findCapabilityCommitBlocker('SAFE_GUARD_EVM', 'anything-at-all', null)).toBeNull()
  })

  it('blocks with reason "incompatible" when the buyer declared a known-but-wrong profile (unit-level proof for when a second profile exists)', () => {
    expect(findCapabilityCommitBlocker('MULTISIG', 'a-different-profile-v2', MULTISIG_CAPABILITY_PROFILE_V1))
      .toEqual({ role: 'buyer', reason: 'incompatible', declared: 'a-different-profile-v2' })
  })

  it('blocks with reason "incompatible" when the seller declared a known-but-wrong profile', () => {
    expect(findCapabilityCommitBlocker('MULTISIG', MULTISIG_CAPABILITY_PROFILE_V1, 'a-different-profile-v2'))
      .toEqual({ role: 'seller', reason: 'incompatible', declared: 'a-different-profile-v2' })
  })

  it('checks the buyer first when both declared different, incompatible profiles', () => {
    expect(findCapabilityCommitBlocker('MULTISIG', 'buyer-profile-x', 'seller-profile-y'))
      .toEqual({ role: 'buyer', reason: 'incompatible', declared: 'buyer-profile-x' })
  })

  it('checks missing before incompatible: an incompatible buyer is flagged even though the seller is also missing', () => {
    // Ensures the buyer-first ordering holds regardless of WHICH kind of
    // blocker each side has — the function scans buyer fully (missing,
    // then incompatible) before ever looking at the seller.
    expect(findCapabilityCommitBlocker('MULTISIG', 'buyer-wrong-profile', null))
      .toEqual({ role: 'buyer', reason: 'incompatible', declared: 'buyer-wrong-profile' })
  })

  it('Satsails-branded or any other participantId receives no special treatment — this function takes no identity input at all', () => {
    // findCapabilityCommitBlocker() has no participantId parameter by
    // design: its signature alone proves no identity-based exception can
    // exist inside it. A brand-neutrality proof at the escrow.service.ts
    // integration level lives in tests/escrowProviderWiring.test.ts.
    expect(findCapabilityCommitBlocker('MULTISIG', null, MULTISIG_CAPABILITY_PROFILE_V1))
      .toEqual({ role: 'buyer', reason: 'missing', declared: null })
  })
})
