// tests/integration/timestampAnchor.test.ts
//
// Real integration test against a live public OpenTimestamps calendar
// server — RFC-008 D1, closed 2026-08-04. Same "skip gracefully if the
// real external dependency isn't reachable" pattern as
// tests/integration/docker.test.ts and redisStreamsEventStore.test.ts,
// not a mock of the calendar server.

import { createHash } from 'crypto'
import { OpenTimestampsAnchor } from '../../src/modules/open-proof/timestamp-anchor'

describe('OpenTimestampsAnchor (RFC-008 D1, real calendar server)', () => {
  jest.setTimeout(20_000)

  let serverReachable = false

  beforeAll(async () => {
    try {
      const res = await fetch('https://a.pool.opentimestamps.org/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.opentimestamps.v1' },
        body: createHash('sha256').update('reachability-check').digest(),
      })
      serverReachable = res.ok
    } catch {
      serverReachable = false
    }
  })

  it('anchor() submits a real digest and gets back a real, non-trivial proof blob', async () => {
    if (!serverReachable) {
      console.warn('Skipping OpenTimestampsAnchor integration test — calendar server unreachable')
      return
    }
    const anchor = new OpenTimestampsAnchor()
    const digestHex = createHash('sha256').update(`sails-protocol-test-${Date.now()}`).digest('hex')

    const proof = await anchor.anchor(digestHex)

    expect(proof.anchorType).toBe('opentimestamps')
    expect(proof.upgraded).toBe(false)
    expect(typeof proof.submittedAt).toBe('string')
    // A real OTS proof blob is not just a handful of bytes — this is the
    // same order of magnitude observed hitting the live server directly
    // before this file was written (137 bytes for a single digest).
    expect(Buffer.from(proof.anchorId, 'base64').length).toBeGreaterThan(50)
  })

  it('anchor() rejects a malformed digest before ever making a network call', async () => {
    const anchor = new OpenTimestampsAnchor()
    await expect(anchor.anchor('not-a-real-digest')).rejects.toThrow(/32-byte SHA-256 digest/)
  })

  it('upgrade() throws a specific, honest error — verification is real, disclosed unbuilt scope', async () => {
    const anchor = new OpenTimestampsAnchor()
    await expect(
      anchor.upgrade({ anchorType: 'opentimestamps', anchorId: 'x', submittedAt: new Date().toISOString(), upgraded: false })
    ).rejects.toThrow(/not implemented/)
  })
})
