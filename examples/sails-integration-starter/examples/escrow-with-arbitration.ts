/**
 * Fase 6 — dispute/arbitration example: a trade goes wrong, the buyer
 * raises a dispute (`settlement.dispute`), and a Trusted Arbitrator
 * (RFC-007 D4) resolves it (`settlement.resolveDispute`) — the real
 * escalation path, not a simulated one.
 *
 * Real, load-bearing setup requirement this script depends on and
 * documents rather than hides: `resolveDispute()` only succeeds for
 * whichever participantId the running node's own `TRUSTED_ARBITRATORS`
 * env var lists (`arbitration-provider.ts`'s `TrustedArbitratorProvider`,
 * assigned round-robin in `dispute.service.ts`'s `raiseDispute()`). This
 * script authenticates as a FIXED, deterministic identity (derived from a
 * hardcoded seed below, purely for repeatable local demos — never do this
 * for a real arbiter) specifically so it can be registered once and
 * referenced by the same participantId on every run. Before running this
 * for the first time against a fresh node:
 *
 *   1. Run this script once anyway — it prints the fixed arbiter's
 *      participantId and, if that id isn't in TRUSTED_ARBITRATORS yet,
 *      stops with a clear message instead of guessing or faking a result.
 *   2. Add the printed id to the repo root's `.env`
 *      (`TRUSTED_ARBITRATORS=<id>`) and restart `npm run dev`.
 *   3. Run this script again — it now resolves the dispute for real.
 *
 * Escrow type: unset, same MOCK-by-default reasoning as
 * `p2p-bitcoin-trade.ts` — see that file's header. The dispute/arbitration
 * *protocol* flow exercised here (raiseDispute -> assign -> resolveDispute
 * -> releaseFunds) is identical regardless of which SettlementProvider
 * ultimately moves funds.
 *
 * Run: npm run example:escrow-with-arbitration -w @sails/example-integration-starter
 */
import { createHash } from 'node:crypto'
import nacl from 'tweetnacl'
import { SailsClient, type Ed25519Keypair } from '@sails/sdk'

const BASE_URL = process.env.SAILS_BASE_URL ?? 'http://localhost:3000'

// Deterministic across runs so the same participant (and therefore the
// same participantId, once registered) comes back every time — see the
// header comment above for why that matters here specifically.
const ARBITER_SEED_STRING = 'sails-example-escrow-arbitration-fixed-arbiter-seed-v1'

function fixedArbiterKeypair(): Ed25519Keypair {
  const seed = createHash('sha256').update(ARBITER_SEED_STRING).digest()
  const kp = nacl.sign.keyPair.fromSeed(new Uint8Array(seed))
  return { publicKey: kp.publicKey, secretKey: kp.secretKey }
}

let stepNumber = 0
function step(label: string): void {
  stepNumber += 1
  console.log(`\n[${stepNumber}] ${label}`)
}

async function main() {
  const sellerWallet = new SailsClient({ baseUrl: BASE_URL })
  const buyerWallet = new SailsClient({ baseUrl: BASE_URL })
  const arbiterClient = new SailsClient({ baseUrl: BASE_URL })

  step('Seller registers and authenticates')
  const { keypair: sellerKeypair } = await sellerWallet.identity.create(undefined, 'Escrow Arbitration — Seller')
  await sellerWallet.identity.authenticate(sellerKeypair)

  step('Buyer registers and authenticates')
  const { keypair: buyerKeypair } = await buyerWallet.identity.create(undefined, 'Escrow Arbitration — Buyer')
  await buyerWallet.identity.authenticate(buyerKeypair)

  step('Arbiter authenticates with the fixed demo identity (registers it on first run only)')
  const arbiterKeypair = fixedArbiterKeypair()
  let arbiter
  try {
    const authResult = await arbiterClient.identity.authenticate(arbiterKeypair)
    arbiter = await arbiterClient.identity.get(authResult.participantId)
    console.log(`    fixed arbiter already registered: ${arbiter.id}`)
  } catch {
    const created = await arbiterClient.identity.create(arbiterKeypair, 'Sails Integration Starter — Fixed Demo Arbiter')
    arbiter = created.participant
    await arbiterClient.identity.authenticate(arbiterKeypair)
    console.log(`    fixed arbiter registered for the first time: ${arbiter.id}`)
  }
  console.log(`\n    >>> Arbiter participantId: ${arbiter.id}`)
  console.log('    >>> This must appear in the running node\'s TRUSTED_ARBITRATORS env var (see this file\'s header).\n')

  step('Seller publishes a BTC/SELL offer, buyer opens a trade')
  const offer = await sellerWallet.liquidity.publish({
    asset: 'BTC',
    side: 'SELL',
    priceUsd: '0.01',
    minAmount: '0.001',
    maxAmount: '1',
    paymentMethod: 'PIX',
    paymentDetails: 'escrow-with-arbitration-example-pix-key',
  })
  const trade = await buyerWallet.openp2p.trade(offer.id, '0.01')
  console.log(`    trade ${trade.id} created against offer ${offer.id}`)

  step('Seller creates and locks the escrow, buyer marks payment sent')
  const escrow = await sellerWallet.settlement.create({ tradeId: trade.id, lockedAmount: '0.01', asset: 'BTC' })
  await sellerWallet.settlement.lock(escrow.id)
  await buyerWallet.settlement.markPaymentSent(escrow.id)
  console.log(`    escrow ${escrow.id} locked and payment marked sent`)

  step('Buyer raises a dispute (settlement.dispute) — e.g. seller went silent after payment')
  let dispute
  try {
    dispute = await buyerWallet.settlement.dispute(
      escrow.id,
      'I sent the PIX payment over an hour ago and the seller has not released the escrow or responded in chat.'
    )
  } catch (err) {
    console.error('\nCould not raise the dispute:', err instanceof Error ? err.message : err)
    console.error('This is almost certainly the TRUSTED_ARBITRATORS gap described in this file\'s header — see the arbiter participantId printed above.')
    process.exitCode = 1
    return
  }
  console.log(`    dispute ${dispute.id} opened, assigned to arbiter ${dispute.arbiterId}`)

  if (dispute.arbiterId !== arbiter.id) {
    console.error(
      `\nThe assigned arbiter (${dispute.arbiterId}) is not this script's fixed demo identity (${arbiter.id}). ` +
      'TrustedArbitratorProvider assigns round-robin across every id in TRUSTED_ARBITRATORS — if you\'ve added ' +
      'other arbiters too, re-run this script until it lands on the fixed one, or trim TRUSTED_ARBITRATORS down ' +
      'to just this id for a deterministic demo.'
    )
    process.exitCode = 1
    return
  }

  step('Arbiter reviews and rules RELEASE (funds go to the buyer\'s stated address)')
  const resolved = await arbiterClient.settlement.resolveDispute(dispute.id, 'RELEASE', 'example-buyer-payout-address')
  console.log(`    dispute ${resolved.id} resolved: status=${resolved.status}, ruling=${resolved.ruling}`)

  const finalEscrow = await sellerWallet.settlement.get(escrow.id)
  console.log(`    final escrow status: ${finalEscrow.status}, txReleaseId: ${finalEscrow.txReleaseId ?? '(none — MOCK provider)'}`)

  console.log('\nDone — real dispute -> assign -> resolve -> release flow completed end-to-end.')
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err)
  console.error(`\nIs a Sails node running at ${BASE_URL}? Start one with "npm run dev" from the repo root.`)
  process.exitCode = 1
})
