/**
 * @satsails/p2p-trading-sdk — deterministic, recoverable participant-key
 * derivation (Missão 10, Fase 6-9).
 *
 * ADDITIVE to `generateEscrowKeypair()` (escrow-key.ts) — that function is
 * unchanged and continues to produce fresh, non-recoverable random keys
 * exactly as before. This module is a separate, opt-in mechanism for a
 * wallet that wants a real seed + local metadata → recovery story, which
 * `generateEscrowKeypair()` structurally cannot offer (pure randomness has
 * no relationship to anything, so a lost key generated that way is lost
 * forever). Nothing here ever touches or reinterprets a key created by
 * `generateEscrowKeypair()`.
 *
 * Scope, per the frozen Derivation Spec v1 (approved 2026-08-18): only
 * Cenários A/B (seed + client-side metadata recovery). Seed-only recovery
 * with zero local metadata (Cenário C) needs a server-side reverse
 * pubkey→escrow lookup that does not exist today and was explicitly
 * deferred to its own future mission ("Seed-only Recovery Discovery") —
 * not built here, not stubbed, not implied.
 *
 * Path (frozen, all levels hardened):
 *   m / PURPOSE' / coin_type' / script_type' / role' / account_index'
 *
 * PURPOSE' = 1888146842 — a Sails-PRIVATE BIP32 namespace, not an
 * externally standardized purpose value (BIP-48, the closest existing
 * multisig-HD-wallet standard, assumes persistent multi-cosigner
 * "accounts" with no per-trade role concept — it does not actually fit
 * Sails' ephemeral, per-trade 2-of-3 quorums, so claiming purpose'=48'
 * here would misrepresent the path to any tool that tries to interpret
 * it as real BIP-48). Computed deterministically, not picked by hand, so
 * anyone can recompute and verify it independently:
 *   canonical string: "sails-escrow-key-v1" (UTF-8)
 *   SHA-256: 708ad59af16a4e70ef2609a51ba85c2aef3917433f2a7bf330fc77a267dfccd9
 *   first 4 bytes, big-endian, as uint32, reduced mod 2^31: 1888146842
 * This is a documented, versioned, Sails-private convention — it is not
 * a claim of external standardization.
 *
 * coin_type' reuses SLIP-44 directly (0'=Bitcoin mainnet, 1'=testnet) —
 * an actual external standard, not invented here.
 *
 * script_type' is a Sails-specific level, frozen from v1 onward so the
 * path's depth/semantics never change when a future script family is
 * added: 0'=P2WSH (this mission's only implemented value). 1' is
 * RESERVED for a future Taproot-family multisig scheme — not implemented,
 * not designed, not assumed to be MuSig2 specifically. A future mission
 * decides that scheme's actual semantics (nonce lifecycle, key
 * aggregation, script-path fallback, recovery, dispute semantics).
 *
 * role' separates buyer (0') and seller (1') as distinct hardened
 * branches — structurally, not just by label, so a metadata corruption
 * that flips the role field produces an unrelated key, not a silently
 * "wrong but valid" one.
 *
 * account_index' is a client-side, wallet-owned, monotonically
 * incrementing counter per (role, network, scriptType, derivationVersion)
 * — see escrow-key-index-store.ts for the atomic reservation contract.
 * Never reused, even if the escrow the index was reserved for fails to
 * be created.
 *
 * Test vectors below are FROZEN regression contract (CTO-approved
 * 2026-08-18) — computed against the well-known public BIP32 spec test
 * seed (000102030405060708090a0b0c0d0e0f), never a real Sails/Missão 09
 * seed. See tests/escrow-key-derivation.test.ts.
 */
import { HDKey } from '@scure/bip32'
import { bytesToHex } from '../encoding'
import type { EscrowKeypair } from './escrow-key'

export const SAILS_ESCROW_PURPOSE = 1888146842
export const ESCROW_KEY_DERIVATION_VERSION = 'sails-escrow-v1'
export const ESCROW_KEY_METADATA_FORMAT_VERSION = 1

export type EscrowKeyNetwork = 'mainnet' | 'testnet'
export type EscrowKeyRole = 'buyer' | 'seller'
// Union, not enum — deliberately: adding 'TAPROOT_MUSIG2' later (once
// script_type'=1' is actually designed) is an additive change to this
// type, not a breaking one for any caller that isn't exhaustively
// switching on it.
export type EscrowScriptType = 'P2WSH'

