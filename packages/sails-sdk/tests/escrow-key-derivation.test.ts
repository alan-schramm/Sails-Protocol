/**
 * Missão 10, Fase 6-9 — deterministic participant-key derivation.
 *
 * Test vectors are FROZEN regression contract (CTO-approved 2026-08-18),
 * computed against the well-known PUBLIC BIP32 spec test seed
 * (000102030405060708090a0b0c0d0e0f) — never a real Sails/Missão 09 seed.
 * If a future change to this file's implementation stops reproducing
 * these exact values, that is a regression to investigate, not a vector
 * to edit to make the test pass.
 */
import {
  deriveEscrowKey,
  recoverEscrowKey,
  verifyRecoveredKeyRegistration,
  buildEscrowKeyDerivationPath,
  EscrowKeyVerificationError,
  SAILS_ESCROW_PURPOSE,
  ESCROW_KEY_DERIVATION_VERSION,
} from '../src/modules/escrow-key-derivation'
import type { EscrowKeyRecord, EscrowRegistrationLookup } from '../src/modules/escrow-key-derivation'
import { InMemoryEscrowKeyIndexStore } from '../src/modules/escrow-key-index-store'

const TEST_SEED = Uint8Array.from(Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'))
const OTHER_SEED = Uint8Array.from(Buffer.from('80808080808080808080808080808080', 'hex'))

describe('SAILS_ESCROW_PURPOSE — frozen namespace value', () => {
  it('equals the value derived from SHA-256("sails-escrow-key-v1"), documented and reproducible', () => {
    expect(SAILS_ESCROW_PURPOSE).toBe(1888146842)
  })
})

describe('Official frozen test vectors (BIP32 spec public test seed)', () => {
  it('buyer, testnet, P2WSH, index 0', () => {
    const path = buildEscrowKeyDerivationPath({ role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    expect(path).toBe("m/1888146842'/1'/0'/0'/0'")
    const key = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    expect(key.publicKeyHex).toBe('03a3bd13e3b381de59d3896e75c385e3a3e68faa60f0267c3d12552d2202b0c699')
  })

  it('seller, testnet, P2WSH, index 0', () => {
    const key = deriveEscrowKey(TEST_SEED, { role: 'seller', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    expect(key.publicKeyHex).toBe('0278d9d9f58543e259f64ae6204db20d60e11e6a079ad1296f887751675363e7b1')
  })

  it('buyer, testnet, P2WSH, index 1', () => {
    const key = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 1 })
    expect(key.publicKeyHex).toBe('0350b3866ba7340128cb36027f082b3198e7f3fa353d65276c04cf3158624686a6')
  })

  it('buyer, mainnet, P2WSH, index 0', () => {
    const key = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'mainnet', scriptType: 'P2WSH', accountIndex: 0 })
    expect(key.publicKeyHex).toBe('03463f7c065adf1ebe0d4552bf958b6eb662865cc2fd778151b91be50036131897')
  })

  it("reserved future-script branch (script_type'=1), buyer, testnet, index 0 — reservation vector only, not a real scheme", () => {
    // deriveEscrowKey() only accepts 'P2WSH' publicly; this vector proves
    // the raw path/branch is real and distinct, using the internal path
    // builder directly with a manually-constructed path — script_type'=1
    // is NOT exposed as a usable EscrowScriptType value anywhere in this
    // SDK (see buildEscrowKeyDerivationPath's own SCRIPT_TYPE table).
    const { HDKey } = require('@scure/bip32')
    const master = HDKey.fromMasterSeed(TEST_SEED)
    const child = master.derive("m/1888146842'/1'/1'/0'/0'")
    expect(Buffer.from(child.publicKey).toString('hex')).toBe('02af3ceadf063e708505e36fb47693cd3993ffbfa1040eeb2dfbfae0b5674237c3')
  })
})

describe('T1-T5: structural domain separation', () => {
  it('T1: same seed + same scope, derived twice independently -> identical key', () => {
    const scope = { role: 'buyer' as const, network: 'testnet' as const, scriptType: 'P2WSH' as const, accountIndex: 0 }
    const a = deriveEscrowKey(TEST_SEED, scope)
    const b = deriveEscrowKey(TEST_SEED, scope)
    expect(a.publicKeyHex).toBe(b.publicKeyHex)
    expect(Buffer.from(a.privateKey).toString('hex')).toBe(Buffer.from(b.privateKey).toString('hex'))
  })

  it('T2: buyer vs seller (same seed/network/scriptType/index) -> different key', () => {
    const buyer = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    const seller = deriveEscrowKey(TEST_SEED, { role: 'seller', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    expect(buyer.publicKeyHex).not.toBe(seller.publicKeyHex)
  })

  it('T3: index 0 vs index 1 (same seed/role/network/scriptType) -> different key', () => {
    const idx0 = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    const idx1 = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 1 })
    expect(idx0.publicKeyHex).not.toBe(idx1.publicKeyHex)
  })

  it('T4: mainnet vs testnet (same seed/role/scriptType/index) -> different key', () => {
    const mainnet = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'mainnet', scriptType: 'P2WSH', accountIndex: 0 })
    const testnet = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    expect(mainnet.publicKeyHex).not.toBe(testnet.publicKeyHex)
  })

  it('T5: different seeds (same scope) -> different key', () => {
    const scope = { role: 'buyer' as const, network: 'testnet' as const, scriptType: 'P2WSH' as const, accountIndex: 0 }
    const a = deriveEscrowKey(TEST_SEED, scope)
    const b = deriveEscrowKey(OTHER_SEED, scope)
    expect(a.publicKeyHex).not.toBe(b.publicKeyHex)
  })
})

