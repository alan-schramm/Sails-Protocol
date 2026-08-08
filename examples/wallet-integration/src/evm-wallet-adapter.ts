/**
 * @sails/example-wallet-integration — real EVM WalletAdapter
 *
 * PRODUCTION_READINESS_FIXES.md item 22, closed 2026-08-08. Backs
 * SAFE_GUARD_EVM (RFC-020) — a Safe Transaction Guard + ERC-4337 escrow
 * where the buyer/seller keys are genuinely client-held (see
 * `safe-guard-evm.provider.ts`'s own custody-model disclosure), unlike
 * WDK_USDT_EVM (examples/simple-wallet's provider), which is
 * server-custodial and needs no client wallet at all.
 *
 * `@sails/sdk`'s own `settlement.ts` doc comment on `parseSafeGuardBundle()`
 * is explicit that the SDK stays EVM-library-agnostic on purpose ("no
 * hard dependency on ethers/viem... the caller submits {to, data} via
 * whatever wallet/provider they already use") — this file is the first
 * real answer to that "e.g. ethers" example the SDK's own comment
 * gestures at but never implements. `ethers` here is a real, direct
 * dependency of this example package only, not the SDK itself.
 *
 * A SAFE_GUARD_EVM escrow has two structurally different signing steps,
 * both exposed below beyond the generic WalletAdapter interface:
 *   1. Guard deployment (`guardDeployment: {to, data}`) — a real EVM
 *      transaction (deploys `SailsEscrowSafe`, no trade-party signature
 *      required by the contract itself, just gas) — maps directly onto
 *      WalletAdapter's signTransaction()/broadcastTransaction() split.
 *   2. The release/refund UserOp hash — not a transaction, a raw
 *      secp256k1 signature over a 32-byte digest
 *      (`signEscrowSafeUserOp()`, `@sails/sdk`), submitted via
 *      `settlement.submitTransactionSignature()`, never broadcast by
 *      this wallet directly. Exposed as its own method
 *      (`signEscrowUserOp`), since it doesn't fit "transaction" at all.
 */
import { ethers } from 'ethers'
import type { WalletAdapter, WalletCapabilitiesDeclaration } from '@sails/sdk'
import { signEscrowSafeUserOp } from '@sails/sdk'

// Sepolia — the standard, free EVM testnet. A real deployment would take
// this from config (WDK_RPC_URL's own env-var convention, config/index.ts),
// not hardcode it; hardcoded here because this is a standalone example
// with no config module of its own.
const DEFAULT_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

// Minimal ERC-20 ABI — just balanceOf, real enough to check a real USDT
// balance without pulling in a whole ABI/contract-typing library for one
// read call.
const ERC20_BALANCE_ABI = ['function balanceOf(address) view returns (uint256)']

export class RealEvmWalletAdapter implements WalletAdapter {
  // ethers.Wallet.createRandom() returns HDNodeWallet (a Wallet subclass
  // with extra HD-derivation info attached), not the base Wallet type —
  // real gap found by tsc, not assumed: `.connect()` on it returns
  // HDNodeWallet too, which isn't structurally assignable back to
  // `ethers.Wallet` (ethers v6's own private-field branding). Typed
  // against the real runtime type instead of fighting it.
  private readonly wallet: ethers.HDNodeWallet
  private readonly provider: ethers.JsonRpcProvider