const COIN_TYPE: Record<EscrowKeyNetwork, number> = { mainnet: 0, testnet: 1 }
// P2WSH is the only implemented branch. TAPROOT_MUSIG2 intentionally has
// no entry here — deriveEscrowKey() must fail closed for any scriptType
// this table doesn't recognize, not silently default to something.
const SCRIPT_TYPE: Record<'P2WSH', number> = { P2WSH: 0 }
const ROLE_INDEX: Record<EscrowKeyRole, number> = { buyer: 0, seller: 1 }

export interface EscrowKeyDerivationScope {
  role: EscrowKeyRole
  network: EscrowKeyNetwork
  scriptType: EscrowScriptType
  accountIndex: number
}

// The full, self-contained client-side record needed to recover one
// participant key — deliberately includes publicKeyHex (recorded once,
// at creation time) rather than requiring a server round-trip to learn
// "the registered pubkey": see this SDK's own escrow-key-derivation
// STOP GATE report for why (no public API today returns
// EscrowParticipantKey.pubkey back to a client — confirmed by reading
// escrow.service.ts/settlement.routes.ts directly, not assumed). This
// makes Cenários A/B fully self-sufficient without that gap.
export interface EscrowKeyRecord {
  escrowId: string
  role: EscrowKeyRole
  network: EscrowKeyNetwork
  scriptType: EscrowScriptType
  accountIndex: number
  derivationVersion: string
  publicKeyHex: string
}

export interface EscrowKeyMetadata {
  metadataFormatVersion: number
  derivationVersion: string
  records: EscrowKeyRecord[]
  counters: Record<EscrowKeyNetwork, Record<EscrowKeyRole, number>>
}

export function buildEscrowKeyDerivationPath(scope: EscrowKeyDerivationScope): string {
  if (!Number.isInteger(scope.accountIndex) || scope.accountIndex < 0 || scope.accountIndex >= 0x80000000) {
    throw new RangeError(`accountIndex must be an integer in [0, 2^31) to be representable as a hardened BIP32 index — got ${scope.accountIndex}`)
  }
  const coinType = COIN_TYPE[scope.network]
  const scriptTypeIndex = SCRIPT_TYPE[scope.scriptType as 'P2WSH']
  if (scriptTypeIndex === undefined) {
    throw new Error(`Unsupported scriptType "${scope.scriptType}" — only "P2WSH" is implemented in this derivation scheme`)
  }
  const roleIndex = ROLE_INDEX[scope.role]
  return `m/${SAILS_ESCROW_PURPOSE}'/${coinType}'/${scriptTypeIndex}'/${roleIndex}'/${scope.accountIndex}'`
}

// Pure, deterministic: same (seed, scope) always yields the same keypair
// (BIP32 CKD's own correctness guarantee — verified directly against
// this file's own frozen test vectors, not assumed).
export function deriveEscrowKey(seed: Uint8Array, scope: EscrowKeyDerivationScope): EscrowKeypair {
  const path = buildEscrowKeyDerivationPath(scope)
  const master = HDKey.fromMasterSeed(seed)
  const child = master.derive(path)
  if (!child.privateKey || !child.publicKey) {
    throw new Error(`BIP32 derivation at path ${path} did not yield a keypair`)
  }
  return { privateKey: child.privateKey, publicKey: child.publicKey, publicKeyHex: bytesToHex(child.publicKey) }
}

export class EscrowKeyVerificationError extends Error {}

/**
 * Recovery for Cenários A/B: re-derive from (seed, record) and require
 * the result to match record.publicKeyHex byte-for-byte before returning
 * it. Never returns an unverified key — a corrupted record field (role,
 * network, scriptType, accountIndex), a wrong seed, an unrecognized
 * derivationVersion, or an unsupported scriptType all fail closed here,
 * not silently.
 */
export function recoverEscrowKey(seed: Uint8Array, record: EscrowKeyRecord): EscrowKeypair {
  if (record.derivationVersion !== ESCROW_KEY_DERIVATION_VERSION) {
    throw new EscrowKeyVerificationError(
      `Unsupported derivationVersion "${record.derivationVersion}" (expected "${ESCROW_KEY_DERIVATION_VERSION}") — refusing to derive with an unrecognized scheme rather than guessing at compatibility.`
    )
  }
  if (record.scriptType !== 'P2WSH') {
    throw new EscrowKeyVerificationError(`Unsupported scriptType "${record.scriptType}" — only "P2WSH" recovery is implemented.`)
  }
  const keypair = deriveEscrowKey(seed, {
    role: record.role,
    network: record.network,
    scriptType: record.scriptType,
    accountIndex: record.accountIndex,
  })
  if (keypair.publicKeyHex !== record.publicKeyHex) {
    throw new EscrowKeyVerificationError(
      `Recovered public key does not match the recorded public key for escrow ${record.escrowId} (role ${record.role}) — refusing to return an unverified key. ` +
        `Expected ${record.publicKeyHex}, derived ${keypair.publicKeyHex}. This indicates corrupted metadata, a wrong seed, or a scope mismatch.`
    )
  }
  return keypair
}