describe('T6: restored metadata reproduces the exact recorded pubkey (recovery)', () => {
  it('T6', () => {
    const key = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    const record: EscrowKeyRecord = {
      escrowId: 'escrow-1',
      role: 'buyer',
      network: 'testnet',
      scriptType: 'P2WSH',
      accountIndex: 0,
      derivationVersion: ESCROW_KEY_DERIVATION_VERSION,
      publicKeyHex: key.publicKeyHex,
    }
    const recovered = recoverEscrowKey(TEST_SEED, record)
    expect(recovered.publicKeyHex).toBe(key.publicKeyHex)
    expect(Buffer.from(recovered.privateKey).toString('hex')).toBe(Buffer.from(key.privateKey).toString('hex'))
  })
})

describe('Level 2 — verifyRecoveredKeyRegistration() (Missão 10, Fase 6.10/6.11)', () => {
  function keyAndRecord() {
    const key = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    const record: EscrowKeyRecord = {
      escrowId: 'escrow-1',
      role: 'buyer',
      network: 'testnet',
      scriptType: 'P2WSH',
      accountIndex: 0,
      derivationVersion: ESCROW_KEY_DERIVATION_VERSION,
      publicKeyHex: key.publicKeyHex,
    }
    return { key, record }
  }

  it('Level 1 PASS + Level 2 PASS — recovered key matches BOTH local metadata AND the server-registered pubkey', () => {
    const { key, record } = keyAndRecord()
    const recovered = recoverEscrowKey(TEST_SEED, record) // Level 1
    const escrow: EscrowRegistrationLookup = { participantKeys: [{ participantId: 'buyer-1', role: 'buyer', publicKeyHex: key.publicKeyHex }] }
    expect(() => verifyRecoveredKeyRegistration(recovered.publicKeyHex, escrow, 'buyer')).not.toThrow() // Level 2
  })

  it('Level 1 PASS but Level 2 FAIL — local metadata is internally consistent but disagrees with what the server actually registered', () => {
    // This is the exact scenario the CTO's blocker identified: a stale
    // backup, or a record associated with the wrong escrow, can be
    // perfectly self-consistent locally while being wrong about what the
    // protocol actually has on file.
    const { record } = keyAndRecord()
    const recovered = recoverEscrowKey(TEST_SEED, record) // Level 1 passes
    const someOtherRealPubkey = deriveEscrowKey(TEST_SEED, { role: 'seller', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 }).publicKeyHex
    const escrow: EscrowRegistrationLookup = { participantKeys: [{ participantId: 'buyer-1', role: 'buyer', publicKeyHex: someOtherRealPubkey }] }
    expect(() => verifyRecoveredKeyRegistration(recovered.publicKeyHex, escrow, 'buyer')).toThrow(EscrowKeyVerificationError)
    expect(() => verifyRecoveredKeyRegistration(recovered.publicKeyHex, escrow, 'buyer')).toThrow(/does not match the pubkey actually registered/)
  })

  it('no participantKeys on the escrow response at all -> Level 2 fails closed, not silently skipped', () => {
    const { key } = keyAndRecord()
    expect(() => verifyRecoveredKeyRegistration(key.publicKeyHex, {}, 'buyer')).toThrow(EscrowKeyVerificationError)
  })

  it('participantKeys present but no entry for the requested role -> Level 2 fails closed', () => {
    const { key } = keyAndRecord()
    const escrow: EscrowRegistrationLookup = { participantKeys: [{ participantId: 'seller-1', role: 'seller', publicKeyHex: 'irrelevant' }] }
    expect(() => verifyRecoveredKeyRegistration(key.publicKeyHex, escrow, 'buyer')).toThrow(EscrowKeyVerificationError)
  })

  it('duplicate entries for the same role -> Level 2 fails closed, never silently picks the first (defense in depth against a malformed/malicious response — the real DB enforces @@unique([escrowId, role]), this guards the JSON contract itself)', () => {
    const { key } = keyAndRecord()
    const escrow: EscrowRegistrationLookup = {
      participantKeys: [
        { participantId: 'buyer-1', role: 'buyer', publicKeyHex: key.publicKeyHex },
        { participantId: 'buyer-1', role: 'buyer', publicKeyHex: 'a-different-impossible-value' },
      ],
    }
    expect(() => verifyRecoveredKeyRegistration(key.publicKeyHex, escrow, 'buyer')).toThrow(EscrowKeyVerificationError)
    expect(() => verifyRecoveredKeyRegistration(key.publicKeyHex, escrow, 'buyer')).toThrow(/expected exactly one/)
  })

  it('composed sequence (the recommended wallet flow): recoverEscrowKey() -> verifyRecoveredKeyRegistration() -> only then would signing proceed', () => {
    const { key, record } = keyAndRecord()
    // Step 1 — Level 1, fully offline, no escrow/server object needed.
    const recovered = recoverEscrowKey(TEST_SEED, record)
    // Step 2 — Level 2, requires the escrow the caller already fetched
    // from the server (e.g. sdk.settlement.get(escrowId)).
    const escrow: EscrowRegistrationLookup = { participantKeys: [{ participantId: 'buyer-1', role: 'buyer', publicKeyHex: key.publicKeyHex }] }
    expect(() => verifyRecoveredKeyRegistration(recovered.publicKeyHex, escrow, record.role)).not.toThrow()
    // Only after both gates pass would a caller proceed to
    // verifyAndSignEscrowPsbt() (wallet-verification.ts) — that PSBT-level
    // check is orthogonal (confirms WHAT is signed, not WHO signs it) and
    // is exercised separately in wallet-verification.test.ts.
  })
})

