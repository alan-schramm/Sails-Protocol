/**
 * Escrow lifecycle in isolation — create, lock, mark-payment-sent,
 * release (settlement.routes.ts). The brief's "create + deposit +
 * release" doesn't map to a literal endpoint named "deposit" — the real
 * route is `lock` (CREATED -> FUNDS_LOCKED, settlement.routes.ts), and
 * `release` genuinely requires the PAYMENT_PENDING state in between
 * (settlement.ts's own doc comment: "PAYMENT_PENDING ... -> COMPLETED"),
 * so `payment-sent` is included even though the brief's 3-step summary
 * didn't name it — omitting it would make every `release` call 400 for
 * a real, load-bearing reason, not an edge case.
 *
 * A trade+escrow is a real 1:1 relationship (Trade.escrowId) — an
 * escrow can't be exercised repeatedly against one shared trade the way
 * intent-creation.js reuses one shared identity, so each iteration here
 * still needs its own fresh buyer/seller/offer/trade as setup overhead.
 * That setup is intentionally unmeasured/untagged here (default k6 http
 * metrics still capture it, but the escrow-specific custom metrics only
 * track the four escrow calls) — this file's whole point is escrow
 * throughput, not offer/trade throughput (intent-creation.js and
 * trade-lifecycle.js already cover those).
 */
import { check } from 'k6'
import http from 'k6/http'
import { BASE_URL, baseOptions } from '../k6.config.js'
import { generateTestUser, generateTestOffer, authHeaders } from '../utils/data-generator.js'
import { escrowLifecycleDuration, escrowSuccessRate, recordFlow } from '../utils/metrics.js'
import { standard } from '../utils/thresholds.js'

function setupTradeForEscrow() {
  const seller = generateTestUser(BASE_URL, 'escrow-seller')
  const buyer = generateTestUser(BASE_URL, 'escrow-buyer')
  if (!seller || !buyer) return null

  const offerRes = http.post(`${BASE_URL}/v1/liquidity/offers`, JSON.stringify(generateTestOffer()), {
    ...authHeaders(seller),
    tags: { name: 'escrow_setup_offer' },
  })
  if (offerRes.status !== 201) return null
  const offerId = offerRes.json('data.id')

  const tradeRes = http.post(`${BASE_URL}/v1/openp2p/trades`, JSON.stringify({ offerId, amount: '1' }), {
    ...authHeaders(buyer),
    tags: { name: 'escrow_setup_trade' },
  })
  if (tradeRes.status !== 201) return null

  return { seller, buyer, tradeId: tradeRes.json('data.id') }
}

/** The measured part: create -> lock -> payment-sent -> release, against one real, freshly-set-up trade. */
export function run() {
  const ctx = setupTradeForEscrow()
  if (!ctx) {
    escrowSuccessRate.add(0)
    return
  }
  const { seller, buyer, tradeId } = ctx
  const started = Date.now()

  const createRes = http.post(
    `${BASE_URL}/v1/settlement/escrow`,
    JSON.stringify({ tradeId, type: 'MOCK', lockedAmount: '1', asset: 'USDT_ERC20' }),
    { ...authHeaders(seller), tags: { name: 'escrow_create' } }
  )
  if (!check(createRes, { 'escrow create: 201': (r) => r.status === 201 })) {
    escrowSuccessRate.add(0)
    return
  }
  const escrowId = createRes.json('data.id')

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

  recordFlow({
    successRate: escrowSuccessRate,
    duration: escrowLifecycleDuration,
    durationMs: Date.now() - started,
    ok: locked && markedPaid && released,
    response: releaseRes,
  })
}

export const options = {
  ...baseOptions,
  scenarios: {
    escrow_operations: {
      executor: 'constant-vus',
      vus: 15,
      duration: '30s',
    },
  },
  thresholds: standard,
}

export default function () {
  run()
}
