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
 * Custody model — same "state it plainly" discipline as
 * `multisig.provider.ts`'s own header comment (and this file reuses that
 * file's exact key-derivation shape, just building an Ark `VtxoScript`
 * instead of a Bitcoin P2WSH script): all 3 keys (buyer/seller/arbiter)
 * are derived from one server-held seed — genuine 2-of-3-shaped Taproot
 * script mechanics, not yet a trustless design where each counterparty
 * holds their own key. Same single-arbiter limitation as
 * `MultisigProvider` too: the script's arbiter key is fixed at
 * escrow-creation time.
 *
 * Non-custodial in the fund-movement sense — this provider never pushes
 * funds into escrow itself. `lockFunds()`/`verifyLock()` only verify that
 * a VTXO was funded externally (queried from the ASP's real indexer),
 * matching `MultisigProvider`'s pattern exactly.
 *
 * Disclosure on `releaseFunds()`/`refundFunds()`: built against the real,
 * documented `buildOffchainTx`/`combineTapscriptSigs`/
 * `verifyTapscriptSignatures`/`RestArkProvider.submitTx`+`finalizeTx`
 * functions (all confirmed to exist with these exact signatures in the
 * installed package) — but NOT executed end-to-end against a real funded
 * VTXO in this pass (that needs an actually-funded mutinynet address, a
 * further step). Same category of disclosure `WdkSettlementProvider`'s own
 * header comment already uses for its real-but-unfunded-in-this-sandbox
 * transfer path — written against the real compiled API, not fabricated,
 * but the live money-moving round trip itself is unverified here.
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
  buildOffchainTx,
  combineTapscriptSigs,
  verifyTapscriptSignatures,
  type ArkTxInput,
} from '@arkade-os/sdk'
import { createHash } from 'crypto'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import type { SettlementProvider } from './escrow.service'

type ArkParties = { buyerId: string; sellerId: string; arbiterId: string }

export type ArkEscrowInput = {
  tradeId: string
  lockedAmount: string
  buyerId?: string
  sellerId?: string
  txLockId?: string | null
  status?: string
  triggeredBy?: string
}

// Same shape as multisig.provider.ts's keyIndexFor/deriveKey — kept as an
// independent copy (not imported) since the two files build genuinely
// different script types (P2WSH vs. VtxoScript) from the derived key even
// though the derivation salt convention matches. Exported for direct
// unit testing, same reason multisig.provider.ts's is.
export function seedFor(role: 'buyer' | 'seller' | 'arbiter', id: string): Uint8Array {
  return createHash('sha512').update(`arkade:${role}:${id}`).digest()
}

export class LightningHodlProvider implements SettlementProvider {
  name = 'LIGHTNING_HODL'
  readonly custodyModel = 'server-derived-2-of-3-reference-implementation' as const

  private ark: RestArkProvider | null = null
  private indexer: RestIndexerProvider | null = null
  private cachedServerPubKey: Uint8Array | null = null

