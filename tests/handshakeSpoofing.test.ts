/**
 * pear.service.ts's verifyHandshakeIdentity() — the fix for the real
 * vulnerability found while investigating Fase 1 Task 2
 * ("reconciliation poisoning"), documented in that function's own doc
 * comment and in tests/reconciliation-poisoning.test.ts's header.
 *
 * Before this fix, a HANDSHAKE message's `userId` field was trusted
 * outright — this proves the fix: a claimed userId is only accepted
 * when the real, cryptographic `remotePeerId` of the connection matches
 * that user's own `User.peerId` on record (set the moment their own
 * legitimate node's start() call succeeds).
 */
export {} // same forced-module reasoning as chatUnification.test.ts

const mockUserFindUnique = jest.fn()
jest.mock('../src/common/database', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) } },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyHandshakeIdentity } = require('../src/infrastructure/p2p/pear.service')

describe('verifyHandshakeIdentity — HANDSHAKE spoofing fix', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("accepts a claimed userId whose real peerId matches this connection's actual identity", async () => {
    mockUserFindUnique.mockResolvedValue({ peerId: 'real-crypto-peerid-abc' })

    const result = await verifyHandshakeIdentity('victim-real-userid', 'real-crypto-peerid-abc')

    expect(result).toBe(true)
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'victim-real-userid' },
      select: { peerId: true },
    })
  })

  it('rejects an attacker claiming to be a real userId over a connection that is not actually that user (the impersonation attack this fix closes)', async () => {
    // The victim's real peerId on record — the attacker's own connection
    // has a DIFFERENT real cryptographic identity ('attacker-real-peerid'),
    // but sends a HANDSHAKE claiming the victim's userId anyway.
    mockUserFindUnique.mockResolvedValue({ peerId: 'victim-real-peerid-xyz' })

    const result = await verifyHandshakeIdentity('victim-real-userid', 'attacker-real-peerid')

    expect(result).toBe(false)
  })

  it('rejects a claimed userId that has never started a node (no peerId on record at all)', async () => {
    mockUserFindUnique.mockResolvedValue({ peerId: null })

    const result = await verifyHandshakeIdentity('never-started-a-node', 'some-real-peerid')

    expect(result).toBe(false)
  })

  it('rejects a claimed userId that does not exist as a participant at all', async () => {
    mockUserFindUnique.mockResolvedValue(null)

    const result = await verifyHandshakeIdentity('nonexistent-userid', 'some-real-peerid')

    expect(result).toBe(false)
  })

  it('rejects a non-string/empty claimed userId without even querying the database', async () => {
    expect(await verifyHandshakeIdentity(undefined, 'some-peerid')).toBe(false)
    expect(await verifyHandshakeIdentity('', 'some-peerid')).toBe(false)
    expect(await verifyHandshakeIdentity(12345, 'some-peerid')).toBe(false)
    expect(mockUserFindUnique).not.toHaveBeenCalled()
  })
})