  constructor(rpcUrl: string = DEFAULT_RPC_URL) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl)
    // Real secp256k1 keypair — ethers.Wallet.createRandom() generates a
    // real, independently-verifiable EOA (Externally Owned Account), the
    // same primitive MetaMask/any real EVM wallet is built on.
    this.wallet = ethers.Wallet.createRandom().connect(this.provider) as ethers.HDNodeWallet
  }

  async getPeerId(): Promise<string> {
    throw new Error(
      'RealEvmWalletAdapter has no Pears peerId — P2P identity uses a separate Ed25519 keypair ' +
      '(SailsClient.identity.create()), not this wallet\'s secp256k1 EVM key. See this file\'s header comment.'
    )
  }

  async getAddress(asset: string): Promise<string> {
    if (asset !== 'USDT_ERC20') throw new Error(`RealEvmWalletAdapter only holds an EVM key, not '${asset}'`)
    return this.wallet.address
  }

  /**
   * Real native-ETH balance (wei, decimal string — needed for gas to pay
   * for the guard-deployment transaction below), via a live Sepolia RPC
   * call. A real integration would also check the real USDT token
   * balance — `getUsdtBalance()` below shows that pattern separately,
   * since WalletAdapter.getBalance()'s single-asset-string signature
   * can't cleanly express "native gas token vs. the ERC-20 being
   * traded" as two different balances for the same `asset` key.
   */
  async getBalance(asset: string): Promise<string> {
    if (asset !== 'USDT_ERC20') throw new Error(`RealEvmWalletAdapter only holds an EVM key, not '${asset}'`)
    const wei = await this.provider.getBalance(this.wallet.address)
    return wei.toString()
  }

  /** Real ERC-20 balanceOf() call against a live contract — the actual USDT_ERC20 balance, not the native gas token. */
  async getUsdtBalance(usdtContractAddress: string): Promise<string> {
    const contract = new ethers.Contract(usdtContractAddress, ERC20_BALANCE_ABI, this.provider)
    const balance = (await contract.balanceOf(this.wallet.address)) as bigint
    return balance.toString()
  }

  /**
   * `tx` is the guard-deployment step's `{ to, data }`
   * (`parseSafeGuardBundle(pending.unsignedPsbtBase64).guardDeployment`,
   * `@sails/sdk`) — real ethers signing, no value field (this deploys a
   * contract, it never carries native currency, same as that function's
   * own doc comment states).
   */
  async signTransaction(asset: string, tx: unknown): Promise<unknown> {
    if (asset !== 'USDT_ERC20') throw new Error(`RealEvmWalletAdapter only signs EVM txs, not '${asset}'`)
    const { to, data } = tx as { to: string; data: string }
    const populated = await this.wallet.populateTransaction({ to, data })
    return this.wallet.signTransaction(populated)
  }

  /** Real broadcast of an already-signed tx (from signTransaction() above) via the live Sepolia RPC. */
  async broadcastTransaction(asset: string, signedTx: unknown): Promise<string> {
    if (asset !== 'USDT_ERC20') throw new Error(`RealEvmWalletAdapter only broadcasts EVM txs, not '${asset}'`)
    const receipt = await this.provider.broadcastTransaction(signedTx as string)
    return receipt.hash
  }

  async signMessage(_message: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'RealEvmWalletAdapter cannot sign a session-auth challenge — Sails identity/session auth uses a ' +
      'separate Ed25519 keypair (SailsClient.identity.create()/authenticateWithWallet()), not this wallet\'s ' +
      'secp256k1 EVM key. See this file\'s header comment for why these are deliberately different key material.'
    )
  }

  async getCapabilities(): Promise<WalletCapabilitiesDeclaration> {
    return {
      assets: ['USDT_ERC20'],
      fiatRails: [],
      supportsP2PTrading: true,
      supportsOnchainSettlement: true,
    }
  }

  /**
   * Not part of WalletAdapter — what `settlement.submitKey()` actually
   * needs. Real gap found writing this example: SAFE_GUARD_EVM shares
   * the exact same `submit-key` HTTP route and validation
   * (`PUBKEY_HEX_PATTERN`, `settlement.routes.ts`) as MULTISIG/
   * LIGHTNING_HODL — a 33-byte compressed secp256k1 public key, hex,
   * `02`/`03`-prefixed — NOT this wallet's own EVM address.
   * `safe-guard-evm.provider.ts`'s `getDepositAddress(tradeId,
   * buyerPubkey, sellerPubkey)` derives the real Safe owner addresses
   * from these pubkeys server-side, the same way this file's own
   * `getAddress()` derivation works. `ethers.Wallet.signingKey.
   * compressedPublicKey` gives exactly this format (real, documented
   * ethers v6 API — confirmed via a real generated wallet, not assumed).
   */
  get publicKeyHex(): string {
    const compressed = this.wallet.signingKey.compressedPublicKey
    return compressed.startsWith('0x') ? compressed.slice(2) : compressed
  }

  /**
   * Not part of WalletAdapter — the escrow-specific release/refund
   * signing step. `unsignedBundleBase64` is the escrow's real pending
   * transaction (`settlement.initiateRelease()`/`initiateRefund()`'s
   * response, or `getPendingTransaction()`), a JSON bundle
   * (`SafeGuardBundle`, `@sails/sdk`), not a literal PSBT despite the
   * field's shared name across escrow types (MULTISIG's is a real PSBT;
   * this one carries `userOpHash` instead). `signEscrowSafeUserOp()`
   * extracts that hash, signs it with this wallet's raw private key
   * bytes, and returns the 65-byte Ethereum signature the server expects
   * via `settlement.submitTransactionSignature()`.
   */
  signEscrowUserOp(unsignedBundleBase64: string): string {
    const privateKeyHex = this.wallet.privateKey.startsWith('0x')
      ? this.wallet.privateKey.slice(2)
      : this.wallet.privateKey
    const privateKeyBytes = Buffer.from(privateKeyHex, 'hex')
    return signEscrowSafeUserOp(unsignedBundleBase64, privateKeyBytes)
  }
}
