import { test, expect, type APIRequestContext } from '@playwright/test'
import nacl from 'tweetnacl'

/**
 * Real concurrency proof — CTO-directed follow-up to the robustness
 * audit (docs/TODO.md §22). That audit fixed a real TOCTOU race in
 * escrow.service.ts/intent-engine.ts by claiming state transitions via
 * an atomic conditional `updateMany()` (WHERE id AND status match)
 * before ever calling the real, side-effecting SettlementProvider. Every
 * test that verified it so far (tests/escrowReleaseControls.test.ts,
 * tests/intentFlow.test.ts) does so with mocked, sequential Prisma calls
 * — real, legitimate unit coverage, but it can't prove the fix holds
 * against real concurrent transactions hitting real Postgres row-level
 * locking. This file is pure HTTP against the real running backend
 * (Playwright's `request` fixture — no browser needed, this never
 * touches the UI), the only way to actually fire N *simultaneous* real
 * requests rather than N sequential mock resolutions.
 *
 * Note this file does NOT use playwright.config.ts's `baseURL`
 * (`http://localhost:5173`, the UI) — every call below targets the
 * backend on 3000 directly via the local `BASE` constant.
 *
 * Two scenarios, matching the CTO's own framing directly:
 *   1. "duplicate escrow / duplicate settlement" — N concurrent release
 *      calls for the ONE SAME escrow. Exactly one may win.
 *   2. "100 ofertas, 100 compradores, 100 trades simultâneos" — scaled
 *      down to a size this environment can run in seconds rather than
 *      minutes, but the same shape: M fully independent trades, created
 *      and settled concurrently, proving no cross-contamination and no
 *      deadlock under real concurrent-but-unrelated load.
 */
const BASE = 'http://localhost:3000'

function bytesToHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex')
}
function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

interface Identity {
  participantId: string
  sessionToken: string
}

async function registerAndAuth(api: APIRequestContext, displayName: string): Promise<Identity> {
  const kp = nacl.sign.keyPair()
  const publicKey = bytesToHex(kp.publicKey)

  const reg = await api.post(`${BASE}/v1/identity/participants`, { data: { publicKey, displayName } })
  expect(reg.ok()).toBe(true)
  const participantId = (await reg.json()).data.id

  const challengeRes = await api.post(`${BASE}/v1/identity/challenge`, { data: { publicKey } })
  expect(challengeRes.ok()).toBe(true)
  const { challenge } = (await challengeRes.json()).data

  const signature = bytesToHex(nacl.sign.detached(utf8ToBytes(challenge), kp.secretKey))
  const authRes = await api.post(`${BASE}/v1/identity/authenticate`, { data: { publicKey, signature } })
  expect(authRes.ok()).toBe(true)
  const { sessionToken } = (await authRes.json()).data

  return { participantId, sessionToken }
}

function auth(identity: Identity) {
  return { headers: { authorization: `Bearer ${identity.sessionToken}` } }
}

async function publishOffer(api: APIRequestContext, seller: Identity, priceUsd: string): Promise<string> {
  const res = await api.post(`${BASE}/v1/liquidity/offers`, {
    ...auth(seller),
    data: {
      asset: 'USDT_ERC20', side: 'SELL', priceUsd, minAmount: '1', maxAmount: '1000',
      paymentMethod: 'PIX', paymentDetails: 'concurrency-test-pix-key',
    },
  })
  expect(res.ok()).toBe(true)
  return (await res.json()).data.id
}

async function createTrade(api: APIRequestContext, buyer: Identity, offerId: string): Promise<string> {
  const res = await api.post(`${BASE}/v1/openp2p/trades`, { ...auth(buyer), data: { offerId, amount: '10' } })
  expect(res.ok()).toBe(true)
  return (await res.json()).data.id
}

// Drives one Trade through escrow creation, lock, and payment-sent — the
// real state right before release, the specific window the audit's fix
// protects.
async function readyEscrowForRelease(api: APIRequestContext, seller: Identity, buyer: Identity, tradeId: string): Promise<string> {
  const created = await api.post(`${BASE}/v1/settlement/escrow`, {
    ...auth(seller), data: { tradeId, lockedAmount: '10', asset: 'USDT_ERC20' },
  })
  expect(created.ok()).toBe(true)
  const escrowId = (await created.json()).data.id

  const locked = await api.post(`${BASE}/v1/settlement/escrow/${escrowId}/lock`, auth(seller))
  expect(locked.ok()).toBe(true)

  const paid = await api.post(`${BASE}/v1/settlement/escrow/${escrowId}/payment-sent`, auth(buyer))
  expect(paid.ok()).toBe(true)

  return escrowId
}

