/**
 * Canonical MULTISIG client-capability vocabulary — Missão 11 Fase 9.1 §4/§5.
 *
 * Phase 9.0's audit found that `submitParticipantKey()` accepts a bare
 * pubkey from any client claiming to be the buyer/seller of a MULTISIG
 * escrow, with no way to know whether that client's own software actually
 * implements the full flow a MULTISIG participant needs: local P2WSH
 * script re-derivation, PSBT semantic verification, cooperative signing,
 * and reacting correctly to every real lifecycle branch (release, refund,
 * split, dispute, EXPIRED, expiry recovery). A wallet that merely holds a
 * keypair but never implements this flow would silently join a MULTISIG
 * escrow it cannot actually operate — not a signing-key problem, a
 * software-capability problem, and one no key format check can catch.
 *
 * `MULTISIG_CAPABILITY_PROFILE_V1` is the single, atomic identifier for
 * "this client implements the full Gen-1 Sails MULTISIG reference flow" —
 * exactly the bundle `@satsails/p2p-trading-sdk`'s own
 * `escrow-key-derivation.ts` + `wallet-verification.ts` + `settlement.ts`
 * modules already implement:
 *   - network-aware P2WSH script derivation matching the server's own
 *     construction bit-for-bit (`deriveExpectedMultisigAddress()`)
 *   - PSBT semantic verification independent of server claims
 *     (`verifySigningIntent()`)
 *   - cooperative signing (`verifyAndSignEscrowPsbt()`)
 *   - fee-aware release/split output reconstruction
 *     (`buildExpectedFeeAwareReleaseOutputs()`)
 *   - refund/dispute/EXPIRED/expiry-recovery awareness (the escrow
 *     lifecycle transitions a MULTISIG participant must be able to react
 *     to, not a signing primitive of their own)
 *
 * Deliberately a single flat string, not a decomposed capability list —
 * Gen-1 has exactly one MULTISIG implementation shape (no Taproot,
 * no MuSig2, no alternate script types yet), so decomposing it further
 * would be speculative structure for capabilities that don't exist. The
 * `_V1` suffix is what stays extensible: a genuinely different Gen-2
 * MULTISIG shape gets its own new profile string here, never a mutation
 * of this one's meaning.
 */

export const MULTISIG_CAPABILITY_PROFILE_V1 = 'multisig-p2wsh-psbt-v1' as const

export type CapabilityProfile = typeof MULTISIG_CAPABILITY_PROFILE_V1

const SUPPORTED_CAPABILITY_PROFILES: ReadonlySet<string> = new Set<string>([MULTISIG_CAPABILITY_PROFILE_V1])

/** True only for a profile string this protocol version actually knows
 *  about — an unrecognized string (typo, a future profile this server
 *  predates, a client that invented its own label) is never treated as
 *  compatible with anything, per this phase's own "unknown capability =
 *  unsupported" rule. */
export function isKnownCapabilityProfile(profile: string): profile is CapabilityProfile {
  return SUPPORTED_CAPABILITY_PROFILES.has(profile)
}
