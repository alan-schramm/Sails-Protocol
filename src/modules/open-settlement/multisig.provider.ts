/**
 * Sails OpenSettlement — Multisig (2-of-3 Bitcoin) SettlementProvider
 *
 * Real, testable Bitcoin script/PSBT construction (bitcoinjs-lib + bip32 +
 * ecpair + tiny-secp256k1) — TODO.md §4's "Real Multisig 2-of-3 Bitcoin
 * escrow — not implemented; only MOCK" gap. Verified experimentally before
 * writing this file: address derivation, P2WSH witness-script
 * construction, and 2-of-3 PSBT signing/finalization succeed with 2
 * signatures and correctly fail with only 1 — confirmed against the real
 * bitcoinjs-lib/bip32/ecpair APIs, not assumed from docs.
 *
 * Custody model — same "state it plainly" discipline as
 * wdk-settlement.provider.ts's own header comment: this reference
 * implementation derives ALL THREE keys (buyer, seller, arbiter) from a
 * single server-held seed (MULTISIG_SEED). It is genuine 2-of-3 Bitcoin
 * script mechanics — a real P2WSH address, a real witness script that
 * provably requires 2 real signatures to finalize (verified experimentally:
 * a PSBT with only 1 of 2 required signatures throws on finalizeAllInputs,
 * it does not merely "look wrong") — but it is NOT yet a trustless
 * multisig where the buyer and seller each independently hold their own
 * private key. Onboarding each counterparty's own key instead of deriving
 * theirs from this provider's seed is the same "not built yet" gap
 * RFC-019 Phase 2 already names for a future WalletAuthorizedSettlementProvider.
 * What this DOES genuinely improve over WDK_USDT_EVM's single-seed
 * *two-hop* design: release/refund require 2 independently-derived
 * signatures to finalize, so a single compromised derivation path alone
 * cannot move funds — unlike WDK's single treasury key.
 *
 * Non-custodial in the fund-movement sense — unlike MOCK/WDK_USDT_EVM,
 * this provider never pushes funds into escrow itself. The seller sends
 * BTC to the deterministic address (exposed via getDepositAddress(),
 * populated onto Escrow.multisigAddr at creation time by escrow.service.ts)
 * using their own wallet; lockFunds() only verifies that funding arrived
 * (queries a public block-explorer API) rather than causing it.
 *
 * Single-arbiter limitation, stated plainly rather than silently wrong: the
 * P2WSH script's third key is fixed at escrow-creation time to
 * config.settlement.trustedArbitrators[0] (see defaultArbiterId()) — it
 * cannot depend on whichever arbiter TrustedArbitratorProvider's
 * round-robin later assigns to an actual dispute (arbitration-provider.ts),
 * since the script must exist before any dispute does. If a deployment
 * configures more than one TRUSTED_ARBITRATORS entry, an arbitrated
 * release/refund whose assigned arbiter isn't the one baked into this
 * escrow's script cannot produce a signature that validates against it —
 * assertArbiterMatchesScript() below fails loudly with a clear error
 * rather than attempting (and silently failing) a mismatched signature.
 *
 * Testnet only. MULTISIG_SEED empty by default — same "surface a clear
 * config error, don't refuse to boot" pattern as WDK_SEED_PHRASE.
 */
import * as ecc from 'tiny-secp256k1'
import { BIP32Factory, type BIP32Interface } from 'bip32'
import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import { createHash } from 'crypto'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import type { SettlementProvider } from './escrow.service'

bitcoin.initEccLib(ecc)
const bip32 = BIP32Factory(ecc)
const ECPair = ECPairFactory(ecc)

type ExplorerUtxo = { txid: string; vout: number; value: number; status: { confirmed: boolean } }

function networkFor(name: string): (typeof bitcoin.networks)[keyof typeof bitcoin.networks] {
  if (name === 'bitcoin' || name === 'mainnet') return bitcoin.networks.bitcoin
  if (name === 'regtest') return bitcoin.networks.regtest
  return bitcoin.networks.testnet
}

// Same shape as wdk-settlement.provider.ts's escrowIndexFor/buyerIndexFor —
// sha256(role:id) -> a stable, evenly-distributed non-hardened BIP-32
// index. Exported for direct unit testing, same reason those are.
export function keyIndexFor(role: 'buyer' | 'seller' | 'arbiter', id: string): number {
  const hash = createHash('sha256').update(`${role}:${id}`).digest()
  return hash.readUInt32BE(0) % 0x7fffffff
}

export interface MultisigParties {
  buyerId: string
  sellerId: string
  arbiterId: string
}

// Minimal shape this provider actually needs from an EscrowRecord — a
// structural subset, not the full type, so tests can construct fixtures
// without importing escrow.service.ts's internal type.
export type MultisigEscrowInput = {
  tradeId: string
  lockedAmount: string
  buyerId?: string
  sellerId?: string
  txLockId?: string | null
  status?: string
  triggeredBy?: string
}

