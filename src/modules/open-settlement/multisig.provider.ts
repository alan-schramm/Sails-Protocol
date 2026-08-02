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
 * Consequence, now resolved (Phase 2, 2026-07-27): `releaseFunds()`/
 * `refundFunds()` used to sign with 2 of 3 keys server-side, synchronously,
 * in one call — no longer possible now that buyer/seller keys are
 * client-held. Both `SettlementProvider` methods still throw below (they
 * are not directly callable), but the REAL release/refund path now exists
 * as a signature-collection flow: `buildUnsignedRelease()`/
 * `buildUnsignedRefund()` build an unsigned PSBT (escrow.service.ts's
 * `initiateRelease()`/`initiateRefund()`); each required party
 * independently signs their own copy client-side (`@sails/sdk`'s
 * `signEscrowPsbt()`) and submits it back
 * (`POST .../submit-transaction-signature`); once every required signer
 * has submitted, `finalizeRelease()`/`finalizeRefund()` combine the
 * independently-signed copies and broadcast — verified experimentally
 * before this was written that `Psbt.combine()` correctly merges two
 * independently-signed copies of the same unsigned PSBT (and correctly
 * fails to finalize with only one). On a `DISPUTED` release/refund, the
 * arbiter's own required signature is pre-embedded into the unsigned PSBT
 * at build time (its key is still server-derived, see below) — only the
 * other required party (buyer or seller) is a real pending client
 * submission in that case.
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
 * since the script must exist before any dispute does. Relevant now that
 * Phase 2 (above) actually builds a disputed spend: `assertArbiterMatchesScript()`
 * below still refuses a mismatched dispute-arbiter signature loudly rather
 * than attempting one that would fail to validate against this escrow's
 * baked-in script.
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
  // Trade's own party ids (not pubkeys) — needed by buildUnsignedRelease()/
  // buildUnsignedRefund() below to know WHICH participant id each required
  // client signature must come from. Distinct from buyerPubkey/sellerPubkey
  // above (script material) the same way escrow.service.ts's EscrowRecord
  // already separates the two.
  buyerId?: string
  sellerId?: string
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

  private async broadcast(txHex: string): Promise<string> {
    const res = await fetch(`${config.multisig.explorerApiUrl}/tx`, { method: 'POST', body: txHex })
    if (!res.ok) {
      throw new EscrowError(`MULTISIG provider: broadcast failed with ${res.status}: ${await res.text()}`)
    }
    return (await res.text()).trim()
  }

  // Shared by buildUnsignedRelease()/buildUnsignedRefund()/
  // buildUnsignedSplit() below — builds the unsigned spend PSBT against
  // the escrow's recorded funding UTXO. Does not sign anything; the
  // caller decides whether the arbiter pre-signs (disputed path) before
  // handing the result to clients. Takes an output-computing callback
  // rather than a fixed toAddress/value (RFC-021 D9, 2026-08-02) so
  // buildUnsignedSplit() can add two outputs against the same
  // fee-adjusted spendable value release/refund each add just one against
  // — the script itself (2-of-3, no per-output covenant) doesn't care how
  // many outputs a valid spend has.
  private async buildUnsignedSpend(
    escrow: MultisigEscrowInput,
    parties: MultisigParties,
    computeOutputs: (spendableValue: bigint) => Array<{ address: string; value: bigint }>
  ): Promise<bitcoin.Psbt> {
    this.assertArbiterMatchesScript(escrow)
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
    const spendableValue = BigInt(utxo.value) - feeSats
    if (spendableValue <= 0n) {
      throw new EscrowError(`UTXO value ${utxo.value} sats too small to cover the ${feeSats} sat reference fee`)
    }

    const psbt = new bitcoin.Psbt({ network })
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: p2wsh.output!, value: BigInt(utxo.value) },
      witnessScript: p2ms.output!,
    })
    for (const output of computeOutputs(spendableValue)) {
      psbt.addOutput({ address: output.address, value: output.value })
    }
    return psbt
  }

  // Real Phase 2 (2026-07-27) — see this file's header comment for the
  // full flow. Builds but does NOT fully sign a release PSBT: normal path
  // returns it fully unsigned with both buyer and seller as required
  // signers; disputed path pre-signs with the server-held arbiter key
  // (mirroring the old pre-Phase-1 signer selection — arbiter co-signs
  // with the buyer, favoring the RELEASE ruling) and returns only the
  // buyer as a required (real, client) signer.
  async buildUnsignedRelease(escrow: MultisigEscrowInput, toAddress: string): Promise<{ psbtBase64: string; requiredSigners: string[] }> {
    const parties = this.partiesFor(escrow)
    const psbt = await this.buildUnsignedSpend(escrow, parties, (spendableValue) => [{ address: toAddress, value: spendableValue }])

    if (escrow.status === 'DISPUTED') {
      const arbiterKey = this.deriveArbiterKey(parties.arbiterId)
      psbt.signInput(0, arbiterKey as unknown as bitcoin.Signer)
      if (!escrow.buyerId) {
        throw new EscrowError(`MULTISIG provider: missing buyerId for disputed release of trade ${escrow.tradeId}`)
      }
      return { psbtBase64: psbt.toBase64(), requiredSigners: [escrow.buyerId] }
    }

    if (!escrow.buyerId || !escrow.sellerId) {
      throw new EscrowError(`MULTISIG provider: missing buyerId/sellerId for release of trade ${escrow.tradeId}`)
    }
    return { psbtBase64: psbt.toBase64(), requiredSigners: [escrow.buyerId, escrow.sellerId] }
  }

  // Mirror of buildUnsignedRelease() above, for refund-to-seller. Refund
  // address = the seller's own CLIENT-SUBMITTED pubkey's P2WPKH form — a
  // reference stand-in (no per-user BTC payout address exists in the
  // schema yet, same gap dispute.service.ts's own comment already flags
  // for WDK's releaseToAddress), and only needs the seller's PUBLIC key
  // (p2wpkh() takes a pubkey, not a private key) so it stays derivable
  // even though this provider never holds the seller's private key.
  async buildUnsignedRefund(escrow: MultisigEscrowInput): Promise<{ psbtBase64: string; requiredSigners: string[]; toAddress: string }> {
    const parties = this.partiesFor(escrow)
    const network = networkFor(config.multisig.network)
    const sellerRefundAddress = bitcoin.payments.p2wpkh({ pubkey: parties.sellerPubkey, network }).address!

    const psbt = await this.buildUnsignedSpend(escrow, parties, (spendableValue) => [{ address: sellerRefundAddress, value: spendableValue }])

    if (escrow.status === 'DISPUTED') {
      const arbiterKey = this.deriveArbiterKey(parties.arbiterId)
      psbt.signInput(0, arbiterKey as unknown as bitcoin.Signer)
      if (!escrow.sellerId) {
        throw new EscrowError(`MULTISIG provider: missing sellerId for disputed refund of trade ${escrow.tradeId}`)
      }
      return { psbtBase64: psbt.toBase64(), requiredSigners: [escrow.sellerId], toAddress: sellerRefundAddress }
    }

    if (!escrow.buyerId || !escrow.sellerId) {
      throw new EscrowError(`MULTISIG provider: missing buyerId/sellerId for refund of trade ${escrow.tradeId}`)
    }
    return { psbtBase64: psbt.toBase64(), requiredSigners: [escrow.sellerId, escrow.buyerId], toAddress: sellerRefundAddress }
  }

  // RFC-021 D9 (2026-08-02) — real, unlike SAFE_GUARD_EVM/LIGHTNING_HODL's
  // own buildUnsignedSplit() overrides: this script is a plain 2-of-3
  // P2WSH multisig with no per-output covenant, so it validates a spend
  // with two outputs exactly as readily as one. Always the disputed
  // shape (SPLIT is only ever reached via VALID_TRANSITIONS.DISPUTED ->
  // 'SPLIT' — escrow.service.ts's assertTransition already enforces this
  // before calling here) — the arbiter pre-signs, and (real constraint
  // found writing tests/multisigProvider.test.ts, not a design choice)
  // only ONE more party can be a required signer, same as a disputed
  // release/refund: this is still a 2-of-3 script, and finalizeSpend()
  // combines independently-signed copies sequentially — collecting BOTH
  // buyer's and seller's copies on top of the arbiter's already-embedded
  // signature yields 3 valid signatures for a threshold of 2, which
  // bitcoinjs-lib correctly refuses to finalize ("Too many signatures").
  // Picking the buyer here, mirroring buildUnsignedRelease()'s own
  // arbiter+buyer disputed pairing above — arbitrary (the split amounts
  // are already fixed by the arbiter's ruling either way), but consistent.
  async buildUnsignedSplit(escrow: MultisigEscrowInput, buyerAddress: string, sellerAddress: string, buyerBps: number): Promise<{ psbtBase64: string; requiredSigners: string[] }> {
    const parties = this.partiesFor(escrow)
    const psbt = await this.buildUnsignedSpend(escrow, parties, (spendableValue) => {
      const buyerValue = (spendableValue * BigInt(buyerBps)) / 10000n
      const sellerValue = spendableValue - buyerValue
      return [
        { address: buyerAddress, value: buyerValue },
        { address: sellerAddress, value: sellerValue },
      ]
    })

    const arbiterKey = this.deriveArbiterKey(parties.arbiterId)
    psbt.signInput(0, arbiterKey as unknown as bitcoin.Signer)
    if (!escrow.buyerId) {
      throw new EscrowError(`MULTISIG provider: missing buyerId for disputed split of trade ${escrow.tradeId}`)
    }
    return { psbtBase64: psbt.toBase64(), requiredSigners: [escrow.buyerId] }
  }

  // Shared finalize: combines the unsigned PSBT with every independently-
  // signed copy submitted by the required signers (verified experimentally
  // — see this file's header comment — that Psbt.combine() correctly
  // merges independent copies of the SAME unsigned PSBT) and broadcasts.
  // On the disputed path, unsignedPsbtBase64 already carries the arbiter's
  // partial signature (embedded by buildUnsignedRelease/Refund above), so
  // combining it with the single client-submitted copy still yields both
  // required signatures.
  private async finalizeSpend(escrow: MultisigEscrowInput, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }> {
    const network = networkFor(config.multisig.network)
    let merged: bitcoin.Psbt
    try {
      merged = bitcoin.Psbt.fromBase64(unsignedPsbtBase64, { network })
      for (const signed of signedPsbtBase64List) {
        merged.combine(bitcoin.Psbt.fromBase64(signed, { network }))
      }
      merged.finalizeAllInputs()
    } catch (err) {
      throw new EscrowError(
        `MULTISIG provider: failed to combine/finalize signatures for trade ${escrow.tradeId}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
    const tx = merged.extractTransaction()
    const txId = await this.broadcast(tx.toHex())
    return { txId }
  }

  async finalizeRelease(escrow: MultisigEscrowInput, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }> {
    return this.finalizeSpend(escrow, unsignedPsbtBase64, signedPsbtBase64List)
  }

  async finalizeRefund(escrow: MultisigEscrowInput, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }> {
    return this.finalizeSpend(escrow, unsignedPsbtBase64, signedPsbtBase64List)
  }

  async finalizeSplit(escrow: MultisigEscrowInput, unsignedPsbtBase64: string, signedPsbtBase64List: string[]): Promise<{ txId: string }> {
    return this.finalizeSpend(escrow, unsignedPsbtBase64, signedPsbtBase64List)
  }

  // Not directly callable — the SettlementProvider interface still
  // requires these methods, but buyer/seller keys are client-held, so a
  // real release needs the multi-step flow above instead of a single
  // synchronous call. Kept as loud, explanatory throws (not silently
  // wrong) rather than removed, since escrow.service.ts's own
  // releaseFunds()/refundFunds() (the MOCK/WDK_USDT_EVM path) still calls
  // through this same interface for every SettlementProvider.
  async releaseFunds(_escrow: MultisigEscrowInput, _toAddress: string): Promise<{ txId: string }> {
    throw new EscrowError(
      'MULTISIG provider: releaseFunds() is not directly callable — buyer/seller keys are client-held. ' +
      'Use POST /v1/settlement/escrow/:id/initiate-release, then submit-transaction-signature, instead (see escrow.service.ts).'
    )
  }

  async refundFunds(_escrow: MultisigEscrowInput): Promise<{ txId: string }> {
    throw new EscrowError(
      'MULTISIG provider: refundFunds() is not directly callable — buyer/seller keys are client-held. ' +
      'Use POST /v1/settlement/escrow/:id/initiate-refund, then submit-transaction-signature, instead (see escrow.service.ts).'
    )
  }
}

export const multisigProvider = new MultisigProvider()
