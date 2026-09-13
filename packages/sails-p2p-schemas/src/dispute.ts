/**
 * Dispute schema — sails-p2p-schemas (04-Deepseek Review.md Task 1).
 *
 * The Dispute *primitive* already exists (PROTOCOL_SPECIFICATION.md §1.9:
 * disputeId, settlementId, openedBy, proofs, arbiterId, status, ruling) —
 * this schema is that primitive's shape, using the task's requested field
 * names where they don't conflict (tradeId is additive alongside the
 * primitive's settlementId-anchored relationships), and is what
 * `prisma/schema.prisma`'s new `Dispute` model (dispute.service.ts)
 * actually persists — not a second, divergent shape.
 *
 * `arbitratorDid` is `arbiterId: string` here, not a real W3C DID — DIDs
 * are OpenIdentity's documented future growth stage
 * (PROTOCOL_SPECIFICATION.md §1.1: Keys -> DID -> Credentials -> Trust
 * Graph), not built yet (today's Identity is Level-0 keypair-only). A DID
 * is just a specially-formatted string, so this field needs no shape
 * change when that stage ships — stated here rather than left implicit.
 */

// CROSS-LAYER-SEMANTIC-CORRECTIVE-1 (item 38, 2026-09-13) — widened from
// 4 to the real 6 values. This file's own header above claims parity
// with `prisma/schema.prisma`'s real `Dispute` model — that claim was
// false for this exact type: the real enum
// (`prisma/schema.prisma`'s `DisputeStatus`) has always had `APPEALED`
// (RFC-021 D6) and `AUTO_PROPOSED` (RFC-021 D8), both real, actively-used
// values (`dispute.service.ts`'s `appeal()`/QVAC auto-resolution flow) —
// `packages/sails-sdk/src/types.ts`'s own `DisputeStatus` already had the
// correct 6 values; only this package's own copy had drifted. Reconciled
// here, not duplicated — see `tests/disputeStatusParity.test.ts` for the
// test proving this against the real Prisma enum going forward.
export type DisputeStatus = 'OPENED' | 'EVIDENCE_SUBMITTED' | 'ARBITRATED' | 'RESOLVED' | 'APPEALED' | 'AUTO_PROPOSED'

// RELEASE = buyer wins (asset released to them) = "dispute_resolved_buyer"
// REFUND  = seller wins (asset returned to them) = "dispute_resolved_seller"
// SPLIT   = §1.9's third option, no buyer/seller-exclusive equivalent
export type DisputeRuling = 'RELEASE' | 'REFUND' | 'SPLIT'

export interface EvidenceDescriptor {
  type: string // e.g. 'payment_receipt', 'chat_log', 'screenshot'
  uri?: string // pointer, if the evidence lives with an EvidenceProvider (RFC-007 D2) once that exists
  note?: string
  submittedBy: string
  submittedAt: string // ISO 8601
}

export interface DisputeSchema {
  id: string
  tradeId: string
  escrowId: string
  openedBy: string
  reason: string
  evidence: EvidenceDescriptor[]
  arbiterId: string | null // "arbitratorDid" in the task's vocabulary — see doc comment above
  status: DisputeStatus
  ruling: DisputeRuling | null
  resolvedAt: string | null
}
