/**
 * @sails/example-wallet-integration — EVM (SAFE_GUARD_EVM) real wallet flow
 *
 * PRODUCTION_READINESS_FIXES.md item 22. Same story as bitcoin.ts, for
 * RFC-020's SAFE_GUARD_EVM escrow: a Safe Transaction Guard + ERC-4337
 * account whose real deposit address is a CREATE2 counterfactual address
 * (`safe-guard-evm.provider.ts`'s `getDepositAddress()`) — it can receive
 * funds before the actual Safe contract is deployed, which is what makes
 * the guard-deployment step below (anyone funded can submit it,
 * `RealEvmWalletAdapter`'s header comment) a separate, permissionless
 * step from the release/refund signature round.
 *
 * `lockFunds()`/`verifyLock()` (safe-guard-evm.provider.ts) are real, live
 * RPC balance checks — this flow genuinely completes through funding and
 * locking with nothing but a Sepolia RPC and real testnet ETH. The final
 * release/refund step needs the SERVER to have a real ERC-4337 bundler
 * configured (`SAFE_GUARD_EVM_BUNDLER_URL` — Pimlico/Alchemy/Stackup all
 * expose the standard `eth_sendUserOperation` this provider calls); if
 * it isn't, the server returns a clear error naming exactly that gap
 * (`safe-guard-evm.provider.ts`'s own `broadcast()`) rather than this
 * script pretending it went through.
 *
 * Run: npm run start:evm -w @sails/example-wallet-integration
 */
import { ethers } from 'ethers'
import { SailsClient } from '@satsails/p2p-trading-sdk'
import { RealEvmWalletAdapter } from './evm-wallet-adapter'

const BASE_URL = process.env.SAILS_BASE_URL ?? 'http://localhost:3000'
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const rpcProvider = new ethers.JsonRpcProvider(RPC_URL)

let stepNumber = 0
function step(label: string): void {
  stepNumber += 1
  console.log(`\n[${stepNumber}] ${label}`)
}

// Checks the GUARD address's own balance directly, not either wallet's —
// same "fund the shared escrow address, not a party's own wallet"
// distinction bitcoin.ts's waitForDepositFunding() makes for MULTISIG.
async function waitForFunding(address: string, minWei: bigint, timeoutMs = 30 * 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const wei = await rpcProvider.getBalance(address)
    if (wei >= minWei) {
      console.log(`    funded: ${wei} wei at ${address}`)
      return
    }
    console.log(`    still waiting for testnet ETH at ${address} (${wei}/${minWei} wei)...`)
    await new Promise((r) => setTimeout(r, 15_000))
  }
  throw new Error(`Timed out waiting for testnet ETH at ${address}`)
}

