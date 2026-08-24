/**
 * @satsails/p2p-trading-sdk — pre-signature PSBT verification (Missão 10,
 * Fase 6-9). Formalizes the lesson from Missão 09's own rehearsal (see
 * docs/MAINNET_MULTISIG_PROOF.md's H8): a wallet must never sign a PSBT
 * it hasn't independently checked against what it actually expects to
 * be signing. This module DECODES the real PSBT bytes and compares every
 * field against the caller's own expectation — it never trusts server-
 * supplied metadata about the PSBT without checking it against the PSBT
 * itself.
 *
 * `verifySigningIntent()` is a pure, side-effect-free decode+compare
 * function — safe to call to render a confirmation UI before deciding
 * anything. `verifyAndSignEscrowPsbt()` is the recommended entry point:
 * it composes verification and signing so that signing is structurally
 * unreachable when verification fails, not just documented as required.
 */
import * as bitcoin from 'bitcoinjs-lib'
import * as ecc from '@bitcoinerlab/secp256k1'
import { normalizeBitcoinNetwork, networkFromMultisigAddress } from '@satsails/p2p-schemas'
import { signEscrowPsbt } from './escrow-key'
import type { EscrowKeyNetwork } from './escrow-key-derivation'

// Missão 11 Fase 9.1.1 §3 — re-exported so a caller building an
// ExpectedSigningIntent (sails-ui, or any external wallet) can determine
// which Bitcoin network a MULTISIG escrow's deposit address is really on
// without needing its own separate @satsails/p2p-schemas dependency —
// same re-export precedent MULTISIG_CAPABILITY_PROFILE_V1 (settlement.ts)
// already established.
export { networkFromMultisigAddress }

bitcoin.initEccLib(ecc)

export type EscrowOperation = 'RELEASE' | 'REFUND' | 'SPLIT'

export interface ExpectedSigningIntent {
  operation: EscrowOperation
  network: EscrowKeyNetwork
  escrowId: string
  input: {
    txid: string
    vout: number
    value: bigint
    /** The escrow's own known deposit address (Escrow.multisigAddr) — cross-checks that the input being spent really is this escrow's funding UTXO, not just "some UTXO". */
    multisigAddress: string
  }
  // Missão 11 Fase 4 §I — deliberately GENERIC, not "buyer output + seller
  // output" fields. This is what already makes Protocol Fee verification
  // possible with ZERO change to the comparison loop below: a caller that
  // includes the expected Sails fee output (or, in the waived case, the
  // seller's reserve-refund output) as one more entry in this array gets
  // the exact same script-bytes + value verification, and the exact same
  // "no output expected at this index" fail-closed rejection of any
  // unexpected/extra output (including a residual value-extraction
  // attempt), as every other output already receives. See
  // buildExpectedFeeAwareOutputs() below for computing this array's fee
  // leg without reimplementing the arithmetic from scratch.
  outputs: Array<{ address: string; value: bigint }>
  minerFee: bigint
  /** Informational only — never compared against dust-relay policy or used to gate verification; miner fee, dust threshold, and Sails protocol fee remain distinct concepts (Missão 10 Fase 4-5). */
  feeRate?: number
  threshold: number
  /** hex, 33-byte compressed secp256k1 — the 3 pubkeys expected in the witnessScript, order-independent (compared as sorted sets). */
  participantPubkeys: string[]
  requiredSigners: string[]
}

export interface SigningIntentMismatch {
  field: string
  expected: string
  actual: string
}

export interface SigningIntentVerification {
  ok: boolean
  mismatches: SigningIntentMismatch[]
}

