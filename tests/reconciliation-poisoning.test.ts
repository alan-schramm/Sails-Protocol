/**
 * Fase 1, Task 2 (Qwen brief) — "reconciliation poisoning": a malicious
 * peer sends an event with a forged signature; ReconciliationService
 * should reject it.
 *
 * Read reconciliation.service.ts directly before writing this test,
 * because the brief's premise doesn't match this class's actual shape.
 * `ReconciliationService` (src/modules/open-p2p/reconciliation.service.ts)
 * never accepts a peer-supplied event/payload at all — `reconcileTrade()`
 * takes only a `tradeId` (and an optional client-supplied cursor
 * timestamp) and `reconcilePeerPair()` takes only two participant ids.
 * Both read exclusively from this server's own Postgres (Trade, Escrow,
 * Message) — the class's own header comment states this explicitly: "It
 * does not replay over P2P — it reads the same Postgres tables the HTTP
 * API already exposes... the same authoritative source both trade
 * counterparties' clients already depend on, not a second copy of the
 * truth." There is no field anywhere in its inputs or outputs a
 * malicious peer's own message content could reach — a forged-signature
 * P2P event, however it's forged, has no path into this class at all.
 * So this test proves that structural property (the strongest thing
 * provable here) rather than testing signature verification that has no
 * data to verify.
 *
 * A real, related vulnerability WAS found while investigating this —
 * NOT in ReconciliationService, but one layer earlier, in
 * pear.service.ts's `PearNode.handleNewConnection()`: the HANDSHAKE
 * message's `userId` field is peer-supplied and trusted with zero
 * verification (`this.userPeerMap.set(msg.userId, remotePeerId)`) before
 * it's used to key `sendToPeer()`'s recipient lookup and to populate the
 * `peer.connected` event's `userId` this file's own `reconcilePeerPair()`
 * gets called with (common/events/handlers.ts). `remotePeerId` itself
 * IS cryptographically real (HyperDHT's own Noise-handshake identity),
 * but nothing checks that the *claimed* `msg.userId` actually belongs to
 * whoever holds that key (e.g. against the `User.peerId` a real
 * challenge-response session already established). Deliberately NOT
 * fixed in this file/pass — it needs a design decision (verify against
 * User.peerId? require a signed proof over the DHT connection?) before
 * a fix, not a mechanical "add validation" — flagged in the phase report
 * instead, not silently patched here.
 */
export {} // same forced-module reasoning as chatUnification.test.ts

const mockTradeFindMany = jest.fn()
const mockTradeFindUnique = jest.fn()
const mockMessageFindMany = jest.fn()

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: {
      findMany: (...args: unknown[]) => mockTradeFindMany(...args),
      findUnique: (...args: unknown[]) => mockTradeFindUnique(...args),
    },
    message: { findMany: (...args: unknown[]) => mockMessageFindMany(...args) },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconciliationService } = require('../src/modules/open-p2p/reconciliation.service')

describe('ReconciliationService — no path for a peer-supplied event to poison it', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("reconcilePeerPair() with a claimed remoteUserId that isn't actually a trade counterparty returns nothing — an attacker impersonating an arbitrary userId gains no data", async () => {
    // Simulates the real attack this class's own callers are exposed to:
    // pear.service.ts's handleNewConnection() trusts an unverified
    // HANDSHAKE `msg.userId` and emits peer.connected with it, which
    // common/events/handlers.ts feeds straight into reconcilePeerPair()
    // as `remoteUserId`. Proving this method itself is harmless even
    // when fed a bogus/attacker-chosen id is what actually protects
    // against that upstream trust gap mattering here.
    mockTradeFindMany.mockResolvedValue([]) // no trade exists between these two ids

    const results = await reconciliationService.reconcilePeerPair('real-victim-user', 'attacker-claimed-userid')

    expect(results).toEqual([])
    expect(mockMessageFindMany).not.toHaveBeenCalled() // never even reaches for message content
  })

  it('reconcileTrade() ignores everything except the trade id and cursor — a forged/oversized/malformed cursor cannot inject data, it can only filter what Postgres already has', async () => {
    mockTradeFindUnique.mockResolvedValue({ id: 'trade-1', status: 'ACTIVE', escrow: { status: 'FUNDS_LOCKED' } })
    mockMessageFindMany.mockResolvedValue([
      { id: 'm1', senderId: 'buyer-1', content: 'real message from the real DB', msgType: 'TEXT', createdAt: new Date() },
    ])

    const result = await reconciliationService.reconcileTrade('trade-1', new Date('2020-01-01'))

    // The returned content is exactly and only what mockMessageFindMany
    // (standing in for real Postgres) provided — nothing an attacker
    // supplied out-of-band could have altered it.
    expect(result.missedMessages).toHaveLength(1)
    expect(result.missedMessages[0].content).toBe('real message from the real DB')
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tradeId: 'trade-1' }) })
    )
  })

  it('reconcileTrade() throws NotFoundError for a nonexistent trade rather than fabricating a result', async () => {
    mockTradeFindUnique.mockResolvedValue(null)
    await expect(reconciliationService.reconcileTrade('does-not-exist')).rejects.toThrow(/not found|Trade/i)
  })
})