async function main() {
  const sellerEvmWallet = new RealEvmWalletAdapter(RPC_URL)
  const buyerEvmWallet = new RealEvmWalletAdapter(RPC_URL)
  const sellerClient = new SailsClient({ baseUrl: BASE_URL })
  const buyerClient = new SailsClient({ baseUrl: BASE_URL })

  step('Seller registers and authenticates (identity.create + identity.authenticate — Ed25519 session key)')
  const { keypair: sellerKeypair } = await sellerClient.identity.create(undefined, 'Wallet Integration — Seller')
  await sellerClient.identity.authenticate(sellerKeypair)
  console.log(`    seller EVM address (this wallet's own): ${await sellerEvmWallet.getAddress('USDT_ERC20')}`)

  step('Buyer registers and authenticates')
  const { keypair: buyerKeypair } = await buyerClient.identity.create(undefined, 'Wallet Integration — Buyer')
  await buyerClient.identity.authenticate(buyerKeypair)
  console.log(`    buyer EVM address: ${await buyerEvmWallet.getAddress('USDT_ERC20')}`)

  const lockedAmount = '1' // 1 USDT_ERC20 — the escrow's accounting unit; the guard address itself is funded with native ETH below

  step('Seller publishes a SELL offer (liquidity.publish)')
  const offer = await sellerClient.liquidity.publish({
    asset: 'USDT_ERC20',
    side: 'SELL',
    priceUsd: '1',
    minAmount: lockedAmount,
    maxAmount: lockedAmount,
    paymentMethod: 'OTHER',
    network: 'sepolia',
  })
  console.log(`    offer ${offer.id} published`)

  step('Buyer opens a trade against the offer (openp2p.trade)')
  const trade = await buyerClient.openp2p.trade(offer.id, lockedAmount)
  console.log(`    trade ${trade.id} created`)

  step('Seller creates a SAFE_GUARD_EVM escrow (settlement.create)')
  const escrow = await sellerClient.settlement.create({
    tradeId: trade.id,
    type: 'SAFE_GUARD_EVM',
    lockedAmount,
    asset: 'USDT_ERC20',
    network: 'sepolia',
  })
  console.log(`    escrow ${escrow.id} created`)

  step('Both sides submit their real public key (settlement.submitKey) — private keys never leave this process')
  await sellerClient.settlement.submitKey(escrow.id, sellerEvmWallet.publicKeyHex)
  const { escrow: withAddress } = await buyerClient.settlement.submitKey(escrow.id, buyerEvmWallet.publicKeyHex)
  if (!withAddress.multisigAddr) throw new Error('Expected a CREATE2 guard address to be derived once both keys are submitted')
  const guardAddress = withAddress.multisigAddr
  console.log(`    real CREATE2 counterfactual Safe guard address (server-derived): ${guardAddress}`)

  step('Waiting for the guard address to be funded with testnet ETH (it can receive funds before deployment — CREATE2)')
  console.log(`    send testnet ETH to ${guardAddress} from a public Sepolia faucet — see this package's README.md`)
  await waitForFunding(guardAddress, 1n)

  step('Seller locks the escrow (settlement.lock) — real live RPC balance check against the guard address')
  await sellerClient.settlement.lock(escrow.id)
  console.log('    escrow locked')

  step('Buyer marks the fiat payment as sent (settlement.markPaymentSent)')
  await buyerClient.settlement.markPaymentSent(escrow.id)

  step('Seller initiates release (settlement.initiateRelease) — returns a SafeGuardBundle with guardDeployment + userOpHash')
  const buyerAddress = await buyerEvmWallet.getAddress('USDT_ERC20')
  const pending = await sellerClient.settlement.initiateRelease(escrow.id, buyerAddress)
  console.log(`    pending transaction ${pending.id}, requires signatures from: ${pending.requiredSigners.join(', ')}`)

  step('Any funded account submits the guard deployment (no trade-party signature needed — this is the seller here)')
  const { parseSafeGuardBundle } = await import('@satsails/p2p-trading-sdk')
  const bundle = parseSafeGuardBundle(pending.unsignedPsbtBase64)
  const signedDeployTx = await sellerEvmWallet.signTransaction('USDT_ERC20', bundle.guardDeployment)
  const deployTxHash = await sellerEvmWallet.broadcastTransaction('USDT_ERC20', signedDeployTx)
  console.log(`    guard deployed: ${deployTxHash}`)

  step('Both required signers sign the UserOp hash with their own real wallet (RealEvmWalletAdapter.signEscrowUserOp)')
  const sellerSigned = sellerEvmWallet.signEscrowUserOp(pending.unsignedPsbtBase64)
  const buyerSigned = buyerEvmWallet.signEscrowUserOp(pending.unsignedPsbtBase64)
  await sellerClient.settlement.submitTransactionSignature(escrow.id, sellerSigned)
  const result = await buyerClient.settlement.submitTransactionSignature(escrow.id, buyerSigned)
  console.log(`    complete: ${result.complete}`)

  const released = await sellerClient.settlement.get(escrow.id)
  console.log(`\nDone — escrow status: ${released.status}, txReleaseId: ${released.txReleaseId}`)
}

main().catch((err) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err)
  console.error(`\nIs a Sails node running at ${BASE_URL}? Start one with "npm run dev" from the repo root.`)
  console.error('If it failed at the final signature submission, the server likely has no SAFE_GUARD_EVM_BUNDLER_URL ' +
    'configured — see safe-guard-evm.provider.ts\'s broadcast() for the exact requirement.')
  process.exitCode = 1
})