describe('T7-T8: index reservation', () => {
  it('T7: concurrent local reservations never collide', async () => {
    const store = new InMemoryEscrowKeyIndexStore()
    const scope = { role: 'buyer' as const, network: 'testnet' as const, scriptType: 'P2WSH' as const, derivationVersion: ESCROW_KEY_DERIVATION_VERSION }
    const results = await Promise.all(Array.from({ length: 50 }, () => store.reserveNextAccountIndex(scope)))
    const unique = new Set(results)
    expect(unique.size).toBe(50)
    expect([...unique].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i))
  })

  it('T8: an index reserved for a "failed" escrow creation is never reissued (no release API exists at all)', async () => {
    const store = new InMemoryEscrowKeyIndexStore()
    const scope = { role: 'buyer' as const, network: 'testnet' as const, scriptType: 'P2WSH' as const, derivationVersion: ESCROW_KEY_DERIVATION_VERSION }
    const first = await store.reserveNextAccountIndex(scope) // simulates a reservation whose escrow creation then fails
    const second = await store.reserveNextAccountIndex(scope) // next attempt must not reuse `first`
    expect(second).not.toBe(first)
    expect(second).toBe(first + 1)
    // scopes are independent — a different role/network/scriptType never shares a counter
    const otherRoleFirst = await store.reserveNextAccountIndex({ ...scope, role: 'seller' })
    expect(otherRoleFirst).toBe(0)
  })
})