// Missão 11 Fase 8.1 LB-07 — was a bare binary check (anything not
// exactly 'mainnet' silently became testnet), independent of and
// narrower than the server's own networkFor() (multisig.provider.ts),
// which separately accepted 'bitcoin' as a mainnet alias. A wallet
// integrator who copied the server's own documented
// MULTISIG_NETWORK=bitcoin value into ExpectedSigningIntent.network
// (an untyped JS caller isn't stopped by EscrowKeyNetwork's TS type)
// would have silently verified against testnet. Now routes through the
// same normalizeBitcoinNetwork() the server uses — accepts the same
// 'bitcoin' alias, throws on anything else unrecognized, and handles
// regtest, closing all three gaps at once.
function networkFor(network: EscrowKeyNetwork): bitcoin.Network {
  const normalized = normalizeBitcoinNetwork(network)
  if (normalized === 'mainnet') return bitcoin.networks.bitcoin
  if (normalized === 'regtest') return bitcoin.networks.regtest
  return bitcoin.networks.testnet
}

function sortedJoin(values: string[]): string {
  return [...values].map((v) => v.toLowerCase()).sort().join(',')
}

// Missão 11 Fase 5.1 §4 — a genuinely remote wallet's own independent
// reconstruction of the escrow's expected 2-of-3 P2WSH deposit address,
// from nothing but the three participant pubkeys and the threshold — no
// server-side derivation, no PSBT, no witnessScript decode. This is the
// SAME construction multisig.provider.ts's own buildScript() uses
// server-side (m-of-n P2MS wrapped in P2WSH, pubkeys sorted
// lexicographically as raw bytes — BIP67-style, for determinism, not a
// security requirement of the script itself: a 2-of-3 P2MS is equally
// spendable by any 2 of the 3 keys regardless of push order). Address
// derivation DOES depend on the exact script bytes, so reproducing the
// identical sort is what makes this address match Sails' own — unlike
// verifySigningIntent()'s witnessScript check below (which correctly
// treats the 3 keys as an order-independent SET, since a decoded script's
// pubkeys are already fixed and spendability never depends on their
// order), this function must sort BEFORE constructing the script, exactly
// as the server does, to arrive at a byte-identical result.
//
// Fails closed structurally, not just by convention: an invalid pubkey or
// unsupported network throws (via bitcoinjs-lib itself), never returns a
// best-effort guess.
export function deriveExpectedMultisigAddress(pubkeysHex: string[], threshold: number, network: EscrowKeyNetwork): string {
  const btcNetwork = networkFor(network)
  const pubkeys = pubkeysHex.map((hex) => Buffer.from(hex, 'hex')).sort(Buffer.compare)
  const p2ms = bitcoin.payments.p2ms({ m: threshold, pubkeys, network: btcNetwork })
  const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network: btcNetwork })
  if (!p2wsh.address) {
    throw new Error('deriveExpectedMultisigAddress: bitcoinjs-lib did not produce an address for the given pubkeys/threshold/network')
  }
  return p2wsh.address
}

/**
 * Decodes the real PSBT and compares it, field by field, against
 * `expected` and the `requiredSignersActual` the caller received
 * alongside the PSBT from the API response. Never signs anything.
 */
