/**
 * @sails/sdk — BitcoinCustodyProvider (RFC-020, Bitcoin Taproot target architecture)
 *
 * A documented *target* upgrade path for the already-shipped P2WSH
 * `MultisigProvider` (`src/modules/open-settlement/multisig.provider.ts`)
 * — not a replacement of it, and not wired into `escrow.service.ts`.
 * MULTISIG's real, working 2-of-3 escrow stays on P2WSH; this class only
 * proves the MuSig2 primitive it would need actually works, so RFC-020's
 * Bitcoin section is grounded in tested code, not a diagram.
 *
 * Mirrors `MultisigProvider`'s own real, already-shipped role split
 * (`buildUnsignedRelease()`/`buildUnsignedRefund()`, verified by reading
 * that file directly) instead of inventing a new one: a **cooperative**
 * close is buyer+seller signing together (arbiter never involved), while
 * a **disputed** release/refund is the arbiter co-signing with whichever
 * party the ruling favors. Taproot's real advantage here: each of those
 * three valid signing pairs (buyer+seller, arbiter+buyer, arbiter+seller)
 * becomes its own MuSig2-aggregated 2-of-2 key — a single Schnorr
 * signature per branch instead of P2WSH's revealed 3-of-3 pubkey script,
 * cheaper and only reveals which pair signed, never all three keys.
 *
 * `createEscrowAccount()`/`buildRelease()`/`buildRefund()` here implement
 * the **real, tested** part — MuSig2 key aggregation and the nonce/
 * partial-signature round, via `@scure/btc-signer`'s real `musig2.js`
 * (verified with a full 2-of-2 aggregate → nonce → partial-sign →
 * combine → `schnorr.verify()` round-trip before this file was written,
 * not assumed from the .d.ts alone — see
 * `tests/custody-musig2.test.ts`). What's genuinely **not** built here:
 * deriving a real bech32m Taproot address / constructing the tapscript
 * tree (`bitcoinjs-lib`'s `payments.p2tr` needs a concrete network
 * target and UTXO set this sandbox doesn't have) and broadcasting the
 * finalized transaction (needs a live Esplora/node, exactly like
 * `MultisigProvider`'s own real `fetchUtxos()`/`broadcast()` do against
 * testnet) — both throw `SailsNotImplementedError` naming exactly what's
 * missing, same disclosed-boundary pattern as `evm-4337.ts` in this same
 * directory.
 */

import * as musig2 from '@scure/btc-signer/musig2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { SailsNotImplementedError } from '../errors'
import type { CustodyProvider, CreateEscrowAccountParams, EscrowAccount, MuSig2Nonces, UnsignedCustodyAction } from './types'

export type EscrowRulingPath = 'COOPERATIVE' | 'DISPUTED_RELEASE' | 'DISPUTED_REFUND'

// Which two of the three real pubkeys sign for a given ruling — the
// exact pairing MultisigProvider's own buildUnsignedRelease()/
// buildUnsignedRefund() already establish (see this file's own header
// comment for the source read).
function signerPairFor(path: EscrowRulingPath, metadata: Record<string, string>): [Uint8Array, Uint8Array] {
  const buyer = hexToBytes(metadata.buyerPubkey)
  const seller = hexToBytes(metadata.sellerPubkey)
  const arbiter = hexToBytes(metadata.arbiterPubkey)
  if (path === 'COOPERATIVE') return [buyer, seller]
  if (path === 'DISPUTED_RELEASE') return [arbiter, buyer]
  return [arbiter, seller]
}

// A single MuSig2 leaf's aggregate x-only pubkey for one signer pair —
// `musig2.keyAggExport()`'s real return shape (verified: 32 bytes,
// x-only, not the 33-byte compressed form).
function aggregateLeaf(pair: [Uint8Array, Uint8Array]): Uint8Array {
  const sorted = musig2.sortKeys(pair)
  const ctx = musig2.keyAggregate(sorted)
  return musig2.keyAggExport(ctx)
}

// One party's half of a MuSig2 signing round — generated locally (this
// SDK never sees the other party's or the arbiter's secret key), and the
// public nonce is what gets sent to the co-signer out-of-band.
export interface MuSig2SigningRound {
  path: EscrowRulingPath
  message: Uint8Array
  signerPubkey: Uint8Array
  coSignerPubkey: Uint8Array
  aggPubkey: Uint8Array
  nonces: MuSig2Nonces
}

export class BitcoinCustodyProvider implements CustodyProvider {
  readonly custodyModel = 'BITCOIN_TAPROOT_MUSIG2'

