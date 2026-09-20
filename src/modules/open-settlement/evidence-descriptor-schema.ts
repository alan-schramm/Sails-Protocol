/**
 * Issue #266 CTO Gate re-gate — extracted from settlement.routes.ts so
 * the real HTTP-boundary validation for a dispute evidence descriptor
 * is directly testable (proving Zod actually preserves
 * `evidenceReferenceId`/`externalReference` through `.parse()` — the
 * exact concern an independent review raised) without pulling in
 * settlement.routes.ts's own heavy module graph (escrow/dispute
 * services, Redis-backed rate limiting, trade service, auth middleware,
 * config, etc.) just to reach two schema consts. Both `disputeSchema`'s
 * evidence array item and `submitEvidenceSchema`
 * (settlement.routes.ts) use this exact schema — one definition, not
 * two that could silently drift apart.
 */
import { z } from 'zod'

export const evidenceDescriptorInputSchema = z.object({
  type: z.string().min(1),
  uri: z.string().optional(),
  note: z.string().optional(),
  // Issue #266 — an OpenProof EvidenceReference id. Mutual exclusivity
  // with `uri` (a descriptor cannot claim to be both a raw pointer and
  // an integrity-bound cross-reference) is enforced service-side, not
  // here — dispute.service.ts's own resolveEvidenceDescriptor().
  evidenceReferenceId: z.string().optional(),
  // Issue #266 CTO Gate re-gate — explicit, non-heuristic declaration
  // that a raw `uri` (no evidenceReferenceId) is a lightweight
  // external/non-file reference. Required for any NEW raw-uri
  // descriptor to be accepted at all — enforced service-side
  // (resolveEvidenceDescriptor()), never inferred from `type`.
  externalReference: z.literal(true).optional(),
})