describe('T9: P2WSH branch vs reserved future-script branch -> different key', () => {
  it('T9', () => {
    const { HDKey } = require('@scure/bip32')
    const p2wsh = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    const master = HDKey.fromMasterSeed(TEST_SEED)
    const futureBranch = master.derive("m/1888146842'/1'/1'/0'/0'") // script_type'=1', reserved, not implemented
    expect(p2wsh.publicKeyHex).not.toBe(Buffer.from(futureBranch.publicKey).toString('hex'))
  })
})

describe('T10-T15: recovery fails closed on any corruption/mismatch', () => {
  function validRecord(overrides: Partial<EscrowKeyRecord> = {}): EscrowKeyRecord {
    const key = deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0 })
    return {
      escrowId: 'escrow-1',
      role: 'buyer',
      network: 'testnet',
      scriptType: 'P2WSH',
      accountIndex: 0,
      derivationVersion: ESCROW_KEY_DERIVATION_VERSION,
      publicKeyHex: key.publicKeyHex,
      ...overrides,
    }
  }

  it('T10: corrupted role metadata -> verification fails', () => {
    expect(() => recoverEscrowKey(TEST_SEED, validRecord({ role: 'seller' }))).toThrow(EscrowKeyVerificationError)
  })

  it('T11: corrupted accountIndex -> verification fails', () => {
    expect(() => recoverEscrowKey(TEST_SEED, validRecord({ accountIndex: 1 }))).toThrow(EscrowKeyVerificationError)
  })

  it('T12: wrong seed -> verification fails', () => {
    expect(() => recoverEscrowKey(OTHER_SEED, validRecord())).toThrow(EscrowKeyVerificationError)
  })

  it('T13: wrong network -> verification fails', () => {
    expect(() => recoverEscrowKey(TEST_SEED, validRecord({ network: 'mainnet' }))).toThrow(EscrowKeyVerificationError)
  })

  it('T14: wrong/unrecognized derivationVersion -> fails closed before even attempting derivation', () => {
    expect(() => recoverEscrowKey(TEST_SEED, validRecord({ derivationVersion: 'v1-random-no-recovery' }))).toThrow(
      /Unsupported derivationVersion/
    )
  })

  it('T15: unsupported scriptType -> fails closed before even attempting derivation', () => {
    expect(() => recoverEscrowKey(TEST_SEED, validRecord({ scriptType: 'TAPROOT_MUSIG2' as any }))).toThrow(/Unsupported scriptType/)
  })
})

describe('deriveEscrowKey — input validation', () => {
  it('rejects a negative accountIndex', () => {
    expect(() => deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: -1 })).toThrow(RangeError)
  })

  it('rejects an accountIndex that does not fit in 31 bits', () => {
    expect(() => deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'P2WSH', accountIndex: 0x80000000 })).toThrow(
      RangeError
    )
  })

  it('rejects an unsupported scriptType', () => {
    expect(() =>
      deriveEscrowKey(TEST_SEED, { role: 'buyer', network: 'testnet', scriptType: 'TAPROOT_MUSIG2' as any, accountIndex: 0 })
    ).toThrow(/Unsupported scriptType/)
  })
})
