/**
 * @satsails/p2p-trading-sdk — payment-account hashing (RFC-021 D5).
 *
 * The real privacy property: this hash is computed HERE, client-side,
 * so the raw PIX key/bank account number never has to leave the
 * caller's own environment — the server only ever sees/stores the
 * hash. Must produce byte-identical output to
 * `src/modules/open-settlement/payment-account.service.ts`'s
 * `hashAccountIdentifier()` on the backend (same SHA-256 of
 * `${paymentMethod}:${rawIdentifier}`, UTF-8) — that backend copy
 * exists only as a reference/test utility, this is the real path a
 * wallet integration actually uses.
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from './encoding'

export function hashPaymentAccount(paymentMethod: string, rawIdentifier: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${paymentMethod}:${rawIdentifier}`)))
}
