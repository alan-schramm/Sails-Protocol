/**
 * @sails/example-wallet-integration — real Bitcoin WalletAdapter
 *
 * PRODUCTION_READINESS_FIXES.md item 22 ("Criar example com wallet
 * real"), closed 2026-08-08. Every other example in this monorepo
 * (`examples/simple-wallet`) uses WDK_USDT_EVM — a server-custodial
 * provider (one server-held seed signs everything, see
 * `wdk-settlement.provider.ts`'s own disclosure) — which needs no client
 * wallet at all. This is the first example to actually implement
 * `WalletAdapter` against a real, non-custodial escrow type: MULTISIG
 * (2-of-3 Bitcoin PSBT, `multisig.provider.ts`), where the buyer/seller
 * private keys are genuinely client-held and the server never sees them
 * — only the 33-byte compressed public key, via `settlement.submitKey()`.
 *
 * Built entirely from `@sails/sdk`'s own public exports
 * (`generateEscrowKeypair`/`signEscrowPsbt`, `escrow-key.ts`) — this
 * adapter adds no new crypto, it wraps what the SDK already ships in the
 * `WalletAdapter` shape a real wallet integration would present.
 *
 * Deliberately narrow: this wallet only knows how to hold a Bitcoin
 * secp256k1 keypair and sign a MULTISIG escrow PSBT. It does NOT (and
 * should not) also handle Sails session identity — that's a Ed25519
 * keypair, `identity.create()`'s own concern, a completely different key
 * material serving a completely different layer of the protocol
 * (session auth vs. fund custody). `signMessage()`/`getPeerId()` below
 * throw a clear error explaining exactly this, rather than faking
 * support — a real hardware wallet integrating this SDK would have the
 * exact same boundary.
 */
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import type { WalletAdapter, WalletCapabilitiesDeclaration } from '@sails/sdk'
import { generateEscrowKeypair, signEscrowPsbt, type EscrowKeypair } from '@sails/sdk'

bitcoin.initEccLib(ecc)

const TESTNET = bitcoin.networks.testnet

// mempool.space's public testnet API — same one examples/demo/multisig-testnet-flow.ts
// already uses for the same reason (a real, free, no-signup block explorer
// with a JSON API, no server-side infrastructure of our own needed for an
// example script).
const EXPLORER_API = 'https://mempool.space/testnet/api'

export class RealBitcoinWalletAdapter implements WalletAdapter {
  private readonly keypair: EscrowKeypair
  readonly address: string

  constructor() {
    // Real secp256k1 keypair, generated once, held only in this process's
    // memory for the lifetime of this example — see escrow-key.ts's own
    // header comment for why @noble/curves (not tiny-secp256k1) is the
    // right choice for a client-side wallet.
    this.keypair = generateEscrowKeypair()
    this.address = this.deriveAddress()
  }

  private deriveAddress(): string {
    // A real P2WPKH testnet address from the same compressed pubkey the
    // escrow flow submits via settlement.submitKey() — this is NOT the
    // escrow deposit address itself (that's a 2-of-3 P2WSH address the
    // SERVER derives once both parties have submitted their key, see
    // escrow.service.ts's submitParticipantKey()); it's this wallet's own
    // single-sig receiving address, the kind a real wallet UI would show
    // a user for "your Bitcoin address."
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(this.keypair.publicKey),
      network: TESTNET,
    })
    if (!address) throw new Error('Failed to derive a P2WPKH address from the wallet keypair')
    return address
  }

  async getPeerId(): Promise<string> {
    throw new Error(
      'RealBitcoinWalletAdapter has no Pears peerId — P2P identity uses a separate Ed25519 keypair ' +
      '(SailsClient.identity.create()), not this wallet\'s secp256k1 escrow key. See this file\'s header comment.'
    )
  }

  async getAddress(asset: string): Promise<string> {
    if (asset !== 'BTC') throw new Error(`RealBitcoinWalletAdapter only holds a BTC key, not '${asset}'`)
    return this.address
  }

  /** Real balance, in satoshis (as a decimal string, RFC-009 convention) — a live mempool.space lookup, not a stub. */
  async getBalance(asset: string): Promise<string> {
    if (asset !== 'BTC') throw new Error(`RealBitcoinWalletAdapter only holds a BTC key, not '${asset}'`)
    const res = await fetch(`${EXPLORER_API}/address/${this.address}`)
    if (!res.ok) throw new Error(`mempool.space lookup failed: HTTP ${res.status}`)
    const data = (await res.json()) as { chain_stats: { funded_txo_sum: number; spent_txo_sum: number } }
    const sats = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum
    return String(sats)
  }

  /**
   * `tx` is the escrow's real unsigned PSBT (base64, from
   * `settlement.initiateRelease()`/`initiateRefund()`) — this signs input
   * 0 with this wallet's own key (`signEscrowPsbt()`, escrow-key.ts) and
   * returns the still-base64, now-partially-signed PSBT. It is NOT yet
   * broadcastable — MULTISIG needs the counterparty's (or arbiter's)
   * signature too; the SERVER combines and broadcasts once every
   * required signer has called `settlement.submitTransactionSignature()`
   * with their own copy — see broadcastTransaction()'s doc comment below
   * for why that step never happens client-side for this escrow type.
   */
  async signTransaction(asset: string, tx: unknown): Promise<unknown> {
    if (asset !== 'BTC') throw new Error(`RealBitcoinWalletAdapter only signs BTC, not '${asset}'`)
    const unsignedPsbtBase64 = tx as string
    return signEscrowPsbt(unsignedPsbtBase64, this.keypair.privateKey)
  }

  async broadcastTransaction(_asset: string, _signedTx: unknown): Promise<string> {
    throw new Error(
      'RealBitcoinWalletAdapter never broadcasts a MULTISIG escrow release/refund itself — the server ' +
      'combines every required signature and broadcasts once settlement.submitTransactionSignature() has been ' +
      'called by each required signer. Call that instead of broadcastTransaction() for this escrow type.'
    )
  }

  async signMessage(_message: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'RealBitcoinWalletAdapter cannot sign a session-auth challenge — Sails identity/session auth uses a ' +
      'separate Ed25519 keypair (SailsClient.identity.create()/authenticateWithWallet()), not this wallet\'s ' +
      'secp256k1 escrow key. See this file\'s header comment for why these are deliberately different key material.'
    )
  }

  async getCapabilities(): Promise<WalletCapabilitiesDeclaration> {
    return {
      assets: ['BTC'],
      fiatRails: [],
      supportsP2PTrading: true,
      supportsOnchainSettlement: true,
    }
  }

  /** Not part of WalletAdapter — the escrow-specific signing step every MULTISIG flow needs. */
  get publicKeyHex(): string {
    return this.keypair.publicKeyHex
  }
}
