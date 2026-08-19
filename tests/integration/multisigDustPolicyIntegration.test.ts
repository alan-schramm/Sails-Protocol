// tests/integration/multisigDustPolicyIntegration.test.ts
//
// Missão 10, Fase 4 — real-Postgres proof that a dust-rejected
// release/split leaves NO EscrowPendingTransaction row behind, and
// therefore no signature is ever requested from either party. This is
// the one thing the mocked-explorer unit tests
// (tests/multisigDustPolicy.test.ts) structurally cannot prove: whether
// the real orchestration (escrow-pending-tx.ts's
// initiateSignatureCollectionCore(), through escrowService.initiateRelease()/
// initiateSplit()) actually stops before persisting anything, against a
// real database, not just that buildUnsignedRelease() itself throws.
//
// Same skip-if-unreachable convention every other real-Postgres
// integration test in this repo uses.

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5433/sails_protocol'

describe('MULTISIG dust policy — rejection happens before any pending transaction (real Postgres, Missão 10)', () => {
  jest.setTimeout(30_000)

  let dbAvailable = false
  let prisma: PrismaClient
  let escrowService: import('../../src/modules/open-settlement/escrow.service').EscrowService
  let identityService: typeof import('../../src/modules/open-identity/identity.service').identityService
  let liquidityRouter: typeof import('../../src/modules/open-liquidity/liquidity.service').liquidityRouter
  let tradeService: typeof import('../../src/modules/open-p2p/trade.service').tradeService
  let intentEngine: typeof import('../../src/core/intent-engine').intentEngine
  let OpenP2PTradeIntentHandler: any

  const BUYER_PUBKEY = '021744d7bd3cd8e7f62e7aa8f7db8292680b745d09f8f40377c4bbbc0136d4e299'
  const SELLER_PUBKEY = '038e41e2cb09677fd4bde9f232871533925c4b628c25efdb9d572546293850ddd4'
  const P2WPKH_ADDR = 'bc1q7mrvhs3xxzg9jyesd60nvda26ueukn9nc404xk'
  const RELEASE_FEE_1SAT = 164

  let realFetch: typeof fetch

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL
    process.env.MOCK_ESCROW = 'false'
    process.env.MULTISIG_SEED = process.env.MULTISIG_SEED || 'dust-integrity-test-seed'
    process.env.TRUSTED_ARBITRATORS = process.env.TRUSTED_ARBITRATORS || 'dust-test-arbiter'
    process.env.MULTISIG_NETWORK = 'bitcoin'

    const probe = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })
    try {
      await probe.$queryRaw`SELECT 1`
      dbAvailable = true
    } catch {
      dbAvailable = false
    } finally {
      await probe.$disconnect()
    }
    if (!dbAvailable) return

    ;({ prisma } = require('../../src/common/database'))
    ;({ escrowService } = require('../../src/modules/open-settlement/escrow.service'))
    ;({ identityService } = require('../../src/modules/open-identity/identity.service'))
    ;({ liquidityRouter } = require('../../src/modules/open-liquidity/liquidity.service'))
    ;({ tradeService } = require('../../src/modules/open-p2p/trade.service'))
    ;({ intentEngine } = require('../../src/core/intent-engine'))
    ;({ OpenP2PTradeIntentHandler } = require('../../src/modules/open-p2p/intent-handler'))
    intentEngine.registerHandler(OpenP2PTradeIntentHandler)
  })

  afterAll(async () => {
    if (dbAvailable) await prisma.$disconnect()
  })

  function skip(name: string): boolean {
    if (!dbAvailable) {
      console.warn(`Skipping "${name}" - no real Postgres reachable at ${DATABASE_URL}`)
      return true
    }
    return false
  }

  beforeEach(() => { realFetch = global.fetch })
  afterEach(() => { global.fetch = realFetch })

  it('a dust-triggering initiateRelease() leaves zero EscrowPendingTransaction rows and the escrow status unchanged', async () => {
    if (skip('dust-rejected release leaves no pending row')) return

    const seller = await identityService.register({ publicKey: `dust-seller-${Date.now()}`, displayName: 'Seller' })
    const buyer = await identityService.register({ publicKey: `dust-buyer-${Date.now()}`, displayName: 'Buyer' })
    const offer = await liquidityRouter.createOffer({ userId: seller.id, asset: 'BTC', side: 'SELL', priceUsd: '60000', minAmount: '0.001', maxAmount: '0.001', paymentMethod: 'OTHER' })
    const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: '0.001' })
    // lockedAmount is independent of the trade's own `amount` (no
    // cross-check exists in createEscrow()) — set to exactly the funding
    // UTXO value below (293 + RELEASE_FEE_1SAT sats) so lockFunds()'s own
    // expectedSats() check is satisfied while the resulting release
    // output (293 sats) is deliberately 1 sat under the 294-sat P2WPKH
    // dust threshold.
    const escrow = await escrowService.createEscrow({ tradeId: trade.id, type: 'MULTISIG', lockedAmount: '0.00000457', asset: 'BTC' }, seller.id)
    await escrowService.submitParticipantKey(escrow.id, buyer.id, BUYER_PUBKEY)
    await escrowService.submitParticipantKey(escrow.id, seller.id, SELLER_PUBKEY)

    // Real lockFunds() against a mocked explorer — a real UTXO exists,
    // just small enough that the release output (after the real fee)
    // will be dust.
    // Suffixed with a per-run timestamp — same fix applied to
    // multisigOutpointIntegrity.test.ts: this hits the real, persistent
    // dev Postgres, so a fixed literal txid would collide with a
    // previous run's own claimed outpoint on any second consecutive run.
    const dustTxid = `dust${Date.now().toString(36)}`.padEnd(64, 'e')
    global.fetch = jest.fn(async (url: any) => {
      if (String(url).includes('/fees/recommended')) return { ok: true, json: async () => ({ halfHourFee: 1 }) } as any
      return { ok: true, json: async () => [{ txid: dustTxid, vout: 0, value: 293 + RELEASE_FEE_1SAT, status: { confirmed: true } }] } as any
    }) as any
    await escrowService.lockFunds(escrow.id, seller.id)
    await escrowService.markPaymentSent(escrow.id, buyer.id)

    const beforeEscrow = await prisma.escrow.findUnique({ where: { id: escrow.id } })
    expect(beforeEscrow!.status).toBe('PAYMENT_PENDING')

    await expect(escrowService.initiateRelease(escrow.id, P2WPKH_ADDR, seller.id)).rejects.toThrow(/below the 294-sat dust threshold/)

    // The real proof: no pending transaction was ever persisted, and the
    // escrow's own status is untouched (initiateRelease() never even
    // reaches assertEscrowTransition/claim for this escrow type's flow —
    // the provider throws before initiateSignatureCollectionCore()'s own
    // prisma.escrowPendingTransaction.create() call).
    const pending = await prisma.escrowPendingTransaction.findUnique({ where: { escrowId: escrow.id } })
    expect(pending).toBeNull()

    const afterEscrow = await prisma.escrow.findUnique({ where: { id: escrow.id } })
    expect(afterEscrow!.status).toBe('PAYMENT_PENDING') // unchanged — never touched COMPLETED
    expect(afterEscrow!.txReleaseId).toBeNull()
  })
})
