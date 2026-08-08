/**
 * Sails Protocol — Ensaio: MULTISIG real em Bitcoin testnet
 *
 * A full non-custodial MULTISIG escrow lifecycle (createEscrow → client
 * keys → real testnet funding → lockFunds → cooperative release), run
 * against the real testnet3 network via multisig.provider.ts and a real
 * public explorer (config.multisig.explorerApiUrl, mempool.space/testnet
 * by default) — not a simulation of the provider, the actual provider.
 * Zero financial risk: testnet coins have no market value.
 *
 * Requires MOCK_ESCROW=false (createEscrow()'s own `recommendedEscrowType`
 * fallback and submitParticipantKey()'s deposit-address derivation both
 * gate on this — see escrow.service.ts) plus a real MULTISIG_SEED and one
 * TRUSTED_ARBITRATORS entry (multisig.provider.ts's getMaster()/
 * defaultArbiterId() throw a clear error naming exactly what's missing
 * otherwise — this script does not work around that, it relies on it).
 * None of these three values need to be secret for a testnet rehearsal —
 * still generate a real MULTISIG_SEED rather than reusing a well-known
 * string, since it derives the on-chain arbiter key baked into the
 * script this run actually broadcasts against.
 *
 * The buyer/seller secp256k1 keypairs are generated with the exact same
 * @sails/sdk helper (`generateEscrowKeypair()`) a real client integration
 * uses — this script plays both roles locally only because it's rehearsing
 * the full cooperative lifecycle in one process, not because the server
 * ever sees a private key. Both signatures in the final broadcast are
 * produced by `signEscrowPsbt()`, the same client-side SDK call a real
 * wallet integration would make.
 *
 * Funding step: this script derives the real deposit address and then
 * polls the same explorer API lockFunds() itself uses
 * (`{explorerApiUrl}/address/{addr}/utxo`) until a matching UTXO appears —
 * it does not move funds itself (non-custodial by construction, same as
 * the provider it drives). Send testnet coins to the printed address from
 * any public testnet3 faucet while this script is polling.
 */
import * as bitcoin from 'bitcoinjs-lib'
import { config } from '../config'
import { connectDatabase } from '../common/database'
import { connectRedis } from '../common/redis'
import { identityService } from '../modules/open-identity/identity.service'
import { liquidityRouter } from '../modules/open-liquidity/liquidity.service'
import { tradeService } from '../modules/open-p2p/trade.service'
import { escrowService } from '../modules/open-settlement/escrow.service'
// Lazy require() (CODE_STYLE.md §8) — @sails/sdk is a heavy ESM-adjacent
// package; no other demo script imports it, so it stays out of every path
// that doesn't need it.
function loadEscrowKeyModule(): typeof import('../../packages/sails-sdk/src/modules/escrow-key') {
  return require('../../packages/sails-sdk/src/modules/escrow-key')
}

const FUNDING_POLL_INTERVAL_MS = 15_000
const FUNDING_POLL_TIMEOUT_MS = 30 * 60 * 1000 // 30 min — real faucets + testnet relay can be slow

function step(n: number, total: number, label: string) {
  console.log(`\n[${n}/${total}] ${label}`)
}

async function waitForFunding(address: string, expectedSats: number): Promise<void> {
  const deadline = Date.now() + FUNDING_POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const res = await fetch(`${config.multisig.explorerApiUrl}/address/${address}/utxo`)
    if (res.ok) {
      const utxos = (await res.json()) as Array<{ value: number; status: { confirmed: boolean } }>
      const funding = utxos.find((u) => u.value >= expectedSats)
      if (funding) {
        console.log(`   UTXO detectado: ${funding.value} sats (confirmado: ${funding.status.confirmed})`)
        return
      }
    }
    console.log(`   Ainda sem UTXO em ${address} — aguardando ${FUNDING_POLL_INTERVAL_MS / 1000}s antes de checar de novo...`)
    await new Promise((resolve) => setTimeout(resolve, FUNDING_POLL_INTERVAL_MS))
  }
  throw new Error(`Timeout de ${FUNDING_POLL_TIMEOUT_MS / 60_000}min esperando financiamento em ${address}`)
}

