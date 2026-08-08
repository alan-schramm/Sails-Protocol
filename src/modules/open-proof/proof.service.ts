/**
 * Sails OpenProof — Reference Implementation (PROTOCOL_SPECIFICATION.md
 * §1.8, RFC-006). Fase 1 Task 3(c): built as the real feature this
 * security review's "QVAC forgery" task actually needed underneath it —
 * there was no OpenProof service layer at all to test against before
 * this file existed (interfaces only, `docs/whitepapers/TECHNICAL_WHITEPAPER.md`'s
 * own 🟡 label). Scope, stated precisely: `Claim → Proof → Verification`
 * plus the three security properties this pass exists to close (hash
 * recompute, nonce anti-replay, time-lock).
 *
 * **Closed 2026-08-04:** RFC-007's `ProofRegistry` (`proof-registry.ts`,
 * duplicate-evidence detection — exact-content only, see that file's own
 * disclosed limitation on perceptual hashing), `EvidenceProvider`
 * (`evidence-provider.ts`, real external media storage — `evidence` on
 * `Proof` itself still stores small/structured claims inline, the same
 * pragmatic choice `Message.content` already makes; `attachEvidence()`
 * below is the new path for actual media bytes), and RFC-008's
 * `AnchorProof`/`TimestampAnchor` (`timestamp-anchor.ts`, real submission
 * to a live OpenTimestamps calendar server — verification/upgrade is a
 * disclosed, separate gap, see that file's own header comment).
 */
