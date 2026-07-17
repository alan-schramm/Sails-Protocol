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
}

export const identityService = new IdentityService()
