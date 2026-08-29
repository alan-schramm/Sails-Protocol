/**
 * Sails OpenSettlement — Arbitration Authority Decision (Missão 13 Fase 2)
 *
 * Implements Candidate B from Missão 13 Fase 1/1B: closes `INV-12`
 * (Attributed Authority Integrity, `docs/PROTOCOL_INVARIANTS.md`) for the
 * MULTISIG disputed-settlement path without touching the Bitcoin
 * threshold, script, or execution key (`multisig.provider.ts`'s
 * `deriveArbiterKey()`/`MULTISIG_SEED` are UNCHANGED — Missão 13 Fase 1B
 * explicitly kept them after testing Bisq/Hodl Hodl/DLC/Taproot/MuSig2/
 * adaptor-signature alternatives and finding none dominates this
 * combination of arbitrary SPLIT, losing-party-offline liveness, QVAC
 * compatibility, and deterministic crash recovery).
 *
 * Security target: TARGET 1 — VERIFIABLE ATTRIBUTION, never TARGET 2. A
 * server that also controls one participant's cooperation can still
 * technically produce a Bitcoin-valid disposition inconsistent with the
 * signed authority decision — this module does not and cannot prevent
 * that (Structural Invariant 2/2-of-3 threshold mechanics are untouched).
 * What it guarantees: such a divergence is independently detectable by
 * anyone holding the signed decision and the arbiter's already-public
 * identity key, without trusting anything the executor (this server)
 * asserts about its own database. See `INV-12`'s own NON-REQUIREMENTS —
 * this is exactly, and deliberately, the bar it sets, no more.
 *
 * Reuses the EXACT signing convention `proof.service.ts`'s
 * `attachEvidence()` already established (sha256 digest, `tweetnacl`
 * detached signature, verified against the signer's already-registered
 * `User.publicKey`) — no new key type, no new cryptographic primitive,
 * per Missão 13 Fase 1's own Task 2 finding that the arbiter already has
 * a usable Ed25519 identity.
 */
import { createHash } from 'crypto'
import nacl from 'tweetnacl'
import { ForbiddenError, ValidationError } from '../../common/errors'

export type ArbitrationOutcome = 'RELEASE' | 'REFUND' | 'SPLIT'

// Domain-separated so this signature can never be replayed as, or
// confused with, any other Sails signature type (evidence attachment,
// payment-account attestation, etc.) — same discipline this codebase
// already applies wherever a signed artifact exists.
export const AUTHORITY_DECISION_DOMAIN = 'SAILS_AUTHORITY_DECISION_V1' as const
export const AUTHORITY_DECISION_VERSION = 1 as const

/**
 * The exact — and only — economic facts a discretionary authority signs.
 * Deliberately excludes every Bitcoin/rail mechanic (UTXO, PSBT, txid,
 * miner fee, transaction version, destination address encoding) per
 * Missão 13 Fase 2's own economic-semantics-vs-rail-mechanics boundary:
 * the authority decides WHAT is authorized; the settlement provider
 * decides HOW it is mechanically delivered. `appealRound` is bound so an
 * authorization from one appeal round can never be replayed into a
 * later round that reassigned or re-ruled the same dispute (RFC-021 D6).
 */
export interface AuthorityDecisionPayload {
  disputeId: string
  escrowId: string
  appealRound: number
  authorityId: string
  outcome: ArbitrationOutcome
  // Buyer's share in basis points, 0-10000 — required for SPLIT, null
  // otherwise. Never both undefined-for-SPLIT and populated-for-others;
  // callers must pass exactly null for RELEASE/REFUND.
  buyerBps: number | null
  // Client-supplied, becomes part of what is signed — an audit trail of
  // when the authority actually decided, not a freshness/expiry gate
  // (Missão 13 Fase 1's own Task 7/23: "do not invent a full PKI" —
  // revocation/expiry semantics are deliberately left to a future,
  // narrower pass, not overloaded into this Level-1 remediation).
  issuedAt: string // ISO 8601
}

