/**
 * @satsails/p2p-trading-sdk — Sails OpenSettlement module (verified against
 * src/modules/open-settlement/settlement.routes.ts directly).
 *
 * SDK_GUIDE.md marks this namespace "advanced/direct use" — the six-verb
 * Intent facade's releaseAsset()/dispute() is the path most applications
 * should reach for first, and both are now genuinely implemented there
 * (intent-facade.ts, since RFC-018's Intent → Trade → Escrow link,
 * 2026-07-20). Only `negotiate` still throws SailsNotImplementedError
 * (see intent-facade.ts's own header for why: a shape mismatch against a
 * stateful WebSocketChannel, not a missing backend route). The methods
 * below remain the real, working advanced path for callers operating on
 * `escrowId` directly, exactly like the server route does.
 */
import type { SailsTransport } from "../transport";
import { SailsValidationError } from "../errors";
import type { WalletAdapter } from "../wallet-adapter";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "../encoding";
// Missão 11 Fase 9.1 §4/§5 — re-exported (not just imported) so a caller
// depending only on @satsails/p2p-trading-sdk can declare the real
// capability profile this SDK's own escrow-key-derivation.ts/
// wallet-verification.ts modules implement, without also needing a direct
// @satsails/p2p-schemas dependency of their own.
export { MULTISIG_CAPABILITY_PROFILE_V1 } from "@satsails/p2p-schemas";
import type {
  AssetType,
  Dispute,
  DisputeRuling,
  Escrow,
  EscrowPendingTransaction,
  EscrowType,
  PaginatedDisputes,
} from "../types";

/**
 * Missão 13 Fase 2 — INV-12 (`docs/PROTOCOL_INVARIANTS.md`) closure. The
 * server (`src/modules/open-settlement/dispute.service.ts`'s
 * `resolveDispute()`) now REQUIRES a signed authority decision before it
 * will execute any dispute ruling — a caller who is genuinely the
 * assigned arbiter but supplies no valid signature is refused, never
 * falling back to trusting the bare (disputeId, ruling) request body.
 * `resolveDispute()` below builds and signs this artifact for the caller
 * automatically; these exports exist for advanced callers who need to
 * construct or inspect the artifact directly (e.g. an offline signing
 * flow, or displaying exactly what is about to be signed before the
 * caller's wallet prompts them).
 *
 * `canonicalizeAuthorityDecision()`/`hashAuthorityDecision()` mirror
 * `src/modules/open-settlement/arbitration-authority.ts`'s server-side
 * implementation byte-for-byte — the server independently recomputes this
 * exact digest and verifies the signature against it, so any drift
 * between the two would silently break every real resolveDispute() call.
 * Cross-checked directly against the server module by
 * `tests/arbitrationAuthoritySdkParity.test.ts`.
 */
export type AuthorityDecisionOutcome = "RELEASE" | "REFUND" | "SPLIT";

export interface AuthorityDecisionInput {
  disputeId: string;
  escrowId: string;
  appealRound: number;
  authorityId: string;
  outcome: AuthorityDecisionOutcome;
  buyerBps: number | null;
  issuedAt: string; // ISO 8601
}

const AUTHORITY_DECISION_DOMAIN = "SAILS_AUTHORITY_DECISION_V1";
const AUTHORITY_DECISION_VERSION = 1;

export function canonicalizeAuthorityDecision(payload: AuthorityDecisionInput): string {
  if (payload.outcome === "SPLIT") {
    if (
      payload.buyerBps === null ||
      !Number.isInteger(payload.buyerBps) ||
      payload.buyerBps < 1 ||
      payload.buyerBps > 9999
    ) {
      throw new SailsValidationError(
        "Authority decision for SPLIT requires an integer buyerBps between 1 and 9999",
      );
    }
  } else if (payload.buyerBps !== null) {
    throw new SailsValidationError(
      `Authority decision for ${payload.outcome} must not carry a buyerBps`,
    );
  }
  return [
    AUTHORITY_DECISION_DOMAIN,
    String(AUTHORITY_DECISION_VERSION),
    payload.disputeId,
    payload.escrowId,
    String(payload.appealRound),
    payload.authorityId,
    payload.outcome,
    payload.buyerBps === null ? "" : String(payload.buyerBps),
    payload.issuedAt,
  ].join("|");
}

