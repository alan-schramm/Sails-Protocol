/**
 * Sails OpenIdentity — Reference Implementation
 *
 * The module TODO.md §1 flagged as entirely missing. Challenge issuance
 * and signature verification already existed in
 * `common/middleware/auth.ts` (RT-002's fix) — that file owns the
 * Ed25519 challenge-response mechanics. This service owns the one thing
 * that was still missing: turning a public key into a registered
 * `Participant` (a `User` row) in the first place, which
 * `verifySignedChallenge` already assumes exists (`prisma.user.findUnique`).
 */
import { prisma } from '../../common/database'
import { NotFoundError, ValidationError } from '../../common/errors'

export interface RegisterParticipantInput {
  publicKey: string
  displayName?: string
}

// Missão 11 Fase 9.3.5 — INV-OP-10 (Public Verification Surfaces
// Disclose the Minimum Necessary Fact, Never the Underlying Row —
// docs/PROTOCOL_INVARIANTS.md). The ONLY shape ever returned to the
// unauthenticated GET route (/v1/identity/participants/:id) — a lookup
// by ANY caller for ANY participant, unlike `/v1/identity/me`'s
// authenticated, self-referential full row (that one stays a raw
// `User`, correctly — the only recipient is the person it's already
// about). What's kept: `id` (this IS the participantId being looked
// up, not a separate internal row id — it's the literal subject of the
// lookup), `publicKey` (the participant's real cryptographic identity —
// other participants verify signatures/commitments against it),
// `peerId` (their P2P transport identity — required for HyperDHT/Pears
// discovery, the whole point of a peer-to-peer connection), `displayName`
// (public-facing, user-chosen for exactly this purpose), `verified`
// (an identity-verification status fact, distinct from reputation).
// What's deliberately excluded: `reputationScore`/`totalTrades`/
// `disputeCount`/`totalVolumeBtc` — real, legitimately public data, but
// its canonical home is the dedicated `GET /v1/reputation/:participantId`
// route (`reputationService.getScore()`), not this one; duplicating it
// here would be scope creep for an identity-lookup endpoint, not a
// disclosure decision. `moduleId`/`protocolVersion`/`createdAt`/
// `updatedAt` — operator-internal bookkeeping, zero identity-
// verification value.
export interface PublicParticipantIdentity {
  id: string
  publicKey: string
  displayName: string | null
  peerId: string | null
  verified: boolean
}

export class IdentityService {
  async register(input: RegisterParticipantInput) {
    const existing = await prisma.user.findUnique({ where: { publicKey: input.publicKey } })
    if (existing) {
      throw new ValidationError(`A participant is already registered for this public key`)
    }

    return prisma.user.create({
      data: {
        publicKey: input.publicKey,
        displayName: input.displayName,
      },
    })
  }

  async getParticipant(participantId: string) {
    const user = await prisma.user.findUnique({ where: { id: participantId } })
    if (!user) throw new NotFoundError('Participant', participantId)
    return user
  }

  /**
   * Missão 11 Fase 9.3.5 — the ONLY method the unauthenticated
   * GET /v1/identity/participants/:id route may call. See
   * PublicParticipantIdentity's own comment for exactly which fields
   * are/aren't here.
   */
  async getPublicView(participantId: string): Promise<PublicParticipantIdentity> {
    const user = await this.getParticipant(participantId)
    return {
      id: user.id,
      publicKey: user.publicKey,
      displayName: user.displayName,
      peerId: user.peerId,
      verified: user.verified,
    }
  }
}

export const identityService = new IdentityService()