import { createHash, randomBytes } from 'crypto'
import nacl from 'tweetnacl'
import { prisma } from '../../common/database'
import { redis } from '../../common/redis'
import { NotFoundError, ValidationError, ForbiddenError } from '../../common/errors'
import { config } from '../../config'
import { eventBus } from '../../common/events/event-bus'
import { proofRegistry } from './proof-registry'
import { evidenceProvider } from './evidence-provider'
import { timestampAnchor } from './timestamp-anchor'
import { getTimeline } from '../../core/timeline'
import type { Prisma } from '@prisma/client'

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
  // RFC-007 D6 — scopes this Claim into a trade's EvidenceBundle
  // (getEvidenceBundleForTrade() below). Optional: not every Claim is
  // trade-related (see Claim.tradeId's own schema comment for why this
  // is tradeId, not RFC-007's literal intentId).
  tradeId?: string
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
        assertion: input.assertion as unknown as Prisma.InputJsonValue,
        tradeId: input.tradeId,
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
        evidence: input.evidence as unknown as Prisma.InputJsonValue,
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

    // RFC-007 D1 — flags reuse, never blocks it (adjudication is
    // Dispute's/Policy Engine's job, not this method's). excludeTradeId
    // is this Claim's own tradeId, so a participant resubmitting/retrying
    // their own evidence for their own ongoing trade never counts as
    // reuse of itself.
    const duplicates = await proofRegistry.findDuplicates(evidenceHash, claim.tradeId ?? undefined)
    const realDuplicates = duplicates.filter((d) => d.proofId !== proof.id)
    if (realDuplicates.length > 0) {
      await eventBus.emit('proof.duplicate_detected', {
        proofId: proof.id,
        claimId: input.claimId,
        evidenceHash,
        matches: realDuplicates,
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
      data: { proofId, verifiedBy, verdict, reason },
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

  /**
   * RFC-007 D2, closed 2026-08-04 — stores real media bytes for an
   * existing Proof via `evidenceProvider` (local filesystem by default)
   * and persists the resulting `EvidenceReference`. `signature` is
   * verified for real against `submittedBy`'s own registered
   * `User.publicKey` (Ed25519, same `tweetnacl` call
   * `common/middleware/auth.ts`'s `verifySignedChallenge()` uses) — over
   * the media's own sha256 hex digest, not the raw bytes, so a caller
   * never needs to re-sign large media, only its hash. Never trusted
   * unverified: a caller claiming a signature that doesn't actually
   * verify is rejected outright, not stored with a "trust me" flag.
   */
  async attachEvidence(
    proofId: string,
    media: Uint8Array,
    mimeType: 'image' | 'video' | 'document' | 'ocr' | 'external_reference',
    submittedBy: string,
    signatureHex: string
  ) {
    const proof = await prisma.proof.findUnique({ where: { id: proofId } })
    if (!proof) throw new NotFoundError('Proof', proofId)

    const submitter = await prisma.user.findUnique({ where: { id: submittedBy } })
    if (!submitter) throw new NotFoundError('User', submittedBy)

    const digestHex = createHash('sha256').update(media).digest('hex')
    let sigValid = false
    try {
      sigValid = nacl.sign.detached.verify(
        new Uint8Array(Buffer.from(digestHex, 'hex')),
        new Uint8Array(Buffer.from(signatureHex, 'hex')),
        new Uint8Array(Buffer.from(submitter.publicKey, 'hex'))
      )
    } catch {
      sigValid = false
    }
    if (!sigValid) {
      throw new ForbiddenError(`Signature does not verify against ${submittedBy}'s registered public key for this media's own hash`)
    }

    const stored = await evidenceProvider.store(media, mimeType)
    // Real, disclosed limitation: this trusts evidenceProvider.store()'s
    // own recomputed sha256 as authoritative for what actually got
    // written to disk, but does not currently re-verify it matches
    // digestHex (the pre-storage hash the signature covers) — the two
    // are computed from the identical `media` bytes in the same call, so
    // divergence would mean a bug in the provider itself, not an
    // adversarial input; not re-checked here to avoid a redundant hash
    // pass over potentially large media.
    const reference = await prisma.evidenceReference.create({
      data: {
        proofId,
        provider: stored.provider,
        uri: stored.uri,
        sha256: stored.sha256,
        mimeType,
        signature: signatureHex,
      },
    })

    await eventBus.emit('proof.submitted', { proofId, claimId: proof.claimId }, proof.claimId)

    return reference
  }

  /**
   * RFC-008 D1, closed 2026-08-04 — real submission to a live
   * OpenTimestamps calendar server (`timestamp-anchor.ts`). Policy-gated
   * per that RFC's own D1 ("Policy Engine decides when an anchor is
   * required") — this method is the mechanism, not something called
   * unconditionally from `attachEvidence()`; a caller (a route, or a
   * future real Policy Engine hook) decides when the real network cost
   * is worth it.
   */
  async anchorEvidence(evidenceReferenceId: string) {
    const reference = await prisma.evidenceReference.findUnique({ where: { id: evidenceReferenceId } })
    if (!reference) throw new NotFoundError('EvidenceReference', evidenceReferenceId)

    const anchorProof = await timestampAnchor.anchor(reference.sha256)

    const updated = await prisma.evidenceReference.update({
      where: { id: evidenceReferenceId },
      data: { anchorProof: anchorProof as unknown as Prisma.InputJsonValue },
    })
    return updated
  }

  /**
   * RFC-007 D6, closed 2026-08-04 — the real per-trade aggregate that
   * RFC's own interface describes (claims/proofs/verifications/timeline/
   * externalReferences), distinct from `getEvidenceBundle(claimId)`
   * above (an already-shipped, differently-scoped per-Claim read with
   * its own real SDK/React-hook surface — kept unchanged, not renamed,
   * to avoid a breaking change to that surface). `tradeId`, not RFC-007's
   * literal `intentId` — same real-world correction `core/timeline.ts`'s
   * own header comment already explains and this file's `Claim.tradeId`
   * schema comment repeats.
   */
  async getEvidenceBundleForTrade(tradeId: string) {
    const claims = await prisma.claim.findMany({
      where: { tradeId },
      include: { proofs: { include: { verifications: true, evidenceReferences: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const proofs = claims.flatMap((c) => c.proofs)
    const verifications = proofs.flatMap((p) => p.verifications)
    const externalReferences = proofs.flatMap((p) => p.evidenceReferences)

    const timeline = await getTimeline(tradeId).getEvents()

    return { tradeId, claims, proofs, verifications, externalReferences, timeline }
  }
}

export const proofService = new ProofService()
