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
 * Custody model — updated 2026-07-27 (client-held keys pass): the buyer
 * and seller each generate their own key CLIENT-SIDE (`@sails/sdk`'s
 * escrow-key module) and submit only the public key
 * (`POST /v1/settlement/escrow/:id/submit-key`, persisted as
 * `EscrowParticipantKey`) — this provider never sees, derives, or holds
 * either of their private keys. Only the THIRD key (arbiter) is still
 * derived from a server-held seed (`MULTISIG_SEED`) — the same role
 * HodlHodl's own real design has the platform hold (confirmed against
 * their public docs before this provider was built). This closes the
 * gap the provider's own header used to disclose here ("all three keys
 * derived from one server-held seed") for the address/script side.
 *
 * Consequence, stated plainly rather than silently broken:
 * `releaseFunds()`/`refundFunds()` used to sign with 2 of 3 keys
 * server-side, synchronously, in one call — that's no longer possible
 * now that buyer/seller keys are client-held. Both methods throw a clear
 * `EscrowError` below rather than attempting (and failing) to sign with a
 * key this provider doesn't have. A real release/refund needs a
 * signature-collection flow (server builds an unsigned PSBT, each
 * required party fetches + signs + submits their own signature
 * client-side) — scoped as an explicit, separate Phase 2, not built yet.
 * `TODO.md` §4 tracks it.
 *
 * Non-custodial in the fund-movement sense — unlike MOCK/WDK_USDT_EVM,
 * this provider never pushes funds into escrow itself. The seller sends
 * BTC to the deterministic address (exposed via getDepositAddress(),
 * populated onto Escrow.multisigAddr by escrow.service.ts's
 * submitParticipantKey() once BOTH buyer and seller pubkeys have arrived
 * — no longer at creation time, since the address genuinely cannot exist
 * before both real pubkeys do) using their own wallet; lockFunds() only
 * verifies that funding arrived (queries a public block-explorer API)
 * rather than causing it.
 *
 * Single-arbiter limitation, stated plainly rather than silently wrong: the
 * P2WSH script's third key is fixed at escrow-creation time to
 * config.settlement.trustedArbitrators[0] (see defaultArbiterId()) — it
 * cannot depend on whichever arbiter TrustedArbitratorProvider's
 * round-robin later assigns to an actual dispute (arbitration-provider.ts),
 * since the script must exist before any dispute does. Moot for now
 * while releaseFunds()/refundFunds() are Phase-2-not-built (above), but
 * documented here since it becomes relevant again once that ships.
 *
 * Testnet only. MULTISIG_SEED empty by default — same "surface a clear
 * config error, don't refuse to boot" pattern as WDK_SEED_PHRASE.
 */
import * as ecc from 'tiny-secp256k1'
import { BIP32Factory, type BIP32Interface } from 'bip32'
import * as bitcoin from 'bitcoinjs-lib'
import { createHash } from 'crypto'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import type { SettlementProvider } from './escrow.service'

bitcoin.initEccLib(ecc)
const bip32 = BIP32Factory(ecc)

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
  buyerPubkey: Buffer   // 33-byte compressed secp256k1, client-submitted
  sellerPubkey: Buffer  // 33-byte compressed secp256k1, client-submitted
  arbiterId: string     // still server-derived — see this file's header comment
}

// Minimal shape this provider actually needs from an EscrowRecord — a
// structural subset, not the full type, so tests can construct fixtures
// without importing escrow.service.ts's internal type.
export type MultisigEscrowInput = {
  tradeId: string
  lockedAmount: string
  buyerPubkey?: string   // hex, 33-byte compressed — from EscrowParticipantKey
  sellerPubkey?: string  // hex, 33-byte compressed — from EscrowParticipantKey
  txLockId?: string | null
  status?: string
  triggeredBy?: string
}

export class MultisigProvider implements SettlementProvider {
  name = 'MULTISIG'
  readonly custodyModel = 'client-held-buyer-seller-keys-server-held-arbiter' as const

  private masterNode: BIP32Interface | null = null

