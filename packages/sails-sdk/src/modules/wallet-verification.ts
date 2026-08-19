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
import { signEscrowPsbt } from './escrow-key'
import type { EscrowKeyNetwork } from './escrow-key-derivation'

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

function networkFor(network: EscrowKeyNetwork): bitcoin.Network {
  return network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
}

function sortedJoin(values: string[]): string {
  return [...values].map((v) => v.toLowerCase()).sort().join(',')
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
  const network = networkFor(expected.network)

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
