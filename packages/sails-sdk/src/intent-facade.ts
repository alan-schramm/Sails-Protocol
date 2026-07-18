/**
 * @sails/sdk — Intent-oriented facade (SDK_GUIDE.md section 2's six
 * primary methods; API_REFERENCE.md section 0's "Canonical Intent Verbs").
 *
 * Honesty over completeness, matching this codebase's discipline
 * throughout: only `createIntent`/`cancelIntent` have a real backing
 * route today (`src/routes/intentRoutes.ts`) and are genuinely
 * implemented below. The other four — `negotiate`, `submitProof`,
 * `releaseAsset`, `dispute` — are part of the interface's *shape* (so
 * `SailsClient` type-checks against `SDK_GUIDE.md`'s "canonical — do not
 * diverge from this shape" contract) but throw `SailsNotImplementedError`
 * with a specific explanation and a real, working alternative, rather
 * than faking success against a route that doesn't exist:
 *
 *   - `negotiate(intentId, event)`: there is no Intent-keyed negotiation
 *     channel — the real negotiation channel (`chat.routes.ts`'s WS
 *     route, `openp2p.chat.ts`) is Trade-keyed, and no server-side link
 *     from an Intent to the Trade it produced exists yet. Use
 *     `openp2p.chat(tradeId)` directly.
 *   - `submitProof(intentId, proof)`: the Proof primitive (RFC-003,
 *     `PROTOCOL_SPECIFICATION.md` §1.8) has zero HTTP routes in the
 *     reference implementation — `docs/BACKLOG.md` P0 lists it "🔲 Not
 *     started — no tables, no interfaces in code." There is no
 *     alternative to point to; it genuinely does not exist yet.
 *   - `releaseAsset(intentId)` / `dispute(intentId, reason)`: same
 *     Intent -> Trade -> Escrow linkage gap as `negotiate` — the real
 *     routes operate on `escrowId`. Use `settlement.release(escrowId,
 *     toAddress)` / `settlement.dispute(escrowId, reason)` directly.
 */
import type { SailsTransport } from './transport'
import { SailsNotImplementedError } from './errors'
import type { Intent, IntentStatus, TradeIntentPayload } from './types'

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
      'negotiate(intentId, event) has no backing route yet — no server-side link exists from an Intent to the Trade it produced. Use openp2p.chat(tradeId) directly for the real, working negotiation channel.'
    )
  }

  async submitProof(_intentId: string, _proof: ProofSubmission): Promise<never> {
    throw new SailsNotImplementedError(
      'submitProof(intentId, proof) has no backing route — the Proof primitive (RFC-003) has zero HTTP routes in the reference implementation yet (docs/BACKLOG.md P0). There is no working alternative to fall back to.'
    )
  }

  async releaseAsset(_intentId: string): Promise<never> {
    throw new SailsNotImplementedError(
      'releaseAsset(intentId) has no backing route — no server-side link exists from an Intent to the Escrow it should release. Use settlement.release(escrowId, toAddress) directly.'
    )
  }

  async dispute(_intentId: string, _reason: string): Promise<never> {
    throw new SailsNotImplementedError(
      'dispute(intentId, reason) has no backing route — no server-side link exists from an Intent to the Escrow to dispute. Use settlement.dispute(escrowId, reason) directly.'
    )
  }
}

export type { Intent, IntentStatus, TradeIntentPayload }
