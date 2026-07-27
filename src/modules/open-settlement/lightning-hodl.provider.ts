/**
 * Sails OpenSettlement — LIGHTNING_HODL SettlementProvider, real via Arkade
 *
 * Replaces the previous throw-only stub (`EscrowError('Lightning HODL
 * escrow not yet implemented')`). Real Lightning (plain HTLCs) has no
 * genuine multi-party escrow primitive — confirmed directly from HodlHodl's
 * own docs: their Lightning mode is plain custodial holding on their own
 * LND node, not cryptographic escrow ("currently there are no multisig
 * escrow addresses on the Lightning Network"). Arkade (Ark protocol) is
 * different: a real, live Bitcoin L2 (VTXOs, Taproot-script-based) that
 * BOTH HodlHodl and Lendasat use today to build genuine multi-party escrow
 * on top of — same production precedent this file follows.
 *
 * Verified experimentally before writing this file, against the real
 * `@arkade-os/sdk` package and Ark Labs' own public mutinynet ASP
 * (`https://mutinynet.arkade.sh`, confirmed reachable — real `getInfo()`
 * response, real signer pubkey): deterministic key derivation via
 * `SeedIdentity`, 3-leaf `VtxoScript` construction (buyer+seller,
 * buyer+arbiter, seller+arbiter `MultisigTapscript` pairs, plus a
 * `CSVMultisigTapscript` unilateral-exit leaf), and a real Arkade address
 * produced from a live server pubkey — all confirmed working, not assumed.
 *
 * Custody model — updated 2026-07-27 (client-held keys pass, same change
 * `multisig.provider.ts` got): the buyer and seller each generate their
 * own key CLIENT-SIDE (`@sails/sdk`'s escrow-key module) and submit only
 * the public key (`POST /v1/settlement/escrow/:id/submit-key`, persisted
 * as `EscrowParticipantKey`) — this provider never sees, derives, or
 * holds either of their private keys. Only the arbiter key is still
 * server-derived. The submitted pubkey is the same 33-byte compressed
 * secp256k1 format `MultisigProvider` uses (one client key genuinely
 * serves both providers — verified experimentally that
 * `compressed[1:] === x-only`, same normalization `getServerPubKey()`
 * below already does for the ASP's own pubkey); this file strips the
 * leading byte to get the 32-byte x-only form `MultisigTapscript` wants.
 *
 * Consequence, stated plainly rather than silently broken (identical
 * reasoning to `multisig.provider.ts`): `releaseFunds()`/`refundFunds()`
 * used to co-sign with 2 of 3 keys server-side in one call — no longer
 * possible now that buyer/seller keys are client-held. Both throw a clear
 * `EscrowError` below. A real release needs a signature-collection flow
 * (server builds the unsigned Ark tx, each required party fetches + signs
 * + submits their own signature client-side) — Phase 2, not built yet,
 * `docs/TODO.md` §4 tracks it. This also retires the
 * `buildOffchainTx`/`combineTapscriptSigs`/`verifyTapscriptSignatures`/
 * `submitTx`/`finalizeTx` machinery this file previously built against
 * (still real, still correct against the documented API — just not
 * reachable from any code path until Phase 2 rebuilds the signing flow
 * around client-submitted signatures instead of server-held keys).
 *
 * Testnet (mutinynet) only. ARKADE_SEED empty by default — same
 * "surface a clear config error, don't refuse to boot" pattern as
 * WDK_SEED_PHRASE/MULTISIG_SEED.
 */
import {
  SeedIdentity,
  MultisigTapscript,
  CSVMultisigTapscript,
  VtxoScript,
  RestArkProvider,
  RestIndexerProvider,
} from '@arkade-os/sdk'
import { createHash } from 'crypto'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import type { SettlementProvider } from './escrow.service'

type ArkParties = { buyerPubkey: Uint8Array; sellerPubkey: Uint8Array; arbiterId: string }

export type ArkEscrowInput = {
  tradeId: string
  lockedAmount: string
  buyerPubkey?: string   // hex, 33-byte compressed — from EscrowParticipantKey
  sellerPubkey?: string  // hex, 33-byte compressed — from EscrowParticipantKey
  txLockId?: string | null
  status?: string
  triggeredBy?: string
}

// Kept for the arbiter role only now — buyer/seller salts are unused
// (their keys are client-submitted, not derived). Exported for direct
// unit testing, same reason it always was.
export function seedFor(role: 'buyer' | 'seller' | 'arbiter', id: string): Uint8Array {
  return createHash('sha512').update(`arkade:${role}:${id}`).digest()
}