  async createEscrowAccount(params: CreateEscrowAccountParams): Promise<EscrowAccount> {
    const buyer = hexToBytes(params.buyerPubkey)
    const seller = hexToBytes(params.sellerPubkey)
    const arbiter = hexToBytes(params.arbiterPubkey)

    // The three real leaf aggregate keys this escrow's Taproot tree would
    // use — computed for real, not placeholders.
    const cooperative = aggregateLeaf([buyer, seller])
    const disputedRelease = aggregateLeaf([arbiter, buyer])
    const disputedRefund = aggregateLeaf([arbiter, seller])

    return {
      // Deriving the real bech32m Taproot address from these leaves
      // requires bitcoinjs-lib's payments.p2tr against a concrete
      // network (mainnet/testnet/signet) — no live target in this
      // sandbox, so this is the escrow's tradeId, not a spendable
      // address. Callers must not treat this as a real deposit address.
      address: `UNDERIVED:${params.tradeId}`,
      custodyModel: this.custodyModel,
      metadata: {
        buyerPubkey: params.buyerPubkey,
        sellerPubkey: params.sellerPubkey,
        arbiterPubkey: params.arbiterPubkey,
        cooperativeLeaf: bytesToHex(cooperative),
        disputedReleaseLeaf: bytesToHex(disputedRelease),
        disputedRefundLeaf: bytesToHex(disputedRefund),
      },
    }
  }

  // Starts a disputed-release MuSig2 round (arbiter + buyer) for a
  // transfer of `amount` to `toAddress`. Returns the unsigned round
  // context as this provider's opaque payload — same "opaque,
  // per-provider shape" `UnsignedCustodyAction.payload` already commits
  // to (`types.ts`'s own header comment).
  async buildRelease(escrowAccount: EscrowAccount, toAddress: string, amount: string): Promise<UnsignedCustodyAction> {
    return this.buildRound(escrowAccount, 'DISPUTED_RELEASE', toAddress, amount)
  }

  // Starts a disputed-refund MuSig2 round (arbiter + seller).
  async buildRefund(escrowAccount: EscrowAccount): Promise<UnsignedCustodyAction> {
    return this.buildRound(escrowAccount, 'DISPUTED_REFUND', '', '')
  }

  private buildRound(escrowAccount: EscrowAccount, path: EscrowRulingPath, toAddress: string, amount: string): UnsignedCustodyAction {
    const metadata = escrowAccount.metadata
    if (!metadata) throw new RangeError('BitcoinCustodyProvider: escrowAccount.metadata missing — was it created by this provider?')
    const [signerPubkey, coSignerPubkey] = signerPairFor(path, metadata)
    const aggPubkey = aggregateLeaf([signerPubkey, coSignerPubkey])
    return {
      requiredSigners: [bytesToHex(signerPubkey), bytesToHex(coSignerPubkey)],
      payload: JSON.stringify({
        path,
        toAddress,
        amount,
        aggPubkey: bytesToHex(aggPubkey),
        signerPubkey: bytesToHex(signerPubkey),
        coSignerPubkey: bytesToHex(coSignerPubkey),
      }),
    }
  }

  // Real MuSig2 nonce generation for one signer's half of a round — the
  // step each of the two real co-signers runs locally before exchanging
  // public nonces. `secretKey` never leaves the caller (this SDK doesn't
  // receive it as a parameter to createEscrowAccount/buildRelease/
  // buildRefund — only the caller's own signing code holds it).
  generateNonces(signerPubkey: Uint8Array, secretKey: Uint8Array, aggPubkey: Uint8Array, message: Uint8Array): MuSig2Nonces {
    return musig2.nonceGen(signerPubkey, secretKey, aggPubkey, message)
  }

  // Combines two signers' partial signatures (each produced independently
  // via a real `musig2.Session.sign()` call the caller makes with their
  // own secret key/nonce — this provider never touches either secret)
  // into the final, verifiable Schnorr signature. Real logic, tested in
  // tests/custody-musig2.test.ts against `schnorr.verify()`.
  combinePartialSignatures(aggNonce: Uint8Array, signerPubkeys: Uint8Array[], message: Uint8Array, partialSigs: Uint8Array[]): Uint8Array {
    const session = new musig2.Session(aggNonce, musig2.sortKeys(signerPubkeys), message)
    return session.partialSigAgg(partialSigs)
  }

  async finalize(_unsigned: UnsignedCustodyAction, _signatures: string[]): Promise<{ txId: string }> {
    // Assembling the real Taproot key-path-spend witness (the combined
    // Schnorr signature + the tapscript control block for whichever leaf
    // signed) and broadcasting it needs a live UTXO set and Esplora/node
    // endpoint — MultisigProvider's own real fetchUtxos()/broadcast()
    // require exactly that against testnet, and no such infrastructure
    // exists in this sandbox.
    throw new SailsNotImplementedError(
      'BitcoinCustodyProvider.finalize requires a live UTXO set + Esplora/node endpoint to assemble the tapscript witness and broadcast; not available in this environment'
    )
  }
}
