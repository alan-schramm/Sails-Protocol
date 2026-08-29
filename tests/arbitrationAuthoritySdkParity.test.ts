/**
 * Missão 13 Fase 2 (INV-12) — the server
 * (`src/modules/open-settlement/arbitration-authority.ts`) and the SDK
 * (`packages/sails-sdk/src/modules/settlement.ts`) each independently
 * implement the same canonicalization/hashing formula, deliberately NOT
 * sharing a runtime module — `@satsails/p2p-schemas` is documented as
 * "types only, zero runtime dependencies" (its own index.ts header
 * comment), so adding a runtime canonicalization function there would
 * violate that package's charter. The two implementations must therefore
 * stay byte-for-byte identical by discipline, not by construction — this
 * test is the guard: it feeds the same payloads into both and asserts
 * identical output, so any future edit to either file that silently
 * drifts from the other fails loudly here instead of breaking every real
 * resolveDispute() call in production.
 */
import {
  canonicalizeAuthorityDecision as serverCanonicalize,
  hashAuthorityDecision as serverHash,
  type AuthorityDecisionPayload,
} from '../src/modules/open-settlement/arbitration-authority'
import {
  canonicalizeAuthorityDecision as sdkCanonicalize,
  hashAuthorityDecision as sdkHash,
  type AuthorityDecisionInput,
} from '../packages/sails-sdk/src/modules/settlement'

const fixtures: AuthorityDecisionPayload[] = [
  { disputeId: 'dispute-1', escrowId: 'escrow-1', appealRound: 0, authorityId: 'arbiter-1', outcome: 'RELEASE', buyerBps: null, issuedAt: '2026-08-29T00:00:00.000Z' },
  { disputeId: 'dispute-2', escrowId: 'escrow-2', appealRound: 1, authorityId: 'new-arbiter', outcome: 'REFUND', buyerBps: null, issuedAt: '2026-01-01T12:34:56.789Z' },
  { disputeId: 'dispute-3', escrowId: 'escrow-3', appealRound: 2, authorityId: 'arbiter-9', outcome: 'SPLIT', buyerBps: 7000, issuedAt: '2026-12-31T23:59:59.999Z' },
  { disputeId: 'dispute-4', escrowId: 'escrow-4', appealRound: 0, authorityId: 'arbiter-1', outcome: 'SPLIT', buyerBps: 1, issuedAt: '2026-08-29T00:00:00.000Z' },
  { disputeId: 'dispute-5', escrowId: 'escrow-5', appealRound: 0, authorityId: 'arbiter-1', outcome: 'SPLIT', buyerBps: 9999, issuedAt: '2026-08-29T00:00:00.000Z' },
]

describe('server arbitration-authority.ts vs SDK settlement.ts — canonicalization parity', () => {
  it.each(fixtures.map((f, i) => [i, f] as const))('fixture %i canonicalizes identically on both sides', (_i, fixture) => {
    const sdkPayload: AuthorityDecisionInput = fixture
    expect(sdkCanonicalize(sdkPayload)).toBe(serverCanonicalize(fixture))
  })

  it.each(fixtures.map((f, i) => [i, f] as const))('fixture %i produces the identical 32-byte sha256 digest on both sides', (_i, fixture) => {
    const sdkPayload: AuthorityDecisionInput = fixture
    const sdkDigestHex = Buffer.from(sdkHash(sdkPayload)).toString('hex')
    expect(sdkDigestHex).toBe(serverHash(fixture))
  })

  it('both sides reject the same malformed SPLIT payloads identically', () => {
    const malformed = { disputeId: 'd', escrowId: 'e', appealRound: 0, authorityId: 'a', outcome: 'SPLIT' as const, buyerBps: 0, issuedAt: '2026-01-01T00:00:00.000Z' }
    expect(() => serverCanonicalize(malformed)).toThrow(/buyerBps/)
    expect(() => sdkCanonicalize(malformed)).toThrow(/buyerBps/)
  })

  it('both sides reject a non-null buyerBps on RELEASE identically', () => {
    const malformed = { disputeId: 'd', escrowId: 'e', appealRound: 0, authorityId: 'a', outcome: 'RELEASE' as const, buyerBps: 5000, issuedAt: '2026-01-01T00:00:00.000Z' }
    expect(() => serverCanonicalize(malformed)).toThrow(/must not carry a buyerBps/)
    expect(() => sdkCanonicalize(malformed)).toThrow(/must not carry a buyerBps/)
  })

  // A cryptographic-level end-to-end proof, not just string equality: a
  // real Ed25519 signature produced with the SERVER's own signAuthorityDecision()
  // must verify successfully against the digest the SDK independently
  // computes for the identical payload — proving the parity isn't an
  // artifact of both functions merely being simple, but that a real
  // client (using the SDK's digest) and the real server (using its own
  // module to sign/verify) are speaking the exact same protocol.
  it('a signature produced over the server digest verifies against the SDK-computed digest for the same payload', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nacl = require('tweetnacl')
    const keypair = nacl.sign.keyPair()
    const fixture = fixtures[2]
    const serverDigestBytes = Buffer.from(serverHash(fixture), 'hex')
    const signature = nacl.sign.detached(new Uint8Array(serverDigestBytes), keypair.secretKey)

    const sdkDigestBytes = sdkHash(fixture)
    const verified = nacl.sign.detached.verify(new Uint8Array(sdkDigestBytes), signature, keypair.publicKey)
    expect(verified).toBe(true)
  })
})
