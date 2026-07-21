/**
 * Sails OpenProof — Reference Implementation (PROTOCOL_SPECIFICATION.md
 * §1.8, RFC-006). Fase 1 Task 3(c): built as the real feature this
 * security review's "QVAC forgery" task actually needed underneath it —
 * there was no OpenProof service layer at all to test against before
 * this file existed (interfaces only, `docs/whitepapers/TECHNICAL_WHITEPAPER.md`'s
 * own 🟡 label). Scope, stated precisely: `Claim → Proof → Verification`
 * plus the three security properties this pass exists to close (hash
 * recompute, nonce anti-replay, time-lock). NOT built here — still
 * 📋 Planned, unchanged by this pass: RFC-007's `ProofRegistry`
 * (duplicate-evidence detection), `EvidenceProvider` (external media
 * storage adapters — `evidence` is stored inline in Postgres for now,
 * the same pragmatic choice `Message.content` already makes), and
 * RFC-008's `AnchorProof`/`TimestampAnchor`.
 */
import { createHash, randomBytes } from 'crypto'
import { prisma } from '../../common/database'
import { redis } from '../../common/redis'
import { NotFoundError, ValidationError } from '../../common/errors'
import { config } from '../../config'
import { eventBus } from '../../common/events/event-bus'

const NONCE_PREFIX = 'proof:verify-nonce:'

// Canonical JSON — key order matters for a stable hash across identical
// evidence submitted twice; JSON.stringify's own key order already
// matches insertion order in V8, but callers can supply keys in any
// order, so this sorts them explicitly rather than depending on that
// being the same order twice by accident.
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')}}`
}

function hashEvidence(evidence: unknown): string {
  return createHash('sha256').update(canonicalize(evidence)).digest('hex')
}

export interface AssertClaimInput {
  claimedBy: string
  claimType: string
  assertion: unknown
}

export interface SubmitProofInput {
  claimId: string
  evidence: unknown
  submittedBy: string
  // Deliberately accepted and deliberately ignored for the actual stored
  // hash — see submitProof()'s own comment. Present in the input type so
  // a caller who sends one (trusting their own computation, or a
  // malicious caller trying to make a forged hash stick) is handled
  // explicitly, not silently dropped by a schema that never mentioned it.
  claimedHash?: string
}

export class ProofService {
  async assertClaim(input: AssertClaimInput) {
    const claim = await prisma.claim.create({
      data: {
        claimedBy: input.claimedBy,
        claimType: input.claimType,
        assertion: input.assertion as any,
      },
    })

    await eventBus.emit('claim.asserted', {
      claimId: claim.id,
      claimedBy: claim.claimedBy,
      claimType: claim.claimType,
    }, claim.id)

    return claim
  }

  // The security property this method exists to enforce: `evidenceHash`
  // is ALWAYS this server's own sha256(canonicalize(evidence)) — never
  // whatever `input.claimedHash` says, even if a caller supplies one that
  // "looks right." A caller who submits real evidence but a wrong/stale/
  // forged claimedHash gets the correct hash stored anyway (their claimed
  // hash was simply never a source of truth to begin with); this is not
  // a "reject the request" case; it is architecturally impossible for a
  // client-supplied hash to ever reach storage.
  async submitProof(input: SubmitProofInput) {
    const claim = await prisma.claim.findUnique({ where: { id: input.claimId } })
    if (!claim) throw new NotFoundError('Claim', input.claimId)

    // Time-lock: evidence submitted long after the Claim it supports is
    // weaker proof of what was true *at the claimed time* — the same
    // reasoning escrow.timelockHours already applies to fund locks.
    const windowMs = config.proof.submissionWindowHours * 3600 * 1000
    const ageMs = Date.now() - claim.createdAt.getTime()
    if (ageMs > windowMs) {
      throw new ValidationError(
        `Proof submitted ${Math.round(ageMs / 3600000)}h after its Claim — outside the ` +
        `${config.proof.submissionWindowHours}h submission window`
      )
    }

    const evidenceHash = hashEvidence(input.evidence)

    const proof = await prisma.proof.create({
      data: {
        claimId: input.claimId,
        evidence: input.evidence as any,
        evidenceHash,
        submittedBy: input.submittedBy,
      },
    })

    // Defense-in-depth signal, not a rejection: a mismatch here means
    // either a buggy client or a real forgery attempt (submitting real
    // evidence bytes while claiming a different, more favorable hash
    // computed some other way) — worth a real event for a human/QVAC to
    // notice, even though it changes nothing about what got stored.
    if (input.claimedHash && input.claimedHash !== evidenceHash) {
      await eventBus.emit('proof.hash_mismatch_detected', {
        proofId: proof.id,
        claimId: input.claimId,
        claimedHash: input.claimedHash,
        actualHash: evidenceHash,
      }, input.claimId)
    }

    await eventBus.emit('proof.submitted', {
      proofId: proof.id,
      claimId: proof.claimId,
    }, proof.claimId)

    return proof
  }

  // Anti-replay: a fresh, single-use nonce is required before verifyProof()
  // will accept a verdict — the same challenge-response shape auth.ts's
  // issueChallenge()/verifySignedChallenge() already establishes for
  // login, applied here to stop a captured/old verification call (or an
  // automated verifier accidentally re-invoked) from being replayed
  // against a Proof whose evidence has since been disputed and needs a
  // fresh look, not a stale rubber stamp.
  async issueVerificationNonce(proofId: string): Promise<{ nonce: string; expiresIn: number }> {
    const proof = await prisma.proof.findUnique({ where: { id: proofId } })
    if (!proof) throw new NotFoundError('Proof', proofId)

    const nonce = randomBytes(32).toString('hex')
    await redis.set(
      `${NONCE_PREFIX}${proofId}:${nonce}`,
      '1',
      'EX',
      config.proof.verificationNonceTtlSeconds
    )
    return { nonce, expiresIn: config.proof.verificationNonceTtlSeconds }
  }

  async verifyProof(
    proofId: string,
    verifiedBy: string,
    verdict: 'ACCEPTED' | 'REJECTED',
    nonce: string,
    reason?: string
  ) {
    const proof = await prisma.proof.findUnique({ where: { id: proofId } })
    if (!proof) throw new NotFoundError('Proof', proofId)

    const nonceKey = `${NONCE_PREFIX}${proofId}:${nonce}`
    const nonceValid = await redis.get(nonceKey)
    if (!nonceValid) {
      throw new ValidationError(
        'Missing, expired, or already-used verification nonce — call ' +
        'POST /v1/proof/proofs/:id/verify-nonce first, and note each nonce is single-use'
      )
    }
    // One-time use — burned immediately so it can never be replayed, the
    // same pattern auth.ts's verifySignedChallenge() uses for its own
    // challenge (`redis.del` right after the check succeeds, before any
    // other work, so a concurrent replay attempt loses the race too).
    await redis.del(nonceKey)

    const verification = await prisma.verification.create({
      data: { proofId, verifiedBy, verdict: verdict as any, reason },
    })

    await eventBus.emit(
      verdict === 'ACCEPTED' ? 'verification.accepted' : 'verification.rejected',
      { verificationId: verification.id, proofId, verifiedBy, verdict: verdict as 'ACCEPTED' | 'REJECTED' },
      proof.claimId
    )

    return verification
  }

  async getEvidenceBundle(claimId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { proofs: { include: { verifications: true } } },
    })
    if (!claim) throw new NotFoundError('Claim', claimId)
    return claim
  }
}

export const proofService = new ProofService()