// 33-byte compressed -> 32-byte x-only — same point, different
// serialization (verified experimentally: compressed[1:] === schnorr
// x-only pubkey for the same private key). Shared by parsePubkey() below
// and getServerPubKey()'s identical normalization of the ASP's own key.
function toXOnly(compressed: Buffer): Buffer {
  return compressed.length === 33 ? compressed.subarray(1) : compressed
}

export class LightningHodlProvider implements SettlementProvider {
  name = 'LIGHTNING_HODL'
  readonly custodyModel = 'client-held-buyer-seller-keys-server-held-arbiter' as const

  private ark: RestArkProvider | null = null
  private indexer: RestIndexerProvider | null = null
  private cachedServerPubKey: Uint8Array | null = null

  private requireSeed(): string {
    if (!config.arkade.seed) {
      throw new EscrowError(
        'LIGHTNING_HODL (Arkade) provider requires ARKADE_SEED configured (.env.example) — refusing to derive the arbiter key from an empty seed'
      )
    }
    return config.arkade.seed
  }

  private defaultArbiterId(): string {
    const arbiter = config.settlement.trustedArbitrators[0]
    if (!arbiter) {
      throw new EscrowError(
        'LIGHTNING_HODL (Arkade) provider requires at least one TRUSTED_ARBITRATORS entry configured (.env.example) — no arbiter key to derive for the 2-of-3 script'
      )
    }
    return arbiter
  }

  private getArkProvider(): RestArkProvider {
    if (!this.ark) this.ark = new RestArkProvider(config.arkade.asp)
    return this.ark
  }

  private getIndexer(): RestIndexerProvider {
    if (!this.indexer) this.indexer = new RestIndexerProvider(config.arkade.asp)
    return this.indexer
  }

  private async getServerPubKey(): Promise<Uint8Array> {
    if (this.cachedServerPubKey) return this.cachedServerPubKey
    const info = await this.getArkProvider().getInfo()
    this.cachedServerPubKey = toXOnly(Buffer.from(info.signerPubkey, 'hex'))
    return this.cachedServerPubKey
  }

  // Arbiter is the only role this provider still derives itself — buyer
  // and seller keys are client-submitted (see partiesFor()).
  private deriveArbiterKey(id: string): SeedIdentity {
    this.requireSeed()
    const material = createHash('sha512').update(config.arkade.seed).update(seedFor('arbiter', id)).digest()
    return SeedIdentity.fromSeed(material, { isMainnet: false })
  }

  private parsePubkey(hex: string | undefined, role: 'buyer' | 'seller', tradeId: string): Buffer {
    if (!hex) {
      throw new EscrowError(
        `LIGHTNING_HODL (Arkade) provider requires a submitted ${role} pubkey for trade ${tradeId} — call POST /v1/settlement/escrow/:id/submit-key first (see EscrowParticipantKey)`
      )
    }
    const buf = Buffer.from(hex, 'hex')
    if (buf.length !== 33) {
      throw new EscrowError(`LIGHTNING_HODL (Arkade) provider: ${role} pubkey for trade ${tradeId} must be a 33-byte compressed secp256k1 key, got ${buf.length} bytes`)
    }
    return buf
  }

  private partiesFor(escrow: ArkEscrowInput): ArkParties {
    return {
      buyerPubkey: toXOnly(this.parsePubkey(escrow.buyerPubkey, 'buyer', escrow.tradeId)),
      sellerPubkey: toXOnly(this.parsePubkey(escrow.sellerPubkey, 'seller', escrow.tradeId)),
      arbiterId: this.defaultArbiterId(),
    }
  }