export async function main() {
  console.log('=== Sails Protocol — Ensaio MULTISIG real (Bitcoin testnet) ===')

  if (config.features.mockEscrow) {
    throw new Error('MOCK_ESCROW deve ser "false" para este ensaio — sem isso o endereço de depósito nunca é derivado de verdade (ver submitParticipantKey em escrow.service.ts).')
  }

  await connectDatabase()
  await connectRedis()

  const { generateEscrowKeypair, signEscrowPsbt } = loadEscrowKeyModule()

  const TOTAL = 8
  const suffix = Date.now()

  step(1, TOTAL, 'Registrando identidades (Sails OpenIdentity)...')
  const seller = await identityService.register({ publicKey: `demo-multisig-seller-${suffix}`, displayName: 'Vendedor BTC (MULTISIG)' })
  const buyer = await identityService.register({ publicKey: `demo-multisig-buyer-${suffix}`, displayName: 'Comprador BTC (MULTISIG)' })
  console.log(`   Vendedor: ${seller.id}`)
  console.log(`   Comprador: ${buyer.id}`)

  step(2, TOTAL, 'Oferta + Trade (Sails OpenLiquidity / OpenP2P)...')
  const lockedAmountBtc = '0.0001' // ~10,000 sats — well within any public testnet faucet's per-drip limit
  const offer = await liquidityRouter.createOffer({
    userId: seller.id,
    asset: 'BTC',
    side: 'SELL',
    priceUsd: '60000',
    minAmount: lockedAmountBtc,
    maxAmount: lockedAmountBtc,
    paymentMethod: 'OTHER',
    network: 'testnet',
  })
  const trade = await tradeService.createTrade({ offerId: offer.id, counterpartyId: buyer.id, amount: lockedAmountBtc })
  console.log(`   Trade: ${trade.id} (${lockedAmountBtc} BTC)`)

  step(3, TOTAL, 'Criando escrow MULTISIG (OpenSettlement)...')
  const escrow = await escrowService.createEscrow({
    tradeId: trade.id,
    type: 'MULTISIG',
    lockedAmount: lockedAmountBtc,
    asset: 'BTC',
    network: 'testnet',
  }, seller.id)
  console.log(`   Escrow: ${escrow.id}`)

  step(4, TOTAL, 'Gerando chaves secp256k1 client-held (SDK generateEscrowKeypair)...')
  const buyerKeys = generateEscrowKeypair()
  const sellerKeys = generateEscrowKeypair()
  console.log(`   Buyer pubkey:  ${buyerKeys.publicKeyHex}`)
  console.log(`   Seller pubkey: ${sellerKeys.publicKeyHex}`)

  step(5, TOTAL, 'Submetendo chaves públicas (deriva o endereço P2WSH real)...')
  await escrowService.submitParticipantKey(escrow.id, buyer.id, buyerKeys.publicKeyHex)
  const { escrow: withAddress } = await escrowService.submitParticipantKey(escrow.id, seller.id, sellerKeys.publicKeyHex)
  const depositAddress = withAddress.multisigAddr
  if (!depositAddress) throw new Error('multisigAddr não foi derivado — ver MULTISIG_SEED/TRUSTED_ARBITRATORS')
  console.log(`\n   >>> ENDEREÇO DE DEPÓSITO (testnet3): ${depositAddress}`)
  console.log(`   >>> Envie ao menos ${lockedAmountBtc} tBTC para este endereço via um faucet público de Bitcoin testnet.`)

  const expectedSats = Math.round(parseFloat(lockedAmountBtc) * 1e8)
  step(6, TOTAL, `Aguardando financiamento real em ${depositAddress}...`)
  await waitForFunding(depositAddress, expectedSats)

  step(7, TOTAL, 'lockFunds → markPaymentSent → initiateRelease (constrói PSBT não assinado)...')
  await escrowService.lockFunds(escrow.id, seller.id)
  await escrowService.markPaymentSent(escrow.id, buyer.id)
  const network = config.multisig.network === 'bitcoin' || config.multisig.network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
  const buyerPayoutAddress = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(buyerKeys.publicKey), network }).address!
  console.log(`   Endereço de payout do comprador (derivado da própria chave de escrow, só para este ensaio): ${buyerPayoutAddress}`)
  const pending = await escrowService.initiateRelease(escrow.id, buyerPayoutAddress, seller.id)

  step(8, TOTAL, 'Assinando e enviando as 2 assinaturas (buyer + seller) — a 2ª dispara combine + broadcast real...')
  const buyerSigned = signEscrowPsbt(pending.unsignedPsbtBase64, buyerKeys.privateKey)
  const sellerSigned = signEscrowPsbt(pending.unsignedPsbtBase64, sellerKeys.privateKey)
  await escrowService.submitTransactionSignature(escrow.id, buyer.id, buyerSigned)
  const result = await escrowService.submitTransactionSignature(escrow.id, seller.id, sellerSigned)
  if (!result.complete || !result.escrow) {
    throw new Error(`Esperava a 2ª assinatura completar o release, mas recebi: ${JSON.stringify(result)}`)
  }

  console.log('\n=== Ensaio completo — escrow MULTISIG liberado via 2-de-3 real em testnet ===')
  console.log(`   Escrow status: ${result.escrow.status}`)
  console.log(`   Tx de release (real, testnet3): ${result.escrow.txReleaseId}`)
  console.log(`   Confirme em: https://mempool.space/testnet/tx/${result.escrow.txReleaseId}`)

  process.exit(0)
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[demo] Falhou:', err)
    process.exit(1)
  })
}