  private requireSeed(): string {
    if (!config.arkade.seed) {
      throw new EscrowError(
        'LIGHTNING_HODL (Arkade) provider requires ARKADE_SEED configured (.env.example) — refusing to derive keys from an empty seed'
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
    // ArkInfo.signerPubkey is a 33-byte compressed SEC pubkey — VtxoScript's
    // address()/CSVMultisigTapscript want the 32-byte x-only key. Confirmed
    // experimentally (a bare 33-byte value throws "Invalid server public
    // key length, expected 32 bytes, got 33").
    const raw = Buffer.from(info.signerPubkey, 'hex')
    this.cachedServerPubKey = raw.length === 33 ? raw.subarray(1) : raw
    return this.cachedServerPubKey
  }

  private deriveKey(role: 'buyer' | 'seller' | 'arbiter', id: string): SeedIdentity {
    this.requireSeed()
    // Reference-seed + role/id salt (same convention as
    // multisig.provider.ts's keyIndexFor) — SeedIdentity wants a full
    // 64-byte seed rather than a BIP-32 index, so this mixes the shared
    // reference seed into the salted hash rather than deriving an index.
    const material = createHash('sha512').update(config.arkade.seed).update(seedFor(role, id)).digest()
    return SeedIdentity.fromSeed(material, { isMainnet: false })
  }

  private partiesFor(escrow: ArkEscrowInput): ArkParties {
    if (!escrow.buyerId || !escrow.sellerId) {
      throw new EscrowError(
        `LIGHTNING_HODL (Arkade) provider requires buyerId/sellerId for trade ${escrow.tradeId} — escrow.service.ts must pass Trade's parties through`
      )
    }
    return { buyerId: escrow.buyerId, sellerId: escrow.sellerId, arbiterId: this.defaultArbiterId() }
  }

  // Same single-arbiter limitation as multisig.provider.ts's
  // assertArbiterMatchesScript() — the script's arbiter key is fixed at
  // creation time and cannot depend on whichever arbiter
  // TrustedArbitratorProvider's round-robin later assigns to an actual
  // dispute.
  private assertArbiterMatchesScript(escrow: ArkEscrowInput) {
    if (escrow.status !== 'DISPUTED') return
    const scriptArbiter = this.defaultArbiterId()
    if (escrow.triggeredBy && escrow.triggeredBy !== scriptArbiter) {
      throw new EscrowError(
        `LIGHTNING_HODL (Arkade) provider: dispute arbiter '${escrow.triggeredBy}' does not match the arbiter key ('${scriptArbiter}') baked into this escrow's script at creation time. ` +
        'This reference implementation only supports a single-arbiter TRUSTED_ARBITRATORS configuration.'
      )
    }
  }

  private async buildScript(parties: ArkParties) {
    const buyerIdentity = this.deriveKey('buyer', parties.buyerId)
    const sellerIdentity = this.deriveKey('seller', parties.sellerId)
    const arbiterIdentity = this.deriveKey('arbiter', parties.arbiterId)

    const [buyerPk, sellerPk, arbiterPk] = await Promise.all([
      buyerIdentity.xOnlyPublicKey(),
      sellerIdentity.xOnlyPublicKey(),
      arbiterIdentity.xOnlyPublicKey(),
    ])

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

    return { vtxoScript, address, buyerIdentity, sellerIdentity, arbiterIdentity, buyerSeller, buyerArbiter, sellerArbiter, buyerExit }
  }

  // Not part of SettlementProvider — called directly by escrow.service.ts's
  // createEscrow() to populate Escrow.multisigAddr immediately, same role
  // as MultisigProvider.getDepositAddress().
  async getDepositAddress(tradeId: string, buyerId: string, sellerId: string): Promise<string> {
    const { address } = await this.buildScript({ buyerId, sellerId, arbiterId: this.defaultArbiterId() })
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

  // Shared by releaseFunds()/refundFunds() below — builds, co-signs
  // (buyer+seller normal path; buyer+arbiter / seller+arbiter on a
  // DISPUTED escrow, mirroring MultisigProvider's identical logic), and
  // submits a real offchain Ark transaction spending the funding VTXO to
  // `toAddress`. See this file's header comment for the disclosure on
  // this method specifically: built against the real, documented SDK
  // functions, not executed end-to-end against a funded VTXO in this pass.
  private async spend(escrow: ArkEscrowInput, toAddress: string, signers: readonly [SeedIdentity, SeedIdentity], leaf: { script: Uint8Array }) {
    const parties = this.partiesFor(escrow)
    const { vtxoScript, buyerExit } = await this.buildScript(parties)

    if (!escrow.txLockId) {
      throw new EscrowError(`Escrow for trade ${escrow.tradeId} has no recorded funding txid (txLockId) — cannot spend before lockFunds() has confirmed one`)
    }
    const scriptHex = Buffer.from(vtxoScript.pkScript).toString('hex')
    const { vtxos } = await this.getIndexer().getVtxos({ scripts: [scriptHex], spendableOnly: true })
    const vtxo = vtxos.find((v) => v.txid === escrow.txLockId)
    if (!vtxo) {
      throw new EscrowError(`Funding VTXO ${escrow.txLockId} for this escrow's Arkade script not found by the indexer — it may already be spent`)
    }

    const tapLeafScript = vtxoScript.findLeaf(Buffer.from(leaf.script).toString('hex'))
    const input: ArkTxInput = {
      tapLeafScript,
      tapTree: vtxoScript.encode(),
      txid: vtxo.txid,
      vout: vtxo.vout,
      value: vtxo.value,
    }
    const toScript = Buffer.from(toAddress, 'hex') // caller passes a raw script; see releaseFunds/refundFunds

    const { arkTx, checkpoints } = buildOffchainTx([input], [{ script: toScript, amount: BigInt(vtxo.value) }], buyerExit)

    // Co-sign: each identity signs its own copy of the tx, then the two
    // signed copies are merged — same two-independent-signatures pattern
    // multisig.provider.ts's PSBT flow uses, adapted to Ark's
    // combineTapscriptSigs helper (Ark txs aren't PSBTs).
    const [signerA, signerB] = signers
    const signedByA = await signerA.sign(arkTx, [0])
    const signedByB = await signerB.sign(arkTx, [0])
    const finalArkTx = combineTapscriptSigs(signedByA, signedByB)
    verifyTapscriptSignatures(finalArkTx, 0, [
      Buffer.from(await signerA.xOnlyPublicKey()).toString('hex'),
      Buffer.from(await signerB.xOnlyPublicKey()).toString('hex'),
    ])

    // Checkpoint transactions carry the same tapscript spending condition
    // as the main ark tx for this input, so they need the identical
    // two-party co-signature before submission.
    const signedCheckpoints = await Promise.all(
      checkpoints.map(async (cp) => {
        const a = await signerA.sign(cp, [0])
        const b = await signerB.sign(cp, [0])
        return combineTapscriptSigs(a, b).hex
      })
    )

    const submitted = await this.getArkProvider().submitTx(finalArkTx.hex, signedCheckpoints)
    await this.getArkProvider().finalizeTx(submitted.arkTxid, submitted.signedCheckpointTxs)
    return { txId: submitted.arkTxid }
  }

  async releaseFunds(escrow: ArkEscrowInput, toAddress: string): Promise<{ txId: string }> {
    this.assertArbiterMatchesScript(escrow)
    const parties = this.partiesFor(escrow)
    const { buyerIdentity, sellerIdentity, arbiterIdentity, buyerSeller, buyerArbiter } = await this.buildScript(parties)
    // Normal release: buyer+seller. Disputed (ruling favors buyer): arbiter co-signs with the buyer.
    const [signers, leaf] = escrow.status === 'DISPUTED'
      ? ([[buyerIdentity, arbiterIdentity], buyerArbiter] as const)
      : ([[buyerIdentity, sellerIdentity], buyerSeller] as const)
    return this.spend(escrow, toAddress, signers, leaf)
  }

  async refundFunds(escrow: ArkEscrowInput): Promise<{ txId: string }> {
    this.assertArbiterMatchesScript(escrow)
    const parties = this.partiesFor(escrow)
    const { vtxoScript, buyerIdentity, sellerIdentity, arbiterIdentity, buyerSeller, sellerArbiter } = await this.buildScript(parties)
    // Refund-to-seller: mirror of releaseFunds. Disputed (ruling favors seller): arbiter co-signs with the seller.
    const [signers, leaf] = escrow.status === 'DISPUTED'
      ? ([[sellerIdentity, arbiterIdentity], sellerArbiter] as const)
      : ([[buyerIdentity, sellerIdentity], buyerSeller] as const)
    const sellerPk = await sellerIdentity.xOnlyPublicKey()
    const serverPubKey = await this.getServerPubKey()
    // Seller's own single-key Ark address, same reference-implementation
    // stand-in multisig.provider.ts's refundFunds() already uses (no
    // per-user payout address exists in the schema yet — dispute.service.ts's
    // own comment flags this same gap for WDK).
    const sellerScript = new VtxoScript([CSVMultisigTapscript.encode({ timelock: { type: 'blocks', value: 1n }, pubkeys: [sellerPk] }).script])
    const sellerAddress = sellerScript.address(undefined, serverPubKey)
    const toScriptHex = Buffer.from(sellerAddress.pkScript ?? vtxoScript.pkScript).toString('hex')
    return this.spend(escrow, toScriptHex, signers, leaf)
  }
}

export const lightningHodlProvider = new LightningHodlProvider()