// Minimal shape this function needs from a fetched escrow — deliberately
// NOT importing the full SDK `Escrow` type (would create a dependency
// from this module onto ./settlement / the transport layer, which
// recoverEscrowKey()/deriveEscrowKey() above are correctly free of). The
// caller supplies whatever object its own escrow-fetching call already
// returns (typically `sdk.settlement.get(escrowId)`), as long as it has
// this shape.
export interface EscrowRegistrationLookup {
  participantKeys?: Array<{ participantId: string; role: string; publicKeyHex: string }>
}

/**
 * LEVEL 2 — server registration integrity (Missão 10, Fase 6.10/6.11,
 * CTO-mandated distinction from recoverEscrowKey()'s LEVEL 1 local check).
 *
 * recoverEscrowKey() only proves "this seed + this local metadata
 * reproduces the pubkey that metadata itself already claimed" — it says
 * nothing about whether that metadata is stale, was ever actually
 * accepted by the server, or is associated with the wrong escrow. This
 * function closes that gap: it compares the ALREADY-recovered (and
 * already Level-1-verified) pubkey against the pubkey the Sails protocol
 * itself has on record for (escrowId, role) — the SAME
 * `EscrowParticipantKey.pubkey` this escrow's real 2-of-3 script is
 * actually built from, read via the escrow's own existing authenticated
 * GET response (escrow.service.ts's getEscrow()/getEscrowByTrade(),
 * `participantKeys[]` field — additive, same buyer/seller/assigned-
 * arbiter authorization every other field on that response already
 * requires; confirmed via direct code reading, not assumed, that no new
 * endpoint or reverse pubkey lookup was introduced to support this).
 *
 * Requires network access (the caller must already have fetched the
 * escrow) — this is intentionally NOT bundled into recoverEscrowKey()
 * itself, so that offline recovery (Level 1 only) keeps working even if
 * Sails is completely unreachable. A protocol-aware signing operation
 * should call this AFTER recoverEscrowKey() and BEFORE
 * verifyAndSignEscrowPsbt() (wallet-verification.ts) whenever the server
 * is reachable — the two verification layers are orthogonal (this one
 * confirms WHO is signing; PSBT verification confirms WHAT is being
 * signed) and are composed by the caller, not merged into one function.
 */
export function verifyRecoveredKeyRegistration(recoveredPublicKeyHex: string, escrow: EscrowRegistrationLookup, role: EscrowKeyRole): void {
  const participantKeys = escrow.participantKeys
  if (!participantKeys) {
    throw new EscrowKeyVerificationError(
      `Escrow response has no participantKeys — either this escrow type does not use client-held keys, no key has been submitted for role "${role}" yet, or this server does not expose Level 2 verification data. Cannot confirm server registration integrity.`
    )
  }
  // Structurally, the server cannot produce two rows for the same
  // (escrowId, role) — schema.prisma's EscrowParticipantKey has
  // @@unique([escrowId, role]), enforced by Postgres itself, and
  // submitParticipantKey() only ever upserts on that exact key. But this
  // function trusts a JSON response, not the database directly — a
  // malformed or malicious response could still claim two entries for
  // the same role. Silently taking the first (what a bare .find() would
  // do) would be a silent PASS on ambiguous, untrustworthy data — matched
  // against Level 1's own "fail closed on anything unexpected" posture.
  const matches = participantKeys.filter((k) => k.role === role)
  if (matches.length === 0) {
    throw new EscrowKeyVerificationError(`No participant key is registered for role "${role}" on this escrow — nothing to verify against.`)
  }
  if (matches.length > 1) {
    throw new EscrowKeyVerificationError(
      `Escrow response contains ${matches.length} participantKeys entries for role "${role}" — expected exactly one. Refusing to guess which is authoritative.`
    )
  }
  const [registered] = matches
  if (registered.publicKeyHex !== recoveredPublicKeyHex) {
    throw new EscrowKeyVerificationError(
      `Recovered public key does not match the pubkey actually registered with the Sails protocol for role "${role}". ` +
        `Registered: ${registered.publicKeyHex}, recovered: ${recoveredPublicKeyHex}. Local metadata (Level 1) passed, but this key is not the one the real escrow script is built from — refusing to treat it as usable for signing.`
    )
  }
}