export class MultisigProvider implements SettlementProvider {
  name = 'MULTISIG'
  readonly custodyModel = 'server-derived-2-of-3-reference-implementation' as const

  private masterNode: BIP32Interface | null = null

  private getMaster(): BIP32Interface {
    if (this.masterNode) return this.masterNode
    if (!config.multisig.seed) {
      throw new EscrowError(
        'MULTISIG provider requires MULTISIG_SEED configured (.env.example) — refusing to derive keys from an empty seed'
      )
    }
    const network = networkFor(config.multisig.network)
    const seedBuffer = createHash('sha256').update(config.multisig.seed).digest()
    this.masterNode = bip32.fromSeed(seedBuffer, network)
    return this.masterNode
  }

  private defaultArbiterId(): string {
    const arbiter = config.settlement.trustedArbitrators[0]
    if (!arbiter) {
      throw new EscrowError(
        'MULTISIG provider requires at least one TRUSTED_ARBITRATORS entry configured (.env.example) — no arbiter key to derive for the 2-of-3 script'
      )
    }
    return arbiter
  }

  private deriveKey(role: 'buyer' | 'seller' | 'arbiter', id: string): BIP32Interface {
    const master = this.getMaster()
    const index = keyIndexFor(role, id)
    return master.derivePath(`m/0'/0/${index}`)
  }

