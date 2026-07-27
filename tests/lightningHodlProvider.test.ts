/**
 * LightningHodlProvider — Arkade (Ark protocol) VTXO/Taproot escrow.
 *
 * Unlike tests/multisigProvider.test.ts (which runs bitcoinjs-lib for
 * real, since it has no ESM-loading problem under Jest), `@arkade-os/sdk`
 * cannot be loaded for real here: its CJS build transitively requires
 * `@scure/btc-signer`, which ships pure ESM with no CJS build — Jest's
 * default transform doesn't touch `node_modules`, so `require()`-ing it
 * throws `SyntaxError: Cannot use import statement outside a module`
 * (confirmed directly — the same class of problem
 * `@tetherto/wdk-wallet-evm` already has elsewhere in this suite, just a
 * different transitive dependency). `@arkade-os/sdk` is mocked here for
 * that reason, same as every other test file that reaches
 * escrow.service.ts.
 *
 * The real cryptography (key derivation, 4-leaf VtxoScript construction
 * with exit paths, and a real Arkade address built from a live ASP's
 * actual signer pubkey) was verified directly by running a standalone
 * script against the real, unmocked `@arkade-os/sdk` under plain Node
 * (outside Jest) and against Ark Labs' own public mutinynet ASP
 * (`https://mutinynet.arkade.sh`) before this provider was written — same
 * "cannot be verified inside this test runner, verified independently
 * instead" disclosure `tests/wdkSettlementProvider.test.ts` already uses
 * for its own live-infra-dependent calls, just for an ESM-loading reason
 * here rather than a live-funded-wallet one.
 *
 * What IS fully, safely testable here: `seedFor()` (pure, no SDK import
 * at all — only Node's `crypto`), config-gating (throws before any SDK
 * call), and the single-arbiter dispute guard (also throws before any
 * SDK call, same as multisig.provider.ts's identical check).
 */
jest.mock('@arkade-os/sdk', () => ({
  SeedIdentity: { fromSeed: jest.fn() },
  MultisigTapscript: { encode: jest.fn() },
  CSVMultisigTapscript: { encode: jest.fn() },
  VtxoScript: class FakeVtxoScript {},
  RestArkProvider: class FakeRestArkProvider {
    getInfo() {
      return Promise.reject(new Error('FakeRestArkProvider.getInfo should not be reached by these tests'))
    }
  },
  RestIndexerProvider: class FakeRestIndexerProvider {},
  buildOffchainTx: jest.fn(),
  combineTapscriptSigs: jest.fn(),
  verifyTapscriptSignatures: jest.fn(),
}))

const ORIGINAL_ENV = process.env

function loadProvider(env: Record<string, string | undefined>) {
  jest.resetModules()
  process.env = { ...ORIGINAL_ENV, MOCK_ESCROW: 'false', ...env }
  return require('../src/modules/open-settlement/lightning-hodl.provider')
}

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('seedFor (deterministic per-role-and-id derivation, pure — no SDK dependency)', () => {
  it('is deterministic — same role+id always derives the same seed', () => {
    const { seedFor } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(Buffer.from(seedFor('buyer', 'user-1')).toString('hex')).toBe(Buffer.from(seedFor('buyer', 'user-1')).toString('hex'))
  })

  it('produces different seeds for different roles on the same id', () => {
    const { seedFor } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    const buyer = Buffer.from(seedFor('buyer', 'shared-id')).toString('hex')
    const seller = Buffer.from(seedFor('seller', 'shared-id')).toString('hex')
    const arbiter = Buffer.from(seedFor('arbiter', 'shared-id')).toString('hex')
    expect(new Set([buyer, seller, arbiter]).size).toBe(3)
  })

  it('produces a real 64-byte seed (SeedIdentity.fromSeed\'s expected input shape)', () => {
    const { seedFor } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(seedFor('buyer', 'u1').length).toBe(64)
  })

  it('produces different seeds for different ids on the same role', () => {
    const { seedFor } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(Buffer.from(seedFor('buyer', 'u1')).toString('hex')).not.toBe(Buffer.from(seedFor('buyer', 'u2')).toString('hex'))
  })
})

describe('LightningHodlProvider.custodyModel', () => {
  it('declares itself a server-derived 2-of-3 reference implementation, same as MultisigProvider', () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    expect(lightningHodlProvider.custodyModel).toBe('server-derived-2-of-3-reference-implementation')
  })
})

describe('LightningHodlProvider config gating — inert without ARKADE_SEED/TRUSTED_ARBITRATORS', () => {
  it('throws a clear error when ARKADE_SEED is empty', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: '', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(lightningHodlProvider.getDepositAddress('trade-1', 'buyer-1', 'seller-1')).rejects.toThrow('ARKADE_SEED')
  })

  it('throws a clear error when no TRUSTED_ARBITRATORS entry is configured', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: '' })
    await expect(lightningHodlProvider.getDepositAddress('trade-1', 'buyer-1', 'seller-1')).rejects.toThrow('TRUSTED_ARBITRATORS')
  })

  it('requires buyerId/sellerId — escrow.service.ts must pass Trade\'s parties through', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.lockFunds({ tradeId: 't1', lockedAmount: '0.0005' })
    ).rejects.toThrow('requires buyerId/sellerId')
  })
})

describe('LightningHodlProvider — release/refund guards that fire before any SDK/network call', () => {
  it('rejects an arbitrated release whose triggeredBy does not match the arbiter key baked into the script', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    await expect(
      lightningHodlProvider.releaseFunds(
        { tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'DISPUTED', triggeredBy: 'some-other-arbiter' },
        'deadbeef'
      )
    ).rejects.toThrow('does not match the arbiter key')
  })

  it('does not reject a non-disputed release regardless of triggeredBy (the guard only applies when DISPUTED)', async () => {
    const { lightningHodlProvider } = loadProvider({ ARKADE_SEED: 'seed-a', TRUSTED_ARBITRATORS: 'arb-1' })
    // Proceeds past the arbiter guard into the mocked SDK's key-derivation
    // path next (this file's SeedIdentity.fromSeed mock returns undefined,
    // so .xOnlyPublicKey() fails) — a DIFFERENT error than the guard's own
    // message proves the guard itself did not reject here.
    await expect(
      lightningHodlProvider.releaseFunds(
        { tradeId: 't1', buyerId: 'b1', sellerId: 's1', lockedAmount: '0.0005', txLockId: 'a'.repeat(64), status: 'PAYMENT_PENDING', triggeredBy: 'some-other-arbiter' },
        'deadbeef'
      )
    ).rejects.not.toThrow('does not match the arbiter key')
  })
})