/** The raw 32-byte sha256 digest a wallet actually signs — never the hex string's own bytes. */
export function hashAuthorityDecision(payload: AuthorityDecisionInput): Uint8Array {
  return sha256(utf8ToBytes(canonicalizeAuthorityDecision(payload)));
}

/**
 * M10 SDK Adapter — the frozen four-state condition vocabulary
 * (`packages/sails-core/src/condition-result.ts`, internal/unpublished).
 * This is a structural, string-for-string mirror declared here in the
 * public SDK — never an import of `@sails/core` itself, which remains
 * internal and unpublished (docs/CORE_IMPLEMENTATION_ARCHITECTURE.md
 * §18). The wire format crossing HTTP is just these four strings, so
 * this type faithfully represents what the server actually returns
 * without creating any dependency on the Core package.
 */
export type ConditionResult = "SATISFIED" | "NOT_YET_SATISFIED" | "UNSATISFIABLE" | "UNKNOWN";

export interface SemanticIdentity {
  name: string;
  version: string;
}

/** ArbitrationOutcomeContent + destinations, field-complete — see economic-outcome.ts server-side. */
export interface DisputeRulingOutcome {
  ruling: AuthorityDecisionOutcome;
  totalUnits: string;
  asset: string;
  allocations: { beneficiary: string; basisPoints: number }[];
  remainderBeneficiary: string;
  destinations: { beneficiary: string; destination: string }[];
}

export interface DisputeRulingAttribution {
  actor: string;
  /** Hex-encoded raw signature — the same value canonicalizeAuthorityDecision()/hashAuthorityDecision() produce the signable digest for. Preserved (not hidden) so a caller can independently re-verify it — see this module's own resolveDisputeWithWallet(). */
  signatureHex: string;
  resolvedIdentityReference: string | null;
}

/**
 * M10 SDK Adapter — the historical semantic record for one dispute's
 * specific appeal round, as Core's own frozen evaluators actually
 * authorized it. See SailsSettlementModule.getSemanticRecord()'s own
 * header comment for the full contract.
 */
export interface DisputeRulingSemanticRecord {
  disputeId: string;
  escrowId: string;
  appealRound: number;
  rulesetIdentity: SemanticIdentity;
  evaluatorIdentity: SemanticIdentity;
  profileIdentity: SemanticIdentity;
  conditionResult: ConditionResult;
  attribution: DisputeRulingAttribution | null;
  outcome: DisputeRulingOutcome | null;
}

export interface ArbiterProfile {
  participantId: string;
  monetaryCollateral: string;
  collateralAsset: string;
  reputationScore: number;
  activeDisputes: number;
  registeredAt: string;
}

/**
 * BACKLOG.md's own "Participant payout address" gap, closed 2026-08-04 —
 * see the server's payout-address.service.ts for the full rationale. One
 * row per (participant, asset); a BTC address and an EVM address for the
 * same participant are unrelated values, not one field.
 */
