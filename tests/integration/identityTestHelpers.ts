// tests/integration/identityTestHelpers.ts
//
// Issue #302 — canonical registration now requires proof of possession
// (a real Ed25519 signature over a real registration challenge — see
// src/modules/open-identity/identity.service.ts's register() and
// src/common/middleware/auth.ts's verifyRegistrationProof()). Every
// real-Postgres integration test in this directory that previously
// called `identityService.register({ publicKey: 'some-fake-string',
// displayName })` with an arbitrary, non-Ed25519 placeholder purely to
// get a `User.id` for driving the rest of its own flow (escrow, dispute,
// multisig, offer/intent, ...) can no longer do that — there is no
// private key behind a fake string, so no proof can be produced for it.
//
// This is the single shared helper every such call site now goes
// through: generates a real, throwaway Ed25519 keypair, performs the
// real challenge-request -> sign -> submit protocol against the real
// (unmocked) auth.ts + identityService, and returns the created
// Participant. Centralizing this avoids hand-duplicating the same
// crypto flow across nine call sites with a chance of silent drift.
import nacl from 'tweetnacl'

export async function registerTestParticipant(
  identityService: { register(input: { publicKey: string; signature: string; displayName?: string }): Promise<{ id: string; publicKey: string }> },
  displayName?: string
): Promise<{ id: string; publicKey: string }> {
  // Lazily required — common/middleware/auth.ts touches redis/config at
  // module scope, same discipline every caller of this helper already
  // applies to identityService/liquidityRouter/etc. in its own
  // beforeAll() (required only after the real-DB availability probe).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { issueRegistrationChallenge, registrationProofMessage } = require('../../src/common/middleware/auth')
  const keypair = nacl.sign.keyPair()
  const publicKey = Buffer.from(keypair.publicKey).toString('hex')
  const { challenge } = await issueRegistrationChallenge(publicKey)
  const signature = Buffer.from(
    nacl.sign.detached(registrationProofMessage(challenge, displayName), keypair.secretKey)
  ).toString('hex')
  return identityService.register({ publicKey, signature, displayName })
}
