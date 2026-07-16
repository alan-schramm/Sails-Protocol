/**
 * Lightspark Grid Integration — Sails OpenSettlement
 * 03-implementation_plan.md section 5.
 *
 * STUB — real Lightspark Grid API integration needs real API
 * credentials/endpoint docs, neither available nor verifiable in this
 * environment. Structured the same way `LightningHodlProvider`
 * (escrow.service.ts) and `HodlHodlProvider` (liquidity.service.ts) already
 * handle an unverified external integration: throw "not yet implemented"
 * rather than fake a working response.
 *
 * What IS real here: the event-driven wiring itself — `intent.matched`
 * (PROTOCOL_SPECIFICATION.md §2.5) triggers an invoice request and, on
 * success, transitions the Intent to SETTLING via
 * `core/intent-engine.ts`'s `transition()`. Swapping the stub for a real
 * Lightspark SDK call is a one-line change inside `requestInvoice()`, not
 * a rewrite of this file's structure.
 */
import { eventBus } from '../../common/events/event-bus'
import { intentEngine } from '../../core/intent-engine'

export interface LightsparkInvoiceRequest {
  intentId: string
  amount: string   // decimal string (RFC-009) — never a JS number
  memo?: string
}

export interface LightsparkInvoice {
  invoiceId: string
  paymentRequest: string   // BOLT11
  expiresAt: Date
}

export interface LightsparkClient {
  requestInvoice(req: LightsparkInvoiceRequest): Promise<LightsparkInvoice>
}

export class StubLightsparkClient implements LightsparkClient {
  async requestInvoice(_req: LightsparkInvoiceRequest): Promise<LightsparkInvoice> {
    throw new Error(
      'Lightspark Grid integration not yet implemented — needs real API ' +
      'credentials and endpoint documentation (03-implementation_plan.md ' +
      'section 5). Wire a real LightsparkClient implementation here once ' +
      "available; nothing else in this file's structure needs to change."
    )
  }
}

export const lightsparkClient: LightsparkClient = new StubLightsparkClient()

// Registered separately from common/events/handlers.ts's generic dispatcher
// on purpose — that file is reserved for simple cross-module reactions
// (its own doc comment), not module-specific integration logic. OpenSettlement
// owns this reaction; it lives in OpenSettlement's own file.
export function registerLightsparkHandlers(): void {
  eventBus.on('intent.matched', async (payload) => {
    const { intentId } = payload
    try {
      const invoice = await lightsparkClient.requestInvoice({
        intentId,
        amount: '0', // TODO: derive from the matched terms once Discovery/Negotiation populate them (§1.3/§1.4)
      })
      await intentEngine.transition(intentId, 'SETTLING', 'system:lightspark', 'intent.settling', {
        intentId,
        settlementId: invoice.invoiceId,
      })
    } catch (err) {
      // Expected today — the stub always throws. Logged, not swallowed
      // silently, and deliberately NOT auto-transitioned to FAILED: that
      // would misrepresent "this integration isn't built yet" as "a real
      // Lightspark call failed," which is a different, meaningful state
      // for whoever's reading Intent status later.
      console.error(
        `[Lightspark] requestInvoice failed for intent ${intentId} (stub not yet implemented):`,
        err instanceof Error ? err.message : err
      )
    }
  })
}