  private getMaster(): BIP32Interface {
    if (this.masterNode) return this.masterNode
    if (!config.multisig.seed) {
      throw new EscrowError(
        'MULTISIG provider requires MULTISIG_SEED configured (.env.example) — refusing to derive the arbiter key from an empty seed'
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

  // Arbiter is the only role this provider still derives itself — buyer
  // and seller keys are client-submitted (see partiesFor()).
  private deriveArbiterKey(id: string): BIP32Interface {
    const master = this.getMaster()
    const index = keyIndexFor('arbiter', id)
    return master.derivePath(`m/0'/0/${index}`)
  }

  // Sorted pubkey order (lexicographic, BIP67-style) — deterministic
  // regardless of submission order, so the same 3 parties always produce
  // the same script/address.
  private buildScript(parties: MultisigParties) {
    const network = networkFor(config.multisig.network)
    const arbiterKey = this.deriveArbiterKey(parties.arbiterId)

    const pubkeys = [parties.buyerPubkey, parties.sellerPubkey, Buffer.from(arbiterKey.publicKey)]
      .sort(Buffer.compare)

    const p2ms = bitcoin.payments.p2ms({ m: 2, pubkeys, network })
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network })

    return { p2ms, p2wsh, arbiterKey, network }
  }

  private parsePubkey(hex: string | undefined, role: 'buyer' | 'seller', tradeId: string): Buffer {
    if (!hex) {
      throw new EscrowError(
        `MULTISIG provider requires a submitted ${role} pubkey for trade ${tradeId} — call POST /v1/settlement/escrow/:id/submit-key first (see EscrowParticipantKey)`
      )
    }
    const buf = Buffer.from(hex, 'hex')
    if (buf.length !== 33) {
      throw new EscrowError(`MULTISIG provider: ${role} pubkey for trade ${tradeId} must be a 33-byte compressed secp256k1 key, got ${buf.length} bytes`)
    }
    return buf
  }

  private partiesFor(escrow: MultisigEscrowInput): MultisigParties {
    return {
      buyerPubkey: this.parsePubkey(escrow.buyerPubkey, 'buyer', escrow.tradeId),
      sellerPubkey: this.parsePubkey(escrow.sellerPubkey, 'seller', escrow.tradeId),
      arbiterId: this.defaultArbiterId(),
    }
  }

  // Not part of SettlementProvider — called by escrow.service.ts's
  // submitParticipantKey() once BOTH buyer and seller pubkeys have been
  // submitted, to populate Escrow.multisigAddr. Takes the raw submitted
  // hex directly (not an EscrowEscrowInput) since this runs before any
  // Escrow-shaped object with those fields necessarily exists in the
  // caller's hands.
  async getDepositAddress(tradeId: string, buyerPubkeyHex: string, sellerPubkeyHex: string): Promise<string> {
    const parties: MultisigParties = {
      buyerPubkey: this.parsePubkey(buyerPubkeyHex, 'buyer', tradeId),
      sellerPubkey: this.parsePubkey(sellerPubkeyHex, 'seller', tradeId),
      arbiterId: this.defaultArbiterId(),
    }
    const { p2wsh } = this.buildScript(parties)
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

  // Phase 2, not built yet — see this file's header comment. The buyer's
  // and seller's private keys are now client-held; this provider
  // structurally cannot sign with either anymore. A real release needs a
  // signature-collection flow (unsigned PSBT built server-side, each
  // required party fetches + signs + submits their own signature) that
  // doesn't exist yet. Throwing here, honestly, rather than attempting a
  // signature this provider has no key for.
  async releaseFunds(_escrow: MultisigEscrowInput, _toAddress: string): Promise<{ txId: string }> {
    throw new EscrowError(
      'MULTISIG provider: releaseFunds() requires client-submitted signatures now that buyer/seller keys are client-held (Phase 2 — signature collection — not yet built). See docs/TODO.md §4.'
    )
  }

  // Same reason as releaseFunds() above.
  async refundFunds(_escrow: MultisigEscrowInput): Promise<{ txId: string }> {
    throw new EscrowError(
      'MULTISIG provider: refundFunds() requires client-submitted signatures now that buyer/seller keys are client-held (Phase 2 — signature collection — not yet built). See docs/TODO.md §4.'
    )
  }
}

export const multisigProvider = new MultisigProvider()