  // Sorted pubkey order (lexicographic, BIP67-style) — deterministic
  // regardless of which role is derived first, so the same 3 parties
  // always produce the same script/address.
  private buildScript(parties: MultisigParties) {
    const network = networkFor(config.multisig.network)
    const buyerKey = this.deriveKey('buyer', parties.buyerId)
    const sellerKey = this.deriveKey('seller', parties.sellerId)
    const arbiterKey = this.deriveKey('arbiter', parties.arbiterId)

    const pubkeys = [buyerKey.publicKey, sellerKey.publicKey, arbiterKey.publicKey]
      .map((pk) => Buffer.from(pk))
      .sort(Buffer.compare)

    const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network })
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network })

    return { p2ms, p2wsh, buyerKey, sellerKey, arbiterKey, network }
  }

  private partiesFor(escrow: MultisigEscrowInput): MultisigParties {
    if (!escrow.buyerId || !escrow.sellerId) {
      throw new EscrowError(
        `MULTISIG provider requires buyerId/sellerId for trade ${escrow.tradeId} — escrow.service.ts must pass Trade's parties through`
      )
    }
    return { buyerId: escrow.buyerId, sellerId: escrow.sellerId, arbiterId: this.defaultArbiterId() }
  }

  // See this file's header comment on the single-arbiter limitation — only
  // relevant on the DISPUTED path, where `triggeredBy` is the arbiter
  // actually assigned to this dispute (dispute.service.ts's
  // resolveDispute()), which may not be the one baked into this escrow's
  // script if more than one TRUSTED_ARBITRATORS entry is configured.
  private assertArbiterMatchesScript(escrow: MultisigEscrowInput) {
    if (escrow.status !== 'DISPUTED') return
    const scriptArbiter = this.defaultArbiterId()
    if (escrow.triggeredBy && escrow.triggeredBy !== scriptArbiter) {
      throw new EscrowError(
        `MULTISIG provider: dispute arbiter '${escrow.triggeredBy}' does not match the arbiter key ('${scriptArbiter}') baked into this escrow's script at creation time. ` +
        'This reference implementation only supports a single-arbiter TRUSTED_ARBITRATORS configuration for MULTISIG escrows.'
      )
    }
  }

  // Not part of SettlementProvider — called directly by escrow.service.ts's
  // createEscrow() to populate Escrow.multisigAddr immediately, before any
  // lock attempt, since (unlike MOCK/WDK_USDT_EVM) this provider never
  // pushes funds in itself; the seller needs the address up front.
  async getDepositAddress(tradeId: string, buyerId: string, sellerId: string): Promise<string> {
    const { p2wsh } = this.buildScript({ buyerId, sellerId, arbiterId: this.defaultArbiterId() })
    if (!p2wsh.address) throw new EscrowError(`Failed to derive a P2WSH address for trade ${tradeId}`)
    return p2wsh.address
  }

  private async fetchUtxos(address: string): Promise<ExplorerUtxo[]> {
    const res = await fetch(`${config.multisig.explorerApiUrl}/address/${address}/utxo`)
    if (!res.ok) {
      throw new EscrowError(`MULTISIG provider: explorer API returned ${res.status} for ${address}`)
    }
    return res.json() as Promise<ExplorerUtxo[]>
  }

  private expectedSats(lockedAmount: string): number {
    return Math.round(parseFloat(lockedAmount) * 1e8)
  }

  async lockFunds(escrow: MultisigEscrowInput): Promise<{ txId: string; address: string }> {
    const parties = this.partiesFor(escrow)
    const { p2wsh } = this.buildScript(parties)
    const address = p2wsh.address!

    const utxos = await this.fetchUtxos(address)
    const expected = this.expectedSats(escrow.lockedAmount)
    const funding = utxos.find((u) => u.value >= expected)
    if (!funding) {
      throw new EscrowError(
        `No funding UTXO of at least ${expected} sats found at ${address} yet. This is a non-custodial provider — ` +
        `it verifies external funding, it does not move funds itself. Send the trade's collateral to ${address} first, then retry lockFunds.`
      )
    }
    return { txId: funding.txid, address }
  }

  async verifyLock(escrow: MultisigEscrowInput): Promise<boolean> {
    const parties = this.partiesFor(escrow)
    const { p2wsh } = this.buildScript(parties)
    const utxos = await this.fetchUtxos(p2wsh.address!)
    const expected = this.expectedSats(escrow.lockedAmount)
    return utxos.some((u) => u.value >= expected && u.status.confirmed)
  }

  private async buildSpendTx(escrow: MultisigEscrowInput, toAddress: string, signers: BIP32Interface[]) {
    const parties = this.partiesFor(escrow)
    const { p2ms, p2wsh, network } = this.buildScript(parties)

    if (!escrow.txLockId) {
      throw new EscrowError(`Escrow for trade ${escrow.tradeId} has no recorded funding txid (txLockId) — cannot spend before lockFunds() has confirmed one`)
    }

    const utxos = await this.fetchUtxos(p2wsh.address!)
    const utxo = utxos.find((u) => u.txid === escrow.txLockId)
    if (!utxo) {
      throw new EscrowError(`Funding UTXO ${escrow.txLockId} for ${p2wsh.address} not found by the explorer — it may already be spent`)
    }

    // A flat, generous reference fee — a real deployment would query the
    // explorer's fee-estimate endpoint instead of a hardcoded constant;
    // documented here rather than silently arbitrary.
    const feeSats = 1000n
    const outputValue = BigInt(utxo.value) - feeSats
    if (outputValue <= 0n) {
      throw new EscrowError(`UTXO value ${utxo.value} sats too small to cover the ${feeSats} sat reference fee`)
    }

    const psbt = new bitcoin.Psbt({ network })
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: p2wsh.output!, value: BigInt(utxo.value) },
      witnessScript: p2ms.output!,
    })
    psbt.addOutput({ address: toAddress, value: outputValue })

    for (const signer of signers) {
      const keyPair = ECPair.fromPrivateKey(Buffer.from(signer.privateKey!), { network })
      psbt.signInput(0, keyPair)
    }
    psbt.finalizeAllInputs()
    return psbt.extractTransaction()
  }

  private async broadcast(txHex: string): Promise<string> {
    const res = await fetch(`${config.multisig.explorerApiUrl}/tx`, { method: 'POST', body: txHex })
    if (!res.ok) {
      throw new EscrowError(`MULTISIG provider: broadcast failed with ${res.status}: ${await res.text()}`)
    }
    return (await res.text()).trim()
  }

  async releaseFunds(escrow: MultisigEscrowInput, toAddress: string): Promise<{ txId: string }> {
    this.assertArbiterMatchesScript(escrow)
    const parties = this.partiesFor(escrow)
    const buyerKey = this.deriveKey('buyer', parties.buyerId)
    // Normal (non-disputed) release: buyer confirmed payment, seller
    // triggered release — buyer+seller satisfy 2-of-3 without the arbiter.
    // Disputed release (ruling: RELEASE, favors the buyer): the arbiter
    // co-signs with the buyer instead, since a real dispute means the
    // seller does not agree.
    const signers = escrow.status === 'DISPUTED'
      ? [buyerKey, this.deriveKey('arbiter', parties.arbiterId)]
      : [buyerKey, this.deriveKey('seller', parties.sellerId)]
    const tx = await this.buildSpendTx(escrow, toAddress, signers)
    const txId = await this.broadcast(tx.toHex())
    return { txId }
  }

  async refundFunds(escrow: MultisigEscrowInput): Promise<{ txId: string }> {
    this.assertArbiterMatchesScript(escrow)
    const parties = this.partiesFor(escrow)
    const sellerKey = this.deriveKey('seller', parties.sellerId)
    // Refund-to-seller: the mirror of releaseFunds above. Disputed refund
    // (ruling: REFUND, favors the seller): arbiter co-signs with the
    // seller instead of the buyer.
    const signers = escrow.status === 'DISPUTED'
      ? [sellerKey, this.deriveKey('arbiter', parties.arbiterId)]
      : [sellerKey, this.deriveKey('buyer', parties.buyerId)]

    // Refund address = seller's own derived-key P2WPKH address — a
    // reference stand-in, since no per-user BTC payout address exists in
    // the schema yet (dispute.service.ts's own comment already flags this
    // exact gap for WDK's releaseToAddress).
    const network = networkFor(config.multisig.network)
    const sellerRefundAddress = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(sellerKey.publicKey), network }).address!

    const tx = await this.buildSpendTx(escrow, sellerRefundAddress, signers)
    const txId = await this.broadcast(tx.toHex())
    return { txId }
  }
}

export const multisigProvider = new MultisigProvider()
