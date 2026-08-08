/**
 * @sails/example-wallet-integration — Bitcoin (MULTISIG) real wallet flow
 *
 * PRODUCTION_READINESS_FIXES.md item 22. Unlike examples/simple-wallet
 * (WDK_USDT_EVM, server-custodial, no client wallet needed), this walks
 * through a genuinely non-custodial escrow using ONLY @sails/sdk's public
 * HTTP API plus a real client-held secp256k1 wallet
 * (RealBitcoinWalletAdapter) — the server never sees a private key,
 * only the public keys both parties submit.
 *
 * Needs a real testnet UTXO to actually complete past the funding step —
 * see README.md for how to fund the escrow's own real 2-of-3 P2WSH
 * deposit address (server-derived once both parties submit their public
 * key — NOT either wallet's own single-sig address) via a public
 * testnet faucet. Same honest limitation examples/demo/multisig-testnet-flow.ts
 * already discloses: this can walk through every step up to "send funds
 * to this address" without needing real testnet BTC, but the actual
 * lock/release round trip needs it.
 *
 * Run: npm run start:bitcoin -w @sails/example-wallet-integration
 */
import { SailsClient } from '@sails/sdk'
import { RealBitcoinWalletAdapter } from './bitcoin-wallet-adapter'

const BASE_URL = process.env.SAILS_BASE_URL ?? 'http://localhost:3000'

let stepNumber = 0
function step(label: string): void {
  stepNumber += 1
  console.log(`\n[${stepNumber}] ${label}`)
}

// Polls the escrow's own real 2-of-3 P2WSH deposit address (server-derived
// in submitKey(), NOT either party's own wallet address — a real MULTISIG
// escrow's locked collateral lives in a shared UTXO neither party controls
// alone) — same mempool.space API examples/demo/multisig-testnet-flow.ts
// already uses for the identical reason.
async function waitForDepositFunding(depositAddress: string, minSats: number, timeoutMs = 30 * 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`https://mempool.space/testnet/api/address/${depositAddress}`)
    if (res.ok) {
      const data = (await res.json()) as { chain_stats: { funded_txo_sum: number; spent_txo_sum: number } }
      const sats = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum
      if (sats >= minSats) {
        console.log(`    funded: ${sats} sats at ${depositAddress}`)
        return
      }
      console.log(`    still waiting for testnet funds at ${depositAddress} (${sats}/${minSats} sats)...`)
    }
    await new Promise((r) => setTimeout(r, 15_000))
  }
  throw new Error(`Timed out waiting for testnet BTC at ${depositAddress}`)
}

async function main() {
  // Real, independent wallets — each side holds its own secp256k1 escrow
  // key AND its own Ed25519 session identity (see bitcoin-wallet-adapter.ts's
  // header comment for why those are deliberately separate key material).
  const sellerBitcoinWallet = new RealBitcoinWalletAdapter()
  const buyerBitcoinWallet = new RealBitcoinWalletAdapter()
  const sellerClient = new SailsClient({ baseUrl: BASE_URL })
  const buyerClient = new SailsClient({ baseUrl: BASE_URL })

  step('Seller registers and authenticates (identity.create + identity.authenticate — Ed25519 session key)')
  const { keypair: sellerKeypair } = await sellerClient.identity.create(undefined, 'Wallet Integration — Seller')
  await sellerClient.identity.authenticate(sellerKeypair)
  console.log(`    seller Bitcoin address (this wallet's own, not the escrow's): ${sellerBitcoinWallet.address}`)

  step('Buyer registers and authenticates')
  const { keypair: buyerKeypair } = await buyerClient.identity.create(undefined, 'Wallet Integration — Buyer')
  await buyerClient.identity.authenticate(buyerKeypair)
  console.log(`    buyer Bitcoin address: ${buyerBitcoinWallet.address}`)

  const lockedAmountBtc = '0.0001' // ~10,000 sats — small enough for any public testnet faucet's per-drip limit

  step('Seller publishes a SELL offer (liquidity.publish)')
  const offer = await sellerClient.liquidity.publish({
    asset: 'BTC',
    side: 'SELL',
    priceUsd: '60000',
    minAmount: lockedAmountBtc,
    maxAmount: lockedAmountBtc,
    paymentMethod: 'OTHER',
    network: 'testnet',
  })
  console.log(`    offer ${offer.id} published`)

  step('Buyer opens a trade against the offer (openp2p.trade)')
  const trade = await buyerClient.openp2p.trade(offer.id, lockedAmountBtc)
  console.log(`    trade ${trade.id} created`)

  step('Seller creates a MULTISIG escrow (settlement.create)')
  const escrow = await sellerClient.settlement.create({
    tradeId: trade.id,
    type: 'MULTISIG',
    lockedAmount: lockedAmountBtc,
    asset: 'BTC',
    network: 'testnet',
  })
  console.log(`    escrow ${escrow.id} created`)

  step('Both sides submit their real public key (settlement.submitKey) — private keys never leave this process')
  await sellerClient.settlement.submitKey(escrow.id, sellerBitcoinWallet.publicKeyHex)
  const { escrow: withAddress } = await buyerClient.settlement.submitKey(escrow.id, buyerBitcoinWallet.publicKeyHex)
  if (!withAddress.multisigAddr) throw new Error('Expected multisigAddr to be derived once both keys are submitted')
  const depositAddress = withAddress.multisigAddr
  console.log(`    real 2-of-3 P2WSH deposit address (server-derived — neither wallet's own address): ${depositAddress}`)

  step(`Waiting for the escrow's deposit address to be funded with testnet BTC`)
  console.log(`    send at least 10,000 sats to ${depositAddress} from a public testnet faucet — see this package's README.md`)
  await waitForDepositFunding(depositAddress, 10_000)

  step('Seller locks the escrow (settlement.lock) — server verifies the deposit address is funded')
  await sellerClient.settlement.lock(escrow.id)
  console.log('    escrow locked')

  step('Buyer marks the fiat payment as sent (settlement.markPaymentSent)')
  await buyerClient.settlement.markPaymentSent(escrow.id)

  step('Seller initiates release (settlement.initiateRelease) — builds an unsigned PSBT, does not move funds yet')
  const pending = await sellerClient.settlement.initiateRelease(escrow.id, buyerBitcoinWallet.address)
  console.log(`    pending transaction ${pending.id}, requires signatures from: ${pending.requiredSigners.join(', ')}`)

  step('Both required signers sign with their own real wallet (RealBitcoinWalletAdapter.signTransaction)')
  const sellerSigned = (await sellerBitcoinWallet.signTransaction('BTC', pending.unsignedPsbtBase64)) as string
  const buyerSigned = (await buyerBitcoinWallet.signTransaction('BTC', pending.unsignedPsbtBase64)) as string
  await sellerClient.settlement.submitTransactionSignature(escrow.id, sellerSigned)
  const result = await buyerClient.settlement.submitTransactionSignature(escrow.id, buyerSigned)
  console.log(`    complete: ${result.complete}`)

  const released = await sellerClient.settlement.get(escrow.id)
  console.log(`\nDone — escrow status: ${released.status}, txReleaseId: ${released.txReleaseId}`)
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err)
  console.error(`\nIs a Sails node running at ${BASE_URL}? Start one with "npm run dev" from the repo root.`)
  process.exitCode = 1
})