test.describe('Real concurrency — proving the robustness-audit fixes hold under genuine parallel load', () => {
  test('N concurrent release calls for the SAME escrow — exactly one wins, no duplicate settlement', async ({ request }) => {
    const seller = await registerAndAuth(request, 'concurrency-seller-race')
    const buyer = await registerAndAuth(request, 'concurrency-buyer-race')
    const offerId = await publishOffer(request, seller, '2.00')
    const tradeId = await createTrade(request, buyer, offerId)
    const escrowId = await readyEscrowForRelease(request, seller, buyer, tradeId)

    const N = 10
    const releaseCall = () =>
      request.post(`${BASE}/v1/settlement/escrow/${escrowId}/release`, {
        ...auth(seller),
        data: { toAddress: 'concurrency-test-payout-address' },
      })

    // The actual test: fire all N at once, not one after another. If the
    // atomic updateMany() claim in escrow.service.ts's releaseFunds()
    // didn't exist, more than one of these could pass the old in-memory
    // status check before any write landed.
    const responses = await Promise.all(Array.from({ length: N }, releaseCall))
    const statuses = responses.map((r) => r.status())

    const succeeded = statuses.filter((s) => s === 200)
    const rejected = statuses.filter((s) => s !== 200)
    expect(succeeded).toHaveLength(1)
    expect(rejected).toHaveLength(N - 1)
    // Every rejection should be a clean, understood error (the "already
    // transitioned by a concurrent request" EscrowError, HTTP 400/409-
    // shaped by this codebase's error middleware) — not a 500 crash and
    // not, worse, a second silent 200.
    for (const r of responses) {
      if (r.status() !== 200) expect(r.status()).toBeLessThan(500)
    }

    // Confirm the end state is exactly what one real release produces —
    // not "COMPLETED twice," not a corrupted intermediate state.
    const final = await request.get(`${BASE}/v1/settlement/escrow/${escrowId}`, auth(seller))
    const escrow = (await final.json()).data
    expect(escrow.status).toBe('COMPLETED')
    expect(escrow.txReleaseId).toBeTruthy()
  })

  test('M fully independent trades, created and settled concurrently — no cross-contamination, no deadlock', async ({ request }) => {
    const M = 20
    const seller = await registerAndAuth(request, 'concurrency-seller-throughput')

    // M independent buyers — a real marketplace has many counterparties,
    // not one buyer racing itself.
    const buyers = await Promise.all(
      Array.from({ length: M }, (_, i) => registerAndAuth(request, `concurrency-buyer-throughput-${i}`))
    )

    const offerIds = await Promise.all(
      buyers.map((_, i) => publishOffer(request, seller, (1 + i * 0.01).toFixed(2)))
    )

    const tradeIds = await Promise.all(
      buyers.map((buyer, i) => createTrade(request, buyer, offerIds[i]))
    )

    const escrowIds = await Promise.all(
      buyers.map((buyer, i) => readyEscrowForRelease(request, seller, buyer, tradeIds[i]))
    )

    const releaseResults = await Promise.all(
      escrowIds.map((escrowId) =>
        request.post(`${BASE}/v1/settlement/escrow/${escrowId}/release`, {
          ...auth(seller),
          data: { toAddress: 'concurrency-test-payout-address' },
        })
      )
    )

    expect(releaseResults.every((r) => r.ok())).toBe(true)

    // Cross-contamination check: each escrow's final txReleaseId must be
    // unique — if two of these accidentally shared state (e.g. a bug in
    // how the atomic claim scopes by id), duplicate or missing txIds
    // would show up here.
    const finals = await Promise.all(escrowIds.map((id) => request.get(`${BASE}/v1/settlement/escrow/${id}`, auth(seller))))
    const txIds = await Promise.all(finals.map(async (r) => (await r.json()).data.txReleaseId as string))
    expect(new Set(txIds).size).toBe(M)
    expect(txIds.every(Boolean)).toBe(true)
  })
})
