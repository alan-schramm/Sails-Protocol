/**
 * Full real trade lifecycle, one complete independent trade per
 * iteration: two fresh Ed25519 identities (buyer+seller) -> seller
 * publishes a real offer -> buyer starts a real trade -> seller creates
 * + locks escrow -> buyer marks payment sent -> seller releases funds.
 * Every real route (liquidity.routes.ts, trade.routes.ts,
 * settlement.routes.ts), no mocked steps — same discipline
 * e2e/flows/p2p-trade-happy-path.spec.ts already established for the
 * browser-driven version of this exact flow.
 *
 * Deliberately a fresh buyer+seller per iteration, not a shared pair
 * from `setup()` (unlike intent-creation.js) — a real marketplace has
 * many independent, unrelated trades happening concurrently, not one
 * pair replaying the same trade; sharing one pair across VUs would also
 * mean every VU racing to escrow-lock/release the exact same row,
 * turning this into an accidental concurrency test (concurrency.spec.ts
 * in e2e/ already covers that, on purpose, not by accident here).
 *
 * No specific req/s target in the brief for this one ("ciclo completo de
 * trade") — each iteration is ~9 real HTTP calls across 2 identities,
 * so this defaults to a modest constant-VUs shape; scenarios/*.js
 * import `run()` to drive it under whichever shape a given scenario
 * needs instead of duplicating this flow.
 */
import { check } from 'k6'
import http from 'k6/http'
import { BASE_URL, baseOptions } from '../k6.config.js'
import { generateTestUser, generateTestOffer, authHeaders } from '../utils/data-generator.js'
import { tradeLifecycleDuration, tradeSuccessRate, escrowLifecycleDuration, escrowSuccessRate, recordFlow } from '../utils/metrics.js'
import { standard } from '../utils/thresholds.js'

/** One full, independent trade lifecycle. Returns nothing — every step's outcome is recorded via check()/recordFlow(). */
export function run() {
  const started = Date.now()
  const seller = generateTestUser(BASE_URL, 'seller')
  const buyer = generateTestUser(BASE_URL, 'buyer')
  if (!seller || !buyer) {
    tradeSuccessRate.add(0)
    return
  }

  const offerRes = http.post(`${BASE_URL}/v1/liquidity/offers`, JSON.stringify(generateTestOffer()), {
    ...authHeaders(seller),
    tags: { name: 'trade_publish_offer' },
  })
  if (!check(offerRes, { 'publish offer: 201': (r) => r.status === 201 })) {
    tradeSuccessRate.add(0)
    return
  }
  const offerId = offerRes.json('data.id')

  const tradeRes = http.post(`${BASE_URL}/v1/openp2p/trades`, JSON.stringify({ offerId, amount: '1' }), {
    ...authHeaders(buyer),
    tags: { name: 'trade_start' },
  })
  if (!check(tradeRes, { 'start trade: 201': (r) => r.status === 201 })) {
    tradeSuccessRate.add(0)
    return
  }
  const tradeId = tradeRes.json('data.id')

  const escrowStarted = Date.now()
  const escrowRes = http.post(
    `${BASE_URL}/v1/settlement/escrow`,
    JSON.stringify({ tradeId, type: 'MOCK', lockedAmount: '1', asset: 'USDT_ERC20' }),
    { ...authHeaders(seller), tags: { name: 'escrow_create' } }
  )
  const escrowCreated = check(escrowRes, { 'escrow create: 201': (r) => r.status === 201 })
  if (!escrowCreated) {
    tradeSuccessRate.add(0)
    escrowSuccessRate.add(0)
    return
  }
  const escrowId = escrowRes.json('data.id')

  const lockRes = http.post(`${BASE_URL}/v1/settlement/escrow/${escrowId}/lock`, '{}', {
    ...authHeaders(seller),
    tags: { name: 'escrow_lock' },
  })
  const locked = check(lockRes, { 'escrow lock: 200': (r) => r.status === 200 })

  const paidRes = http.post(`${BASE_URL}/v1/settlement/escrow/${escrowId}/payment-sent`, '{}', {
    ...authHeaders(buyer),
    tags: { name: 'escrow_payment_sent' },
  })
  const markedPaid = check(paidRes, { 'escrow payment-sent: 200': (r) => r.status === 200 })

  const releaseRes = http.post(
    `${BASE_URL}/v1/settlement/escrow/${escrowId}/release`,
    JSON.stringify({ toAddress: 'k6-test-payout-address' }),
    { ...authHeaders(seller), tags: { name: 'escrow_release' } }
  )
  const released = check(releaseRes, { 'escrow release: 200': (r) => r.status === 200 })

  const escrowOk = locked && markedPaid && released
  recordFlow({ successRate: escrowSuccessRate, duration: escrowLifecycleDuration, durationMs: Date.now() - escrowStarted, ok: escrowOk, response: releaseRes })
  recordFlow({ successRate: tradeSuccessRate, duration: tradeLifecycleDuration, durationMs: Date.now() - started, ok: escrowOk, response: releaseRes })
}

export const options = {
  ...baseOptions,
  scenarios: {
    trade_lifecycle: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
    },
  },
  thresholds: standard,
}

export default function () {
  run()
}