export function verifySigningIntent(
  psbtBase64: string,
  expected: ExpectedSigningIntent,
  requiredSignersActual: string[]
): SigningIntentVerification {
  const mismatches: SigningIntentMismatch[] = []

  // Missão 11 Fase 8.1 LB-07 — networkFor() now throws on an
  // unrecognized network (see its own comment) instead of silently
  // defaulting to testnet. This function's own contract ("a pure,
  // side-effect-free decode+compare function — safe to call ... before
  // deciding anything") must hold even for a caller-supplied garbage
  // network value, so that throw is caught here and turned into the same
  // clean { ok: false, mismatches } shape a PSBT decode failure already
  // produces below — never an uncaught exception out of this function.
  let network: bitcoin.Network
  try {
    network = networkFor(expected.network)
  } catch (err) {
    return {
      ok: false,
      mismatches: [
        {
          field: 'network',
          expected: 'mainnet, testnet, or regtest',
          actual: `${JSON.stringify(expected.network)} — ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    }
  }

  let psbt: bitcoin.Psbt
  try {
    psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network })
  } catch (err) {
    return {
      ok: false,
      mismatches: [
        {
          field: 'psbt',
          expected: `a valid, parseable PSBT for network "${expected.network}"`,
          actual: `failed to parse: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    }
  }

  // --- Input: count, outpoint, value, and that it really is THIS escrow's known deposit address ---
  // Tracks the REAL witnessUtxo value (not expected.input.value) so the
  // miner-fee check below reflects what the PSBT actually spends —
  // defense in depth: an input-value tamper (case C of the adversarial
  // matrix) surfaces both as its own input.value mismatch AND, via this
  // variable, as a minerFee mismatch, rather than only the former.
  let actualInputValue = expected.input.value
  if (psbt.txInputs.length !== 1) {
    mismatches.push({ field: 'input.count', expected: '1', actual: String(psbt.txInputs.length) })
  } else {
    // bitcoinjs-lib stores the outpoint hash in internal (reversed) byte
    // order — reverse it back to the conventional big-endian txid string
    // every other part of this codebase already uses for comparison.
    const actualTxid = Buffer.from(psbt.txInputs[0].hash).reverse().toString('hex')
    if (actualTxid !== expected.input.txid) {
      mismatches.push({ field: 'input.txid', expected: expected.input.txid, actual: actualTxid })
    }
    if (psbt.txInputs[0].index !== expected.input.vout) {
      mismatches.push({ field: 'input.vout', expected: String(expected.input.vout), actual: String(psbt.txInputs[0].index) })
    }

    const witnessUtxo = psbt.data.inputs[0]?.witnessUtxo
    if (!witnessUtxo) {
      mismatches.push({ field: 'input.witnessUtxo', expected: 'present', actual: 'missing' })
    } else {
      actualInputValue = BigInt(witnessUtxo.value)
      if (actualInputValue !== expected.input.value) {
        mismatches.push({ field: 'input.value', expected: expected.input.value.toString(), actual: actualInputValue.toString() })
      }

      let expectedInputScript: Buffer | undefined
      try {
        expectedInputScript = Buffer.from(bitcoin.address.toOutputScript(expected.input.multisigAddress, network))
      } catch (err) {
        mismatches.push({
          field: 'input.multisigAddress',
          expected: `${expected.input.multisigAddress} (valid for network "${expected.network}")`,
          actual: `does not decode for this network: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
      if (expectedInputScript && !Buffer.from(witnessUtxo.script).equals(expectedInputScript)) {
        mismatches.push({
          field: 'input.multisigAddress',
          expected: expected.input.multisigAddress,
          actual: `input script does not match this escrow's known deposit address (script: ${Buffer.from(witnessUtxo.script).toString('hex')})`,
        })
      }
    }

    // --- witnessScript: threshold + participant pubkeys ---
    const witnessScript = psbt.data.inputs[0]?.witnessScript
    if (!witnessScript) {
      mismatches.push({ field: 'witnessScript', expected: 'present', actual: 'missing' })
    } else {
      let decoded: bitcoin.payments.Payment | undefined
      try {
        decoded = bitcoin.payments.p2ms({ output: witnessScript })
      } catch (err) {
        mismatches.push({
          field: 'witnessScript',
          expected: `a valid ${expected.threshold}-of-${expected.participantPubkeys.length} multisig script`,
          actual: `failed to decode: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
      if (decoded) {
        if (decoded.m !== expected.threshold) {
          mismatches.push({ field: 'threshold', expected: String(expected.threshold), actual: String(decoded.m) })
        }
        const actualPubkeys = sortedJoin((decoded.pubkeys ?? []).map((p) => Buffer.from(p).toString('hex')))
        const expectedPubkeys = sortedJoin(expected.participantPubkeys)
        if (actualPubkeys !== expectedPubkeys) {
          mismatches.push({ field: 'participantPubkeys', expected: expectedPubkeys, actual: actualPubkeys })
        }
      }
    }
  }

  // --- Outputs: count, destination script bytes (not just address string — see header), value ---
  if (psbt.txOutputs.length !== expected.outputs.length) {
    mismatches.push({ field: 'outputs.count', expected: String(expected.outputs.length), actual: String(psbt.txOutputs.length) })
  }
  psbt.txOutputs.forEach((actualOutput, i) => {
    const expectedOutput = expected.outputs[i]
    if (!expectedOutput) {
      // An extra, unexpected output — covers both a genuinely surprising
      // second payout AND an unexpected OP_RETURN/non-standard script
      // landing past the expected count. actualOutput.address may be
      // undefined for a non-standard script, so fall back to raw hex.
      mismatches.push({
        field: `outputs[${i}]`,
        expected: '(no output expected at this index)',
        actual: actualOutput.address ?? `non-standard script: ${Buffer.from(actualOutput.script).toString('hex')}`,
      })
      return
    }
    let expectedScript: Buffer | undefined
    try {
      expectedScript = Buffer.from(bitcoin.address.toOutputScript(expectedOutput.address, network))
    } catch (err) {
      mismatches.push({
        field: `outputs[${i}].address`,
        expected: `${expectedOutput.address} (valid for network "${expected.network}")`,
        actual: `does not decode for this network: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
    if (expectedScript && !Buffer.from(actualOutput.script).equals(expectedScript)) {
      mismatches.push({
        field: `outputs[${i}].address`,
        expected: expectedOutput.address,
        actual: actualOutput.address ?? `non-standard script: ${Buffer.from(actualOutput.script).toString('hex')}`,
      })
    }
    const actualValue = BigInt(actualOutput.value)
    if (actualValue !== expectedOutput.value) {
      mismatches.push({ field: `outputs[${i}].value`, expected: expectedOutput.value.toString(), actual: actualValue.toString() })
    }
  })

  // --- Miner fee: ACTUAL input value minus the sum of ACTUAL outputs —
  // both sides real, not expected, so tampering either side (a skimmed
  // output, an inflated input) is caught here too, not masked by
  // comparing expected-vs-expected. ---
  const actualOutputTotal = psbt.txOutputs.reduce((sum, o) => sum + BigInt(o.value), 0n)
  const actualFee = actualInputValue - actualOutputTotal
  if (actualFee !== expected.minerFee) {
    mismatches.push({ field: 'minerFee', expected: expected.minerFee.toString(), actual: actualFee.toString() })
  }

  // --- Required signers: compared against what the caller's own
  // expectation is, using the value the API returned ALONGSIDE this PSBT
  // (not decoded from the PSBT bytes — the PSBT itself only reveals a
  // signer that has ALREADY signed, via partialSig, not who is still
  // expected to). ---
  const actualSigners = sortedJoin(requiredSignersActual)
  const expectedSigners = sortedJoin(expected.requiredSigners)
  if (actualSigners !== expectedSigners) {
    mismatches.push({ field: 'requiredSigners', expected: expectedSigners, actual: actualSigners })
  }

  return { ok: mismatches.length === 0, mismatches }
}

// Missão 11 Fase 9.1 §13 — parses a decimal string like "0.004" into an
// exact numerator/scale pair (value == numerator / 10^scale) without ever
// passing through a JS `number` at any intermediate step — the float
// round-trip is exactly what created the divergence from the server's own
// Prisma.Decimal-based computation this function replaces. Throws on a
// malformed string rather than silently producing a wrong exact value.
function parseDecimalRateExact(rateStr: string): { numerator: bigint; scale: bigint } {
  const trimmed = rateStr.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`parseDecimalRateExact: '${rateStr}' is not a valid decimal string`)
  }
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [intPart, fracPart = ''] = unsigned.split('.')
  const numerator = BigInt(intPart + fracPart)
  const scale = BigInt(fracPart.length)
  return { numerator: negative ? -numerator : numerator, scale }
}

// Missão 11 Fase 9.1 §13 — exact BigInt equivalent of the server's own
// Prisma.Decimal(basisAmount).times(rate).toDecimalPlaces(8, ROUND_DOWN)
// computation (fee-reserve-math.ts's computeProtocolFee()), at satoshi
// (integer) precision. floor(amountSats * rate) computed entirely in
// BigInt — BigInt division truncates toward zero, which for the
// non-negative inputs this protocol always uses is exactly ROUND_DOWN,
// bit-for-bit matching the server's own result, not merely "close enough
// and fails safe" the way the prior float implementation did. Exported
// so both this file's own use and shared cross-implementation test
// vectors (packages/sails-sdk/tests/wallet-verification.test.ts) can
// call the identical function the server-equivalence proof depends on.
export function computeProtocolFeeSatsExact(amountSats: bigint, protocolFeeRateDecimalString: string): bigint {
  const { numerator, scale } = parseDecimalRateExact(protocolFeeRateDecimalString)
  const denominator = 10n ** scale
  return (amountSats * numerator) / denominator
}

// Missão 11 Fase 9.1.1 §3 — exact BTC-decimal-string -> satoshi BigInt
// conversion, reusing parseDecimalRateExact()'s own exact parser rather
// than the float-based `Math.round(parseFloat(x) * 1e8)` pattern used
// elsewhere in this codebase's demo/rehearsal scripts (the same class of
// imprecision §13 already closed for fee-rate math, now closed here too
// for principal-amount conversion — needed by sails-ui's own independent
// ExpectedSigningIntent construction, closing its blind-signing gap).
// Throws rather than silently truncating if the input carries more than
// 8 decimal places (more precision than a satoshi can represent).
export function btcToSats(decimalBtcString: string): bigint {
  const { numerator, scale } = parseDecimalRateExact(decimalBtcString)
  if (scale > 8n) {
    throw new Error(`btcToSats: '${decimalBtcString}' has more than 8 decimal places — not representable in whole satoshis`)
  }
  return numerator * 10n ** (8n - scale)
}

// Missão 11 Fase 4 §I — the wallet-side mirror of multisig.provider.ts's
// own fee-reserve arithmetic (fee-reserve-math.ts), so a wallet can build
// its OWN expected fee-aware outputs and pass them into
// ExpectedSigningIntent.outputs above, independent of anything the server
// claims — never trusting a server-supplied fee amount without
// recomputing it from the escrow's own frozen policy snapshot.
//
// Missão 11 Fase 9.1 §13 — protocolFeeRate is now the exact decimal
// STRING the escrow's own frozen snapshot (Escrow.snapshotProtocolFeeRate)
// already carries, not a lossy `Number(...)` conversion the caller used
// to have to perform themselves one step earlier (which introduced the
// exact same float imprecision this fix closes, just outside this
// function's own control). This closes the previously-disclosed
// float/Decimal divergence from the server's computation — the two are
// now bit-for-bit identical for the same input, not merely
// "safe-direction-only" as before. Breaking change to this function's
// own signature, deliberately: this SDK has never been npm-published
// (version 0.1.3, workspace-internal use only throughout this project),
// so there are no external callers to preserve compatibility for.
export interface FeeAwareReleaseParams {
  lockedAmountSats: bigint
  protocolFeeRate: string
  minerFee: bigint
  buyerAddress: string
  /** Sails' configured collection address, OR the seller's own refund
   *  address if the caller already knows the fee will be waived — this
   *  helper does not decide waiver itself (that requires the real
   *  destination's dust threshold, a rail-specific concept this SDK
   *  module deliberately does not own — see bitcoin-dust-policy.ts on the
   *  server side for the authoritative check). */
  secondOutputAddress: string
}

/** Computes the two expected RELEASE outputs (buyer = T-M, second = Fmax)
 *  for a policy-aware escrow — Fmax equals the actual fee for a plain
 *  release (basis = T always), so this single computation serves both the
 *  normal (Sails) and waived (seller-refund) destination cases; the caller
 *  decides which address the second output should be. */
export function buildExpectedFeeAwareReleaseOutputs(params: FeeAwareReleaseParams): Array<{ address: string; value: bigint }> {
  const fmax = computeProtocolFeeSatsExact(params.lockedAmountSats, params.protocolFeeRate)
  // buyerPool = T - M. Algebraically this is the server's own
  // (spendableValue - Fmax) with spendableValue = (T+Fmax) - M — the +Fmax
  // and -Fmax cancel, so this is written directly rather than through the
  // intermediate reserve-inclusive form.
  const buyerPool = params.lockedAmountSats - params.minerFee
  return [
    { address: params.buyerAddress, value: buyerPool },
    { address: params.secondOutputAddress, value: fmax },
  ]
}

export class SigningIntentVerificationError extends Error {
  constructor(public readonly mismatches: SigningIntentMismatch[]) {
    super(
      `PSBT does not match the expected signing intent (${mismatches.length} mismatch(es)): ` +
        mismatches.map((m) => `${m.field}: expected ${m.expected}, got ${m.actual}`).join('; ')
    )
  }
}

/**
 * The recommended entry point: verification and signing are composed so
 * that `signEscrowPsbt()` is structurally unreachable when verification
 * fails — not a convention the caller has to remember to follow.
 */
export function verifyAndSignEscrowPsbt(
  psbtBase64: string,
  expected: ExpectedSigningIntent,
  requiredSignersActual: string[],
  privateKey: Uint8Array
): string {
  const result = verifySigningIntent(psbtBase64, expected, requiredSignersActual)
  if (!result.ok) {
    throw new SigningIntentVerificationError(result.mismatches)
  }
  return signEscrowPsbt(psbtBase64, privateKey)
}

// Missão 11 Fase 9.1 §8 — audited the gap between "a wallet can verify
// and sign its own copy of a MULTISIG PSBT" (above, already real) and
// "buyer+seller can complete a cooperative spend without the server."
// What was still missing: COMBINING two independently-signed copies of
// the same unsigned PSBT into one finalized, broadcastable transaction —
// previously only ever done server-side (multisig.provider.ts's own
// finalizeSpend(), whose header comment states the exact same
// experimentally-verified premise this function relies on: bitcoinjs-lib's
// Psbt.combine() correctly merges independent copies of the SAME unsigned
// PSBT). This is a genuinely SMALL, safe addition — a thin wrapper around
// bitcoinjs-lib's own combine/finalize/extract, zero new cryptographic
// logic, mirroring the server's real implementation exactly rather than
// inventing a second one — not a re-derivation of PSBT CONSTRUCTION
// itself (building the unsigned PSBT from raw UTXO/fee/script inputs),
// which remains genuinely substantial provider logic (UTXO selection,
// fee-rate estimation, dust policy, arbiter-key handling) this phase
// deliberately does NOT duplicate into the SDK — see this Missão's own
// §8 report for the full disclosed reasoning and the proposed shared-
// construction-primitive alternative for that separate, larger gap.
//
// Broadcasting is deliberately NOT included here: pushing a finalized
// raw transaction to the Bitcoin network is not Sails-specific domain
// logic (any Bitcoin explorer/node client already does this), and this
// SDK does not yet own a broadcast dependency — a caller extracts the
// hex from this function's return value and broadcasts it through
// whatever infrastructure they already trust.
export function combineAndFinalizeEscrowPsbt(
  unsignedPsbtBase64: string,
  signedPsbtBase64List: string[],
  network: EscrowKeyNetwork
): { txId: string; rawTxHex: string } {
  const btcNetwork = networkFor(network)
  let merged: bitcoin.Psbt
  try {
    merged = bitcoin.Psbt.fromBase64(unsignedPsbtBase64, { network: btcNetwork })
    for (const signed of signedPsbtBase64List) {
      merged.combine(bitcoin.Psbt.fromBase64(signed, { network: btcNetwork }))
    }
    merged.finalizeAllInputs()
  } catch (err) {
    throw new Error(
      `combineAndFinalizeEscrowPsbt: failed to combine/finalize the provided signed copies: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  const tx = merged.extractTransaction()
  return { txId: tx.getId(), rawTxHex: tx.toHex() }
}
