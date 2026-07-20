/**
 * @sails/sdk — Intent-oriented facade (SDK_GUIDE.md section 2's six
 * primary methods; API_REFERENCE.md section 0's "Canonical Intent Verbs").
 *
 * Honesty over completeness, matching this codebase's discipline
 * throughout: `createIntent`/`cancelIntent`/`dispute` have a real
 * backing route today and are genuinely implemented below. The other
 * three — `negotiate`, `submitProof`, `releaseAsset` — are part of the
 * interface's *shape* (so `SailsClient` type-checks against
 * `SDK_GUIDE.md`'s "canonical — do not diverge from this shape"
 * contract) but throw `SailsNotImplementedError` with a specific
 * explanation and a real, working alternative, rather than faking
 * success against a route that doesn't exist:
 *
 *   - `negotiate(intentId, event)`: not just a missing route (RFC-018
 *     already links an Intent to its Trade — see `dispute()` below,
 *     which uses exactly that link). The real blocker is a shape
 *     mismatch: the canonical signature is a single fire-and-forget
 *     call, but the real negotiation channel (`chat.routes.ts`'s WS
 *     route) is a persistent `WebSocketChannel` a caller keeps open and
 *     listens on — `openp2p.chat(tradeId)`'s actual shape. Forcing this
 *     into "send one event, get one Promise<void> back" would mean
 *     opening and immediately closing a socket per call, which isn't
 *     the same capability. Use `openp2p.chat(tradeId)` directly.
 *   - `submitProof(intentId, proof)`: the Proof primitive (RFC-003,
 *     `PROTOCOL_SPECIFICATION.md` §1.8) has zero HTTP routes in the
 *     reference implementation — `docs/BACKLOG.md` P0 lists it "🔲 Not
 *     started — no tables, no interfaces in code." There is no
 *     alternative to point to; it genuinely does not exist yet.
 *   - `releaseAsset(intentId)`: also not the linkage gap anymore —
 *     found while fixing `dispute()` below, this is a real signature
 *     gap in `SDK_GUIDE.md`'s own canonical shape:
 *     `releaseAsset(intentId): Promise<Settlement>` takes no
 *     destination address, but the one real release route
 *     (`POST /v1/settlement/escrow/:id/release`) requires `toAddress`
 *     in its body (`settlement.routes.ts`'s own zod schema) — there is
 *     no default to fall back to. Closing this needs a decision on
 *     `SDK_GUIDE.md`'s canonical signature itself (add a parameter, or
 *     define where a default address comes from), not more plumbing —
 *     flagged, not fixed here. Use `settlement.release(escrowId,
 *     toAddress)` directly.
 */
import type { SailsTransport } from './transport'
import { SailsNotImplementedError } from './errors'
import type { Intent, IntentStatus, TradeIntentPayload, Trade, Dispute } from './types'

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

  async submitProof(_intentId: string, _proof: ProofSubmission): Promise<never> {
    throw new SailsNotImplementedError(
      'submitProof(intentId, proof) has no backing route — the Proof primitive (RFC-003) has zero HTTP routes in the reference implementation yet (docs/BACKLOG.md P0). There is no working alternative to fall back to.'
    )
  }

  async releaseAsset(_intentId: string): Promise<never> {
    throw new SailsNotImplementedError(
      'releaseAsset(intentId) — the canonical signature takes no destination address, but the real release route (POST /v1/settlement/escrow/:id/release) requires one with no default. This is a signature gap in SDK_GUIDE.md itself, not a missing route. Use settlement.release(escrowId, toAddress) directly.'
    )
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