  private async buildScript(parties: ArkParties) {
    const arbiterIdentity = this.deriveArbiterKey(parties.arbiterId)
    const arbiterPk = await arbiterIdentity.xOnlyPublicKey()
    const buyerPk = parties.buyerPubkey
    const sellerPk = parties.sellerPubkey

    // OR-of-AND-pairs — same technique multisig.provider.ts uses for real
    // Bitcoin P2WSH, here building a real Ark Taproot VtxoScript instead.
    const buyerSeller = MultisigTapscript.encode({ pubkeys: [buyerPk, sellerPk] })
    const buyerArbiter = MultisigTapscript.encode({ pubkeys: [buyerPk, arbiterPk] })
    const sellerArbiter = MultisigTapscript.encode({ pubkeys: [sellerPk, arbiterPk] })
    // Unilateral buyer exit after ~24h of blocks (144 blocks/day) — so the
    // buyer can always recover funds even with zero cooperation, per
    // VtxoScript.exitPaths()'s documented convention. Confirmed
    // experimentally that this leaf is picked up by exitPaths().
    const buyerExit = CSVMultisigTapscript.encode({ timelock: { type: 'blocks', value: 144n }, pubkeys: [buyerPk] })

    const vtxoScript = new VtxoScript([buyerSeller.script, buyerArbiter.script, sellerArbiter.script, buyerExit.script])
    const serverPubKey = await this.getServerPubKey()
    const address = vtxoScript.address(undefined, serverPubKey)

    return { vtxoScript, address, arbiterIdentity, buyerSeller, buyerArbiter, sellerArbiter, buyerExit }
  }

  // Not part of SettlementProvider — called by escrow.service.ts's
  // submitParticipantKey() once BOTH buyer and seller pubkeys have been
  // submitted, to populate Escrow.multisigAddr. Same role as
  // MultisigProvider.getDepositAddress() — takes raw submitted hex
  // directly for the same reason that one does.
  async getDepositAddress(tradeId: string, buyerPubkeyHex: string, sellerPubkeyHex: string): Promise<string> {
    const parties: ArkParties = {
      buyerPubkey: toXOnly(this.parsePubkey(buyerPubkeyHex, 'buyer', tradeId)),
      sellerPubkey: toXOnly(this.parsePubkey(sellerPubkeyHex, 'seller', tradeId)),
      arbiterId: this.defaultArbiterId(),
    }
    const { address } = await this.buildScript(parties)
    return address.encode()
  }

  private expectedSats(lockedAmount: string): number {
    return Math.round(parseFloat(lockedAmount) * 1e8)
  }

  async lockFunds(escrow: ArkEscrowInput): Promise<{ txId: string; address: string }> {
    const parties = this.partiesFor(escrow)
    const { vtxoScript, address } = await this.buildScript(parties)
    const expected = this.expectedSats(escrow.lockedAmount)

    const scriptHex = Buffer.from(vtxoScript.pkScript).toString('hex')
    const { vtxos } = await this.getIndexer().getVtxos({ scripts: [scriptHex], spendableOnly: true })
    const funding = vtxos.find((v) => v.value >= expected)
    if (!funding) {
      throw new EscrowError(
        `No spendable VTXO of at least ${expected} sats found at ${address.encode()} yet. This is a non-custodial provider — ` +
        `it verifies external funding, it does not move funds itself. Send the trade's collateral to ${address.encode()} first, then retry lockFunds.`
      )
    }
    return { txId: funding.txid, address: address.encode() }
  }

  async verifyLock(escrow: ArkEscrowInput): Promise<boolean> {
    const parties = this.partiesFor(escrow)
    const { vtxoScript } = await this.buildScript(parties)
    const expected = this.expectedSats(escrow.lockedAmount)
    const scriptHex = Buffer.from(vtxoScript.pkScript).toString('hex')
    const { vtxos } = await this.getIndexer().getVtxos({ scripts: [scriptHex], spendableOnly: true })
    return vtxos.some((v) => v.value >= expected)
  }

  // Phase 2, not built yet — see this file's header comment. The buyer's
  // and seller's private keys are now client-held; this provider
  // structurally cannot co-sign an Ark tx with either anymore. Throwing
  // here, honestly, rather than attempting a signature this provider has
  // no key for.
  async releaseFunds(_escrow: ArkEscrowInput, _toAddress: string): Promise<{ txId: string }> {
    throw new EscrowError(
      'LIGHTNING_HODL (Arkade) provider: releaseFunds() requires client-submitted signatures now that buyer/seller keys are client-held (Phase 2 — signature collection — not yet built). See docs/TODO.md §4.'
    )
  }

  // Same reason as releaseFunds() above.
  async refundFunds(_escrow: ArkEscrowInput): Promise<{ txId: string }> {
    throw new EscrowError(
      'LIGHTNING_HODL (Arkade) provider: refundFunds() requires client-submitted signatures now that buyer/seller keys are client-held (Phase 2 — signature collection — not yet built). See docs/TODO.md §4.'
    )
  }
}

export const lightningHodlProvider = new LightningHodlProvider()