function assertWellFormed(payload: AuthorityDecisionPayload): void {
  if (payload.outcome === 'SPLIT') {
    if (payload.buyerBps === null || !Number.isInteger(payload.buyerBps) || payload.buyerBps < 1 || payload.buyerBps > 9999) {
      throw new ValidationError('Authority decision for SPLIT requires an integer buyerBps between 1 and 9999')
    }
  } else if (payload.buyerBps !== null) {
    throw new ValidationError(`Authority decision for ${payload.outcome} must not carry a buyerBps`)
  }
}

// Explicit field order and explicit stringification of every field —
// never JSON.stringify(payload), which depends on property insertion
// order and JS number formatting, neither of which is a safe basis for
// a cross-language-verifiable signature (Missão 13 Fase 2 Task 4).
export function canonicalizeAuthorityDecision(payload: AuthorityDecisionPayload): string {
  assertWellFormed(payload)
  return [
    AUTHORITY_DECISION_DOMAIN,
    String(AUTHORITY_DECISION_VERSION),
    payload.disputeId,
    payload.escrowId,
    String(payload.appealRound),
    payload.authorityId,
    payload.outcome,
    payload.buyerBps === null ? '' : String(payload.buyerBps),
    payload.issuedAt,
  ].join('|')
}

export function hashAuthorityDecision(payload: AuthorityDecisionPayload): string {
  return createHash('sha256').update(canonicalizeAuthorityDecision(payload)).digest('hex')
}

/** Client-side (or test) helper — signs with the authority's own Ed25519 secret key. Never called with a server-held key. */
export function signAuthorityDecision(payload: AuthorityDecisionPayload, secretKey: Uint8Array): string {
  const digest = hashAuthorityDecision(payload)
  const signature = nacl.sign.detached(new Uint8Array(Buffer.from(digest, 'hex')), secretKey)
  return Buffer.from(signature).toString('hex')
}

export function verifyAuthorityDecisionSignature(
  payload: AuthorityDecisionPayload,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  const digest = hashAuthorityDecision(payload)
  try {
    return nacl.sign.detached.verify(
      new Uint8Array(Buffer.from(digest, 'hex')),
      new Uint8Array(Buffer.from(signatureHex, 'hex')),
      new Uint8Array(Buffer.from(publicKeyHex, 'hex'))
    )
  } catch {
    return false
  }
}

/**
 * The single execution-correspondence boundary (Missão 13 Fase 2 Task
 * 13) — every settlement path that attributes a disposition to a
 * discretionary authority calls this exactly once, before invoking the
 * settlement rail. Never scattered ad-hoc comparisons across services.
 * Throws `ForbiddenError` (fail closed, per Task 12 — no fallback to a
 * bare database assertion) on any mismatch.
 */
export function assertExecutionMatchesAuthorization(
  authorization: AuthorityDecisionPayload,
  requested: { disputeId: string; escrowId: string; appealRound: number; authorityId: string; outcome: ArbitrationOutcome; buyerBps: number | null }
): void {
  if (authorization.disputeId !== requested.disputeId) {
    throw new ForbiddenError('Signed authorization does not correspond to this dispute')
  }
  if (authorization.escrowId !== requested.escrowId) {
    throw new ForbiddenError('Signed authorization does not correspond to this escrow')
  }
  if (authorization.appealRound !== requested.appealRound) {
    throw new ForbiddenError('Signed authorization is for a different appeal round of this dispute')
  }
  if (authorization.authorityId !== requested.authorityId) {
    throw new ForbiddenError('Signed authorization was not produced by the authority assigned to this dispute')
  }
  if (authorization.outcome !== requested.outcome) {
    throw new ForbiddenError(`Signed authorization authorized ${authorization.outcome}, not ${requested.outcome}`)
  }
  if (authorization.buyerBps !== requested.buyerBps) {
    throw new ForbiddenError('Signed authorization authorized a different SPLIT allocation than requested')
  }
}
