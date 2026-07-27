/**
 * "Simula reconexões P2P" — real coverage requires a real HTTP endpoint,
 * which did not exist when Fase 4 started: RFC-011's own reference
 * implementation plan named `POST /v1/openp2p/trades/:id/reconcile` as
 * future work, and reconciliation.service.ts's own doc comment said the
 * same ("exists for a future HTTP endpoint"). The actual P2P
 * reconnection trigger (pear.service.ts's HyperDHT handshake handler) is
 * an internal event-bus reaction, not HTTP — k6 only speaks HTTP/WS, so
 * it genuinely cannot drive that trigger directly. Wiring the real
 * route (trade.routes.ts) was done as a Fase 4 follow-up specifically so
 * this file tests something real instead of a fake substitute — see
 * that route's own comment for the auth/ownership details.
 *
 * `setup()` builds ONE real trade once (not per-iteration, unlike
 * trade-lifecycle.js/escrow-operations.js): reconcile is a read-only,
 * idempotent catch-up query — repeatedly reconciling the same ongoing
 * trade is exactly what "many reconnects against ongoing trades" means,
 * not a reason to manufacture a fresh trade every time.
 */
import { check } from 'k6'
import http from 'k6/http'
import { BASE_URL, baseOptions } from '../k6.config.js'
import { generateTestUser, generateTestOffer, authHeaders } from '../utils/data-generator.js'
import { reconciliationDuration, reconciliationSuccessRate, recordFlow } from '../utils/metrics.js'
import { standard } from '../utils/thresholds.js'

export function setup() {
  const seller = generateTestUser(BASE_URL, 'reconcile-seller')
  const buyer = generateTestUser(BASE_URL, 'reconcile-buyer')
  if (!seller || !buyer) throw new Error('setup: could not authenticate seller/buyer')

  const offerRes = http.post(`${BASE_URL}/v1/liquidity/offers`, JSON.stringify(generateTestOffer()), authHeaders(seller))
  if (offerRes.status !== 201) throw new Error(`setup: offer publish failed (${offerRes.status})`)
  const offerId = offerRes.json('data.id')

  const tradeRes = http.post(`${BASE_URL}/v1/openp2p/trades`, JSON.stringify({ offerId, amount: '1' }), authHeaders(buyer))
  if (tradeRes.status !== 201) throw new Error(`setup: trade start failed (${tradeRes.status})`)

  // A little real chat history to actually exercise missedMessages —
  // an empty array would still be a "correct" response, but a less
  // meaningful one to load-test against. Best-effort: chat.routes.ts's
  // WS send isn't what this file is testing, so a REST-side send isn't
  // wired here; reconcile still returns real trade/escrow status either
  // way.
  return { seller, buyer, tradeId: tradeRes.json('data.id') }
}

/** One real reconcile call, alternating which of the two real trade participants is the caller. */
export function run(data, callerOverride) {
  const caller = callerOverride || (Math.random() < 0.5 ? data.seller : data.buyer)
  const res = http.post(`${BASE_URL}/v1/openp2p/trades/${data.tradeId}/reconcile`, JSON.stringify({}), {
    ...authHeaders(caller),
    tags: { name: 'reconcile' },
  })
  const ok = check(res, { 'reconcile: 200': (r) => r.status === 200 })
  recordFlow({ successRate: reconciliationSuccessRate, duration: reconciliationDuration, durationMs: res.timings.duration, ok, response: res })
}

export const options = {
  ...baseOptions,
  scenarios: {
    reconciliation: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: standard,
}

export default function (data) {
  run(data)
}
