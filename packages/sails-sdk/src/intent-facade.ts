/**
 * @sails/sdk — Intent-oriented facade (SDK_GUIDE.md section 2's six
 * primary methods; API_REFERENCE.md section 0's "Canonical Intent Verbs").
 *
 * Honesty over completeness, matching this codebase's discipline
 * throughout: `createIntent`/`cancelIntent`/`dispute`/`submitProof`/
 * `releaseAsset` have a real backing route today and are genuinely
 * implemented below. Only `negotiate` still throws
 * `SailsNotImplementedError`, with a specific explanation and a real,
 * working alternative, rather than faking success against a shape that
 * can't actually represent the real channel:
 *
 *   - `negotiate(intentId, event)`: not a missing route (RFC-018
 *     already links an Intent to its Trade — see `dispute()` below,
 *     which uses exactly that link). The real blocker is a shape
 *     mismatch: the canonical signature is a single fire-and-forget
 *     call, but the real negotiation channel (`chat.routes.ts`'s WS
 *     route) is a persistent `WebSocketChannel` a caller keeps open and
 *     listens on — `openp2p.chat(tradeId)`'s actual shape. Forcing this
 *     into "send one event, get one Promise<void> back" would mean
 *     opening and immediately closing a socket per call, which isn't
 *     the same capability — a real fix here needs a canonical signature
 *     change (SDK_GUIDE.md's own shape), same category as
 *     `releaseAsset`'s fix below, just not done in this pass. Use
 *     `openp2p.chat(tradeId)` directly for the real, working channel.
 *
 * Corrected 2026-08-01 — both of the below were previously believed
 * blocked and are not:
 *   - `submitProof(intentId, proof)`: the Proof primitive (RFC-003,
 *     `PROTOCOL_SPECIFICATION.md` §1.8) was believed to have zero HTTP
 *     routes (`docs/BACKLOG.md` P0's own claim) — checked directly
 *     against `src/modules/open-proof/proof.service.ts`/`proof.routes.ts`
 *     and that's false; the full `Claim → Proof → Verification` service
 *     layer and routes are real (dated 2026-07-21, predating the stale
 *     BACKLOG.md claim). Wired below: asserts a `Claim` scoped to this
 *     Intent (the `Claim` model has no `intentId` column of its own, so
 *     it's carried in `assertion` instead — the honest way to link them
 *     without inventing a schema field), then submits `proof.evidence`
 *     as that Claim's real, server-hashed Proof.
 *   - `releaseAsset(intentId)`: not the linkage gap it was once
 *     described as — a real signature gap in `SDK_GUIDE.md`'s own
 *     canonical shape (`releaseAsset(intentId): Promise<Settlement>`
 *     takes no destination address, but the one real release route,
 *     `POST /v1/settlement/escrow/:id/release`, requires `toAddress`
 *     with no default). `docs/API_STABLE.md` explicitly carves these
 *     six-verb methods out of its freeze commitment for exactly this
 *     reason ("their throw-vs-real status is expected to change... that
 *     change is additive, not breaking") — so adding the required
 *     parameter here is the sanctioned fix, not a breaking change.
 *     There is also no `Settlement` type anywhere in this codebase; the
 *     real return value is the `Escrow` `settlement.release()` itself
 *     returns.
 */
import type { SailsTransport } from './transport'
import { SailsNotImplementedError } from './errors'
import type { Intent, IntentStatus, TradeIntentPayload, Trade, Dispute, Proof, Escrow } from './types'

export interface NegotiationEvent {
  type: 'OFFER_PROPOSED' | 'COUNTER_OFFERED' | 'TERMS_ACCEPTED' | 'TERMS_REJECTED' | 'MESSAGE_EXCHANGED'
  [key: string]: unknown
}

export interface ProofSubmission {
  claimType: string
  evidence: unknown
}

export class SailsIntentFacade {
  constructor(private readonly transport: SailsTransport) {}

