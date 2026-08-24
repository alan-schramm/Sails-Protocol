/**
 * CustodyAttestationService — Missão 11 Fase 7.3.2 §3.
 *
 * The one required "auditable mapping" read surface: given an escrow,
 * cross-reference its own FROZEN, real collection destination
 * (Escrow.snapshotFeeCollectionAddress — what actually happened) against
 * the custody attestation that was ACTIVE, at the exact historical
 * instant, for each recipient entitled to that collection generation
 * (Escrow.distributionPolicyFreezes, Fase 7.2 §L — what policy governed
 * it, and now, what the operator attested about where that recipient's
 * funds live).
 *
 * Deliberately a cross-reference for a human/auditor to read, never an
 * automated cryptographic match: a descriptor's shape is rail-specific
 * and never guaranteed to contain anything this service could compare
 * byte-for-byte against snapshotFeeCollectionAddress (which is itself
 * only ever a real thing for BTC/MULTISIG escrows). This is the honest
 * boundary the CTO's own design brief drew between ATTESTED ASSOCIATION
 * and CRYPTOGRAPHIC PROOF OF CONTROL — this service produces the former,
 * clearly labeled, never claims the latter.
 */
import { escrowService } from './escrow.service'
import { custodyAttestationRepository, type CustodyAttestationRepository } from './custody-attestation-repository'

export interface EscrowCustodyCrossReferenceRecipient {
  recipientId: string
  class: string
  label: string
  weightPct: string
  // null is a real, permanent outcome — no attestation was active at the
  // exact confirmation instant, e.g. because none has ever been recorded
  // for this recipient+asset yet. Never fabricated as an empty object.
  custodyAttestation: {
    descriptor: unknown
    attestationAuthority: string
    attestedBy: string
    attestedAt: Date
  } | null
}

export interface EscrowCustodyCrossReferenceGeneration {
  confirmationEvidenceId: string
  confirmedAt: string
  distributionPolicyId: string | null
  recipients: EscrowCustodyCrossReferenceRecipient[]
}

export interface EscrowCustodyCrossReference {
  escrowId: string
  asset: string
  // The REAL destination this escrow's fee actually went to — the
  // cryptographic fact. Compare this by eye against each recipient's
  // custodyAttestation.descriptor below; this service does not, and
  // cannot honestly, do that comparison automatically (see header).
  frozenCollectionAddress: string | null
  generations: EscrowCustodyCrossReferenceGeneration[]
}

export class CustodyAttestationService {
  constructor(private readonly repo: CustodyAttestationRepository = custodyAttestationRepository) {}

  async findAttestationsForEscrow(escrowId: string): Promise<EscrowCustodyCrossReference> {
    const escrow = (await escrowService.getEscrow(escrowId)) as any

    const generations: EscrowCustodyCrossReferenceGeneration[] = await Promise.all(
      (escrow.distributionPolicyFreezes ?? []).map(async (freeze: any) => {
        const confirmedAt = new Date(freeze.confirmedAt)
        const recipients: EscrowCustodyCrossReferenceRecipient[] = await Promise.all(
          (freeze.distributionPolicy?.recipients ?? []).map(async (r: any) => {
            const attestation = await this.repo.findActiveAt(r.recipientId, escrow.asset, confirmedAt)
            return {
              recipientId: r.recipientId,
              class: r.class,
              label: r.label,
              weightPct: r.weightPct,
              custodyAttestation: attestation
                ? {
                    descriptor: attestation.descriptor,
                    attestationAuthority: attestation.attestationAuthority,
                    attestedBy: attestation.attestedBy,
                    attestedAt: attestation.attestedAt,
                  }
                : null,
            }
          })
        )
        return {
          confirmationEvidenceId: freeze.confirmationEvidenceId,
          confirmedAt: freeze.confirmedAt,
          distributionPolicyId: freeze.distributionPolicy?.id ?? null,
          recipients,
        }
      })
    )

    return {
      escrowId: escrow.id,
      asset: escrow.asset,
      frozenCollectionAddress: escrow.snapshotFeeCollectionAddress ?? null,
      generations,
    }
  }
}

export const custodyAttestationService = new CustodyAttestationService()
