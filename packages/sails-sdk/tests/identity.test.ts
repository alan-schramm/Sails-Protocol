/**
 * SailsIdentityModule — real Ed25519 cryptography (tweetnacl, no mocking
 * of the crypto itself), verified against the exact byte-encoding the
 * reference implementation's own auth.ts uses to check a signature —
 * reproduced inline here rather than imported, since this SDK package is
 * standalone and must not depend on the server's source tree. If this
 * test ever fails after a change to either file, that is a real,
 * user-facing incompatibility, not a false positive.
 */
import nacl from 'tweetnacl'
import { SailsTransport } from '../src/transport'
import { SailsIdentityModule, generateKeypair } from '../src/modules/identity'
import { bytesToHex } from '../src/encoding'

// Reproduces src/common/middleware/auth.ts's verifySignedChallenge() byte
// handling exactly (Buffer.from(challenge).toString('hex') re-encoded,
// i.e. verifying the UTF-8 bytes of the challenge string itself).
function serverVerify(challenge: string, signatureHex: string, publicKeyHex: string): boolean {
  const toBytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))
  return nacl.sign.detached.verify(
    toBytes(Buffer.from(challenge).toString('hex')),
    toBytes(signatureHex),
    toBytes(publicKeyHex)
  )
}

function fakeFetch(responses: Array<{ status: number; body: unknown }>): jest.Mock {
  let call = 0
  return jest.fn().mockImplementation(async () => {
    const { status, body } = responses[call++]
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  })
}

describe('SailsIdentityModule.authenticate — real signature verified against server logic', () => {
  it('produces a signature the real server verification accepts', async () => {
    const keypair = generateKeypair()
    const publicKeyHex = bytesToHex(keypair.publicKey)
    const challenge = 'deadbeef'.repeat(8) // 64 hex chars, same shape issueChallenge() produces

    const fetchImpl = fakeFetch([
      { status: 200, body: { success: true, data: { challenge, expiresIn: 120 } } },
      { status: 200, body: { success: true, data: { participantId: 'user-1', sessionToken: 'session-xyz' } } },
    ])
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    const identity = new SailsIdentityModule(transport)

    const result = await identity.authenticate(keypair)

    expect(result).toEqual({ participantId: 'user-1', sessionToken: 'session-xyz' })
    // the session token this call received is now set on the transport
    expect(transport.getSessionToken()).toBe('session-xyz')

    // the signature actually sent in the second call must satisfy the
    // real server's verification logic
    const [, secondCallInit] = fetchImpl.mock.calls[1]
    const sentBody = JSON.parse(secondCallInit.body)
    expect(sentBody.publicKey).toBe(publicKeyHex)
    expect(serverVerify(challenge, sentBody.signature, publicKeyHex)).toBe(true)
  })

  it('produces a signature the server rejects for a different public key (not a forgeable token)', async () => {
    const keypair = generateKeypair()
    const otherKeypair = generateKeypair()
    const challenge = 'cafebabe'.repeat(8)

    const fetchImpl = fakeFetch([
      { status: 200, body: { success: true, data: { challenge, expiresIn: 120 } } },
      { status: 200, body: { success: true, data: { participantId: 'user-1', sessionToken: 'session-xyz' } } },
    ])
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    const identity = new SailsIdentityModule(transport)

    await identity.authenticate(keypair)
    const [, secondCallInit] = fetchImpl.mock.calls[1]
    const sentBody = JSON.parse(secondCallInit.body)

    // signed with keypair's secret key, so it must NOT verify against a
    // different public key
    expect(serverVerify(challenge, sentBody.signature, bytesToHex(otherKeypair.publicKey))).toBe(false)
  })
})

describe('SailsIdentityModule.create', () => {
  it('registers a generated keypair when none is supplied, and returns it', async () => {
    const fetchImpl = fakeFetch([
      { status: 201, body: { success: true, data: { id: 'user-1', publicKey: 'will-not-match-generated', displayName: null } } },
    ])
    const transport = new SailsTransport({ baseUrl: 'http://localhost:3000', fetchImpl: fetchImpl as unknown as typeof fetch })
    const identity = new SailsIdentityModule(transport)

    const { participant, keypair } = await identity.create()

    expect(participant.id).toBe('user-1')
    expect(keypair.publicKey).toBeInstanceOf(Uint8Array)
    expect(keypair.secretKey).toBeInstanceOf(Uint8Array)

    const [, init] = fetchImpl.mock.calls[0]
    const sentBody = JSON.parse(init.body)
    expect(sentBody.publicKey).toBe(bytesToHex(keypair.publicKey))
  })
})