export interface PayoutAddress {
  id: string;
  participantId: string;
  asset: AssetType;
  address: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Missão 11 Fase 9.3.4 — the shape `getPayoutAddress()` actually
 * returns. Deliberately NOT `PayoutAddress` — that full row (including
 * `id`/`createdAt`/`updatedAt`) is only ever returned to an
 * AUTHENTICATED, self-referential caller (`setPayoutAddress()`, where
 * the caller IS the participant registering their own address).
 * `getPayoutAddress()` is public-by-lookup (no session), so it returns
 * only what a counterparty needs to route a settlement: participantId/
 * asset (the lookup keys) and address (the committed payout
 * destination) — never internal bookkeeping. See
 * `src/modules/open-settlement/payout-address.service.ts`'s
 * `PublicPayoutAddressView` (the server-side source of this shape).
 */
export interface PublicPayoutAddress {
  participantId: string;
  asset: AssetType;
  address: string;
}

export interface ReleaseApproval {
  id: string;
  escrowId: string;
  approverId: string;
  approvedAt: string;
}

export interface ReleaseApprovalsResult {
  approvals: ReleaseApproval[];
  readyToRelease: boolean;
}

export interface CreateEscrowInput {
  tradeId: string;
  type?: EscrowType;
  lockedAmount: string;
  asset: AssetType;
  network?: string;
  timelockHours?: number;
}

/**
 * SAFE_GUARD_EVM's real bundle shape (server-side `SafeGuardBundle`,
 * `safe-guard-evm.provider.ts`) — every other escrow type's
 * `unsignedPsbtBase64` is genuinely opaque to this SDK (the server never
 * inspects it either, per that file's own comment), but SAFE_GUARD_EVM's
 * `guardDeployment` is the one piece a caller structurally cannot get
 * anywhere else: deploying `SailsEscrowSafe` needs no trade-party
 * signature at all (its constructor args are immutable and fixed by the
 * time this bundle exists), so ANY funded account — typically the
 * seller, motivated to move the trade forward — can permissionlessly
 * submit `{ to, data }` with their own gas, before the actual
 * release/refund signature round below even begins. Found and closed as
 * a real gap (2026-08-02, multisig-coverage-per-asset audit
 * follow-through): the server has computed this since `safe-guard-evm.provider.ts`
 * shipped, but no SDK surface ever let a caller reach it.
 */
export interface SafeGuardBundle {
  path: "COOPERATIVE" | "DISPUTED_RELEASE" | "DISPUTED_REFUND";
  userOpHash: string;
  toAddress: string;
  guardAddress: string;
  guardDeployment: { to: string; data: string };
}

/**
 * Parses a SAFE_GUARD_EVM escrow's `unsignedPsbtBase64` (from
 * `initiateRelease()`/`initiateRefund()`/`getPendingTransaction()`) into
 * its real structured shape. Throws a clear error for any other escrow
 * type's bundle (MULTISIG's literal PSBT, LIGHTNING_HODL's Ark tx JSON)
 * rather than returning a nonsense partial parse — this is deliberately
 * not a generic "try to parse whatever" helper.
 *
 * Deliberately does NOT submit `guardDeployment` itself — this SDK has
 * no hard dependency on ethers/viem/any specific EVM library (browser +
 * Node compatibility, `encoding.ts`'s own header comment), so the
 * caller submits `{ to, data }` via whatever wallet/provider they
 * already use, e.g. `provider.sendTransaction({ to, data })` (ethers) or
 * `walletClient.sendTransaction({ to, data })` (viem). No value field —
 * this transaction deploys a contract, it never carries native currency.
 */
export function parseSafeGuardBundle(
  unsignedPsbtBase64: string,
): SafeGuardBundle {
  let bundle: unknown;
  try {
    bundle = JSON.parse(unsignedPsbtBase64);
  } catch (err) {
    throw new Error(
      `parseSafeGuardBundle: not valid JSON — this isn't a SAFE_GUARD_EVM bundle: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const b = bundle as Partial<SafeGuardBundle>;
  if (!b.guardAddress || !b.guardDeployment?.to || !b.guardDeployment?.data) {
    throw new Error(
      "parseSafeGuardBundle: missing guardAddress/guardDeployment — this is not a SAFE_GUARD_EVM bundle " +
        "(MULTISIG/LIGHTNING_HODL PSBTs have a different, opaque shape entirely)",
    );
  }
  return b as SafeGuardBundle;
}

// Mirrors escrow.service.ts's RECOMMENDED_ESCROW_TYPE exactly (found during
// the multisig-coverage-per-asset audit: `create()` used to forward
// whatever `type` the caller passed, including undefined — the server then
// defaulted every omitted type to a hardcoded 'MULTISIG' regardless of
// `asset`, which is how sails-ui's Trade.tsx create() call, which never
// sets `type`, silently created a Bitcoin-shaped escrow for every asset).
// Failing fast here, client-side, before ever hitting the network, is the
// better DX — the same "don't let the integrator hold the footgun"
// standard Breez SDK/WDK apply to their own SDKs.
const RECOMMENDED_ESCROW_TYPE: Partial<Record<AssetType, EscrowType>> = {
  BTC: "MULTISIG",
  LN_BTC: "LIGHTNING_HODL",
  USDT_ERC20: "WDK_USDT_EVM",
};

export function recommendedEscrowType(
  asset: AssetType,
): EscrowType | undefined {
  return RECOMMENDED_ESCROW_TYPE[asset];
}

export class SailsSettlementModule {
  constructor(private readonly transport: SailsTransport) {}

  /**
   * Requires an active session. If `type` is omitted, it's resolved via
   * `recommendedEscrowType(input.asset)` — throws immediately, before any
   * network call, for an asset with no real SettlementProvider yet, rather
   * than silently sending an unrelated escrow type to the server.
   */
  async create(input: CreateEscrowInput): Promise<Escrow> {
    const type = input.type ?? recommendedEscrowType(input.asset);
    if (!type) {
      throw new Error(
        `@satsails/p2p-trading-sdk: no real SettlementProvider exists yet for asset '${input.asset}' — pass type: 'MOCK' explicitly if a fake/test escrow is actually intended.`,
      );
    }
    return this.transport.post<Escrow>(
      "/v1/settlement/escrow",
      { ...input, type },
      true,
    );
  }

  /**
   * Requires an active session — Missão 06.8 (2026-08-16) made this a
   * party/arbiter-scoped read server-side (it used to be a public read);
   * this call was never updated to match and 401'd unconditionally until
   * this fix. Only the trade's buyer/seller or an assigned dispute
   * arbiter may fetch it.
   */
  async get(escrowId: string): Promise<Escrow> {
    return this.transport.get<Escrow>(
      `/v1/settlement/escrow/${escrowId}`,
      undefined,
      true,
    );
  }

  /**
   * Requires an active session. UI-audit gap (2026-08-03) — the operator/
   * arbiter console's resolve/appeal/evidence/contest actions were all
   * real and callable but had nothing to fetch a disputeId from. Always
   * scoped server-side to the calling participant's own arbiterId
   * (dispute.service.ts's listForArbiter()) — there is no way to pass a
   * different arbiter's id and see their caseload instead of your own.
   */
  async listDisputes(pagination?: {
    limit?: number;
    offset?: number;
  }): Promise<PaginatedDisputes> {
    return this.transport.get<PaginatedDisputes>(
      "/v1/settlement/disputes",
      { limit: pagination?.limit, offset: pagination?.offset },
      true,
    );
  }

  /**
   * Requires an active session — same Missão 06.8 fix as get() above,
   * same reason: this route is now party/arbiter-scoped server-side, not
   * a public read, and this call 401'd unconditionally until fixed.
   */
  async getDispute(disputeId: string): Promise<Dispute> {
    return this.transport.get<Dispute>(
      `/v1/settlement/disputes/${disputeId}`,
      undefined,
      true,
    );
  }

  /**
   * M10 SDK Adapter — the historical semantic read surface. Answers
   * "what did Core actually authorize for this dispute's specific
   * appeal round," not "what is the dispute's current state"
   * (`getDispute()` above — see `Dispute.ruling`'s own JSDoc for why
   * that field is a convenience/current representation only).
   * `appealRound` is required and never defaulted, matching the
   * server route's own deliberate choice not to guess which historical
   * round a caller means.
   *
   * Throws `SailsNotFoundError` when no semantic record exists for this
   * `(disputeId, appealRound)` pair. This is DELIBERATELY distinguishable
   * from `conditionResult: 'UNKNOWN'`, which only ever appears inside a
   * successful response for a record that DOES exist — never treat a
   * `SailsNotFoundError` here as equivalent to an `UNKNOWN` condition
   * result; they answer different questions ("does a decision exist"
   * vs. "was Core's own evaluation of it certain").
   *
   * Authorized readers: the trade's buyer or seller only — narrower
   * than `getDispute()`. Neither the dispute's current arbiter nor the
   * specific historical actor who made this decision receives implicit
   * read access here; see the server route's own comment
   * (`settlement.routes.ts`) for why — economic authority to decide is
   * a different question from information-access authority to read
   * about the decision, and this is currently an open policy question,
   * not silently resolved either way.
   *
   * This method performs zero interpretation: it returns exactly what
   * the server's authoritative record contains, unmodified. It never
   * evaluates, infers, or reconstructs protocol meaning — the actual
   * evaluators live in `@sails/core` (internal, unpublished, never
   * imported by this SDK).
   */
  async getSemanticRecord(
    disputeId: string,
    appealRound: number,
  ): Promise<DisputeRulingSemanticRecord> {
    return this.transport.get<DisputeRulingSemanticRecord>(
      `/v1/settlement/disputes/${disputeId}/semantic-record`,
      { appealRound },
      true,
    );
  }

  /**
   * Requires an active session. The client-held-keys write path for
   * MULTISIG/LIGHTNING_HODL escrow — submit only the public half of a
   * keypair generated via `generateEscrowKeypair()` (`escrow-key.ts`);
   * the private key never leaves the caller. Once both the trade's buyer
   * and seller have each called this once, the server derives and
   * persists the real deposit address (`Escrow.multisigAddr`) — see
   * `escrow.service.ts`'s `submitParticipantKey()`.
   *
   * `capabilityProfile` (Missão 11 Fase 9.1 §4/§5, fail-closed since Fase
   * 9.1.1) is a self-declared statement of which capability bundle this
   * caller's own client implements — pass `MULTISIG_CAPABILITY_PROFILE_V1`
   * (re-exported from this module) if the caller is this SDK's own
   * reference flow. **For a MULTISIG escrow specifically, this is not
   * optional in practice**: the server rejects the commit (deposit-address
   * derivation) once both parties' keys exist unless BOTH declared a
   * known, compatible profile — an omitted declaration blocks exactly
   * like an unrecognized one (`capability-profile.ts`'s own header
   * comment on the server side has the full CTO decision). Escrow types
   * with no wired requirement (LIGHTNING_HODL/SAFE_GUARD_EVM today)
   * still accept an omitted value with no effect.
   */
  async submitKey(
    escrowId: string,
    pubkeyHex: string,
    capabilityProfile?: string,
  ): Promise<{
    escrow: Escrow;
    buyerKeySubmitted: boolean;
    sellerKeySubmitted: boolean;
  }> {
    return this.transport.post(
      `/v1/settlement/escrow/${escrowId}/submit-key`,
      { pubkey: pubkeyHex, ...(capabilityProfile ? { capabilityProfile } : {}) },
      true,
    );
  }

  /** Requires an active session. CREATED -> FUNDS_LOCKED. */
  async lock(escrowId: string): Promise<Escrow> {
    return this.transport.post<Escrow>(
      `/v1/settlement/escrow/${escrowId}/lock`,
      undefined,
      true,
    );
  }

  /** Requires an active session. FUNDS_LOCKED -> PAYMENT_PENDING. */
  async markPaymentSent(escrowId: string): Promise<Escrow> {
    return this.transport.post<Escrow>(
      `/v1/settlement/escrow/${escrowId}/payment-sent`,
      undefined,
      true,
    );
  }

  /** Requires an active session. PAYMENT_PENDING (or PENDING_BANK_SETTLEMENT) -> COMPLETED. */
  async release(escrowId: string, toAddress: string): Promise<Escrow> {
    return this.transport.post<Escrow>(
      `/v1/settlement/escrow/${escrowId}/release`,
      { toAddress },
      true,
    );
  }

  /** Requires an active session. -> DISPUTED, persists a Dispute row and assigns an arbiter (RFC-007 D4). */
  async dispute(
    escrowId: string,
    reason: string,
    evidence?: unknown[],
  ): Promise<Dispute> {
    return this.transport.post<Dispute>(
      `/v1/settlement/escrow/${escrowId}/dispute`,
      { reason, evidence },
      true,
    );
  }

  /**
   * Missão 11 Fase 8.1 LB-05 — the public SDK wrapper for the seller-only
   * expiry-recovery route (`POST /v1/settlement/escrow/:id/initiate-
   * expiry-recovery`), previously reachable only via a raw, undocumented
   * HTTP call. No privileged bypass: this hits the exact same route any
   * compatible wallet can call through the public protocol contract.
   *
   * Eligibility (server-enforced, not re-validated client-side — this
   * method exists to make the call reachable, not to duplicate the
   * server's own authorization logic): the escrow's status must be
   * `EXPIRED` (only reached from `FUNDS_LOCKED` once its own timelock has
   * genuinely passed with no cooperative resolution), and the
   * authenticated caller must be this trade's seller — the only party
   * with locked collateral at stake in this specific state. A caller who
   * doesn't meet either condition receives the server's own rejection
   * (a `ValidationError`/`ForbiddenError`-mapped response), not a
   * generic failure.
   *
   * Reuses the existing dispute machinery server-side — the returned
   * `Dispute` is a real dispute row (`status: 'OPENED'`), resolved
   * through the same arbiter/ruling flow (`resolveDispute()`,
   * `getDisputeService()`) every other dispute already is. There is no
   * separate "recovery" resolution path to poll; check the returned
   * dispute's own status/ruling the same way `dispute()`'s result would
   * be checked.
   */
  async initiateExpiryRecovery(escrowId: string): Promise<Dispute> {
    return this.transport.post<Dispute>(
      `/v1/settlement/escrow/${escrowId}/initiate-expiry-recovery`,
      undefined,
      true,
    );
  }

  /** Requires an active session. -> REFUNDED. */
  async refund(escrowId: string): Promise<Escrow> {
    return this.transport.post<Escrow>(
      `/v1/settlement/escrow/${escrowId}/refund`,
      undefined,
      true,
    );
  }

  /**
   * Phase 2 (2026-07-27), MULTISIG only. Requires an active session AND
   * the same authorization release() already requires (seller, or the
   * assigned dispute arbiter). Builds and persists an unsigned release
   * PSBT server-side — does NOT move funds or transition the escrow by
   * itself. Each id in the response's `requiredSigners` must call
   * `submitTransactionSignature()` with their own signed copy
   * (`signEscrowPsbt()`, `escrow-key.ts`) before the release actually
   * completes.
   */
  async initiateRelease(
    escrowId: string,
    toAddress: string,
  ): Promise<EscrowPendingTransaction> {
    return this.transport.post(
      `/v1/settlement/escrow/${escrowId}/initiate-release`,
      { toAddress },
      true,
    );
  }

  /** Mirror of initiateRelease() above, for refund. */
  async initiateRefund(escrowId: string): Promise<EscrowPendingTransaction> {
    return this.transport.post(
      `/v1/settlement/escrow/${escrowId}/initiate-refund`,
      undefined,
      true,
    );
  }

  /**
   * Submits the caller's own independently-signed copy of the pending
   * transaction's unsigned PSBT (sign it first with `signEscrowPsbt()`).
   * `complete: true` in the response means every required signer has now
   * submitted and the escrow has actually finalized (combined, broadcast,
   * and transitioned) — check `getPendingTransaction()`/`get()` for the
   * resulting `txReleaseId` if needed.
   */
  async submitTransactionSignature(
    escrowId: string,
    signedPsbtBase64: string,
  ): Promise<{ complete: boolean }> {
    return this.transport.post(
      `/v1/settlement/escrow/${escrowId}/submit-transaction-signature`,
      { signedPsbtBase64 },
      true,
    );
  }

  /** No active session required. Throws SailsNotFoundError if no signing round is in flight for this escrow. */
  async getPendingTransaction(
    escrowId: string,
  ): Promise<EscrowPendingTransaction> {
    return this.transport.get(
      `/v1/settlement/escrow/${escrowId}/pending-transaction`,
    );
  }

  /**
   * Requires an active session AND that the caller is the dispute's
   * assigned arbiter (RFC-007 D4) — the server rejects this otherwise.
   * `releaseToAddress` is required when `ruling` is `'RELEASE'`.
   *
   * RFC-021 D9 (2026-08-02) — for `ruling: 'SPLIT'`, all three of
   * `releaseToAddress` (buyer's payout), `refundToAddress` (seller's
   * payout), and `splitBuyerBps` (buyer's share, out of 10000 — the
   * seller gets the exact remainder) are required. Only supported for
   * escrows backed by MOCK, WDK_USDT_EVM, or MULTISIG — SAFE_GUARD_EVM's
   * immutable Guard contract and LIGHTNING_HODL's fixed-leaf VtxoScript
   * each have a real, provider-specific reason they can't represent a
   * partial payout (see each provider's own source for the full
   * reasoning); the server returns a clear error for those, not a silent
   * no-op.
   *
   * Missão 13 Fase 2 (INV-12) — `docs/API_STABLE.md`'s own additive-only
   * precedent for this exact method (new params appended at the end,
   * same as `refundToAddress`/`splitBuyerBps` before it): the server now
   * REQUIRES a signed authority decision (see `AuthorityDecisionInput`'s
   * own header comment above), so these two new trailing params are not
   * optional in the sense of "may be omitted" — they're the manual/
   * advanced path for a caller who already has a signature (e.g. an
   * offline-signing flow). Most callers should use
   * `resolveDisputeWithWallet()` below instead, which builds and signs
   * the decision automatically.
   */
  async resolveDispute(
    disputeId: string,
    ruling: DisputeRuling,
    releaseToAddress?: string,
    refundToAddress?: string,
    splitBuyerBps?: number,
    authoritySignature?: string,
    authorityIssuedAt?: string,
  ): Promise<Dispute> {
    if (ruling === "SPLIT") {
      if (
        !releaseToAddress ||
        !refundToAddress ||
        splitBuyerBps === undefined
      ) {
        throw new SailsValidationError(
          'resolveDispute() with ruling "SPLIT" requires releaseToAddress, refundToAddress, and splitBuyerBps',
        );
      }
    } else if (ruling === "RELEASE") {
      if (!releaseToAddress) {
        throw new SailsValidationError(
          'resolveDispute() with ruling "RELEASE" requires releaseToAddress',
        );
      }
    }
    if (!authoritySignature || !authorityIssuedAt) {
      throw new SailsValidationError(
        'resolveDispute() requires authoritySignature and authorityIssuedAt (Missão 13 Fase 2, INV-12) — ' +
          "use resolveDisputeWithWallet() to have the SDK build and sign this automatically, " +
          "or construct it yourself with canonicalizeAuthorityDecision()/hashAuthorityDecision().",
      );
    }
    return this.transport.post<Dispute>(
      `/v1/settlement/disputes/${disputeId}/resolve`,
      { ruling, releaseToAddress, refundToAddress, splitBuyerBps, authoritySignature, authorityIssuedAt },
      true,
    );
  }

  /**
   * Missão 13 Fase 2 (INV-12) — the convenience path most callers should
   * use: fetches the dispute (for its `escrowId`/`appealRound`/
   * `arbiterId`), builds the canonical authority decision, and asks
   * `wallet.signMessage()` to sign it — the caller's private key never
   * leaves their own wallet, the same shape `proof.ts`'s
   * `attachEvidence()` already established. Throws `SailsValidationError`
   * if the dispute has no assigned arbiter yet (nothing to attribute a
   * decision to) — same validation as `resolveDispute()` otherwise.
   */
  async resolveDisputeWithWallet(
    disputeId: string,
    ruling: DisputeRuling,
    // Same minimal-interface convention identity.ts's
    // `authenticateWithWallet()` already established — signing an
    // authority decision only ever needs `signMessage()`, never the full
    // `WalletAdapter` surface (balances, transactions, peer id, ...), so
    // a caller isn't forced to implement methods this call never touches.
    wallet: Pick<WalletAdapter, "signMessage">,
    releaseToAddress?: string,
    refundToAddress?: string,
    splitBuyerBps?: number,
  ): Promise<Dispute> {
    const dispute = await this.getDispute(disputeId);
    if (!dispute.arbiterId) {
      throw new SailsValidationError(
        `Dispute ${disputeId} has no assigned arbiter yet — cannot produce an authority decision for it`,
      );
    }
    const authorityIssuedAt = new Date().toISOString();
    const buyerBps = ruling === "SPLIT" ? (splitBuyerBps ?? null) : null;
    const digest = hashAuthorityDecision({
      disputeId,
      escrowId: dispute.escrowId,
      appealRound: dispute.appealRound,
      authorityId: dispute.arbiterId,
      outcome: ruling,
      buyerBps,
      issuedAt: authorityIssuedAt,
    });
    const signatureBytes = await wallet.signMessage(digest);
    return this.resolveDispute(
      disputeId,
      ruling,
      releaseToAddress,
      refundToAddress,
      splitBuyerBps,
      bytesToHex(signatureBytes),
      authorityIssuedAt,
    );
  }

  /**
   * RFC-021 D6 — requires an active session AND that the caller is a
   * party to the trade. Only meaningful when the server is configured
   * with ARBITRATION_MODE=market. `appealFeeRequired` is informational
   * (see dispute.service.ts's own header comment) — this call does not
   * itself collect payment.
   */
  async appealDispute(
    disputeId: string,
  ): Promise<{ dispute: Dispute; appealFeeRequired: string }> {
    return this.transport.post(
      `/v1/settlement/disputes/${disputeId}/appeal`,
      undefined,
      true,
    );
  }

  /**
   * RFC-021 D8 — requires an active session AND that the caller is a
   * party to the trade. Attaches more evidence to an already-open
   * dispute (raiseDispute()'s own initial `evidence` param only covers
   * what existed at open time). May trigger a QVAC auto-resolution
   * attempt server-side (config-gated, opt-in per deployment) — this
   * call itself never returns a ruling, only the updated Dispute row.
   */
  async submitDisputeEvidence(
    disputeId: string,
    descriptor: { type: string; uri?: string; note?: string },
  ): Promise<Dispute> {
    return this.transport.post<Dispute>(
      `/v1/settlement/disputes/${disputeId}/evidence`,
      descriptor,
      true,
    );
  }

  /**
   * RFC-021 D8 — requires an active session AND that the caller is a
   * party to the trade. Rejects a proposed automated ruling while the
   * dispute is `AUTO_PROPOSED` and its contest window hasn't closed,
   * forcing the dispute back onto its already-assigned human arbiter —
   * no new arbiter assignment happens as a result of this call.
   */
  async contestAutoResolution(disputeId: string): Promise<Dispute> {
    return this.transport.post<Dispute>(
      `/v1/settlement/disputes/${disputeId}/contest`,
      undefined,
      true,
    );
  }

  /**
   * RFC-015 — two-person control. Records the calling participant's
   * approval for a MULTISIG escrow release. `release()` checks
   * `escrowService.hasDualApproval()` itself (gated behind
   * `config.features.requireDualApprovalForRelease`) rather than
   * this route enforcing anything directly — this route's only
   * job is recording "who approved," not deciding when release is
   * allowed to proceed.
   */
  async approveRelease(
    escrowId: string,
  ): Promise<{ approval: ReleaseApproval; readyToRelease: boolean }> {
    return this.transport.post(
      `/v1/settlement/escrow/${escrowId}/approve-release`,
      undefined,
      true,
    );
  }

  /**
   * Returns the list of participants who have approved release for
   * this escrow, and whether enough approvals exist for the release
   * to proceed. No active session required — same as get() above
   * for escrows (read-only, no participant-scoping).
   */
  async getReleaseApprovals(escrowId: string): Promise<ReleaseApprovalsResult> {
    return this.transport.get(
      `/v1/settlement/escrow/${escrowId}/release-approvals`,
    );
  }

  /**
   * RFC-021 D2 — permissionless arbiter registration. No approval
   * step: the caller registers themselves, matching
   * MarketArbitrationProvider's own real logic. Works regardless of
   * config.settlement.arbitrationMode (a participant can register
   * collateral/reputation ahead of a deployment switching modes) —
   * only assign() itself is mode-gated.
   */
  async registerArbiter(input: {
    monetaryCollateral: string;
    collateralAsset?: string;
  }): Promise<ArbiterProfile> {
    return this.transport.post<ArbiterProfile>(
      "/v1/settlement/arbitration/register",
      input,
      true,
    );
  }

  /** Public read — no session required. */
  async getArbiterProfile(
    participantId: string,
  ): Promise<ArbiterProfile | null> {
    return this.transport.get<ArbiterProfile | null>(
      `/v1/settlement/arbitration/profile/${participantId}`,
    );
  }

  /**
   * Requires an active session. Registers/overwrites the caller's own
   * payout address for a given asset (idempotent upsert) — once set,
   * `resolveDispute()`/`releaseFunds()`/`splitFunds()` no longer require
   * an explicit `releaseToAddress` for this asset (`escrow.service.ts`'s
   * `resolvePayoutAddress()` falls back to this).
   */
  async setPayoutAddress(input: {
    asset: AssetType;
    address: string;
  }): Promise<PayoutAddress> {
    return this.transport.post<PayoutAddress>(
      "/v1/settlement/payout-addresses",
      input,
      true,
    );
  }

  /**
   * Public read, no session required — a counterparty legitimately
   * needs to look up who they're paying.
   *
   * Missão 11 Fase 9.3.4 — narrowed from `PayoutAddress` to
   * `PublicPayoutAddress`: the server no longer returns `id`/
   * `createdAt`/`updatedAt` here at all (a privacy-minimization fix,
   * not a client-side filter). No known caller of this SDK read those
   * fields from this method's result.
   */
  async getPayoutAddress(
    participantId: string,
    asset: AssetType,
  ): Promise<PublicPayoutAddress> {
    return this.transport.get<PublicPayoutAddress>(
      `/v1/settlement/payout-addresses/${participantId}/${asset}`,
    );
  }
}