  /**
   * `participantId` used to be a required third argument here — a
   * deviation from `SDK_GUIDE.md`'s one-argument signature, noted
   * rather than silently hidden. Removed as the SDK-side fix for a real
   * gap found during a codebase audit: the real route
   * (`src/routes/intentRoutes.ts`) accepted `participantId` straight
   * from the request body with no authentication at all, and this SDK
   * method sent no auth header either. The route now derives
   * `participantId` from the authenticated session (`requireAuth`) —
   * call `identity.authenticate()` first (or `client.setSessionToken()`)
   * so `this.transport`'s stored session token is set; `agentId` is
   * still optional and still yours to supply.
   */
  async createIntent(
    type: 'TradeIntent',
    payload: TradeIntentPayload,
    agentId?: string
  ): Promise<Intent<TradeIntentPayload>> {
    return this.transport.post<Intent<TradeIntentPayload>>('/api/v1/intents', { type, payload, agentId }, true)
  }

  async cancelIntent(intentId: string): Promise<void> {
    await this.transport.delete(`/api/v1/intents/${intentId}`, true)
  }

  async negotiate(_intentId: string, _event: NegotiationEvent): Promise<void> {
    throw new SailsNotImplementedError(
      'negotiate(intentId, event) — the canonical signature is a single fire-and-forget call, but the real negotiation channel is a persistent WebSocketChannel (openp2p.chat(tradeId)), not something a single Promise<void> can represent. Use openp2p.chat(tradeId) directly for the real, working negotiation channel.'
    )
  }

  /**
   * Real as of 2026-08-01 — see this file's own header for why this was
   * previously (incorrectly) believed blocked. Two real calls, not one:
   * `Claim` has no `intentId` column, so it's carried in `assertion`
   * instead of inventing a schema field for a one-off caller. Both calls
   * require the same authenticated session (`requireAuth` on both real
   * routes) — `claimedBy`/`submittedBy` are derived server-side from it,
   * never sent by this method.
   */
  async submitProof(intentId: string, proof: ProofSubmission): Promise<Proof> {
    const claim = await this.transport.post<{ id: string }>(
      '/v1/proof/claims',
      { claimType: proof.claimType, assertion: { intentId } },
      true
    )
    return this.transport.post<Proof>(
      '/v1/proof/proofs',
      { claimId: claim.id, evidence: proof.evidence },
      true
    )
  }

  /**
   * Real as of 2026-08-01 — `toAddress` added to the canonical signature
   * (see this file's own header for why that's the sanctioned fix, not
   * a breaking change). Resolves `intentId` to its Trade/Escrow the same
   * way `dispute()` below already does, then calls the one real release
   * route directly.
   */
  async releaseAsset(intentId: string, toAddress: string): Promise<Escrow> {
    const trade = await this.transport.get<Trade>(`/v1/openp2p/trades/by-intent/${intentId}`)
    if (!trade.escrowId) {
      throw new SailsNotImplementedError(
        `releaseAsset(intentId, toAddress) — Trade ${trade.id} (from Intent ${intentId}) has no Escrow yet, nothing to release. Create one first via settlement.create().`
      )
    }
    return this.transport.post<Escrow>(`/v1/settlement/escrow/${trade.escrowId}/release`, { toAddress }, true)
  }

  /**
   * Real as of RFC-018's Intent -> Trade -> Escrow link: resolves
   * `intentId` to the Trade it produced (GET /v1/openp2p/trades/by-intent/
   * :intentId, trade.service.ts's getTradeByIntentId()), then raises the
   * dispute on that Trade's Escrow — the same route
   * `settlement.dispute(escrowId, reason)` calls, so both paths return an
   * identical, real Dispute.
   */
  async dispute(intentId: string, reason: string): Promise<Dispute> {
    const trade = await this.transport.get<Trade>(`/v1/openp2p/trades/by-intent/${intentId}`)
    if (!trade.escrowId) {
      throw new SailsNotImplementedError(
        `dispute(intentId, reason) — Trade ${trade.id} (from Intent ${intentId}) has no Escrow yet, nothing to dispute. Create one first via settlement.create().`
      )
    }
    return this.transport.post<Dispute>(`/v1/settlement/escrow/${trade.escrowId}/dispute`, { reason }, true)
  }
}

export type { Intent, IntentStatus, TradeIntentPayload }
