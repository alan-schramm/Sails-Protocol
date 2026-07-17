/**
 * Chat transport unification — verifies that a message persisted via
 * *either* transport (chat.routes.ts's WS route, or
 * negotiation.service.ts's HumanChatChannel over Pears) reaches a
 * WS-connected room member the same way, because both emit the same
 * openp2p.message.sent event and common/events/handlers.ts has exactly
 * one reaction to it (chat-room-registry.ts's doc comment explains the
 * one direction this doesn't cover — WS-origin messages aren't relayed
 * onto Pears).
 *
 * Uses the real chat-room-registry.ts (not mocked) so a fake WS member
 * can actually be joined into a room and observed receiving the push —
 * only Prisma/eventBus/reconciliationService are mocked, matching the
 * other suites' pattern.
 */
export {} // forces this file to be an ES module — without any top-level
// import/export, TS treats it as a script and its top-level `const`s leak
// into the global scope, colliding with reputationOutcome.test.ts's
// identically-named mocks (found via `--detectOpenHandles`, which runs
// jest in a mode that surfaced the resulting "cannot redeclare" error).

const mockUserUpdate = jest.fn().mockResolvedValue({ id: 'x', reputationScore: 0, totalTrades: 0 })

jest.mock('../src/common/database', () => ({
  prisma: {
    trade: { update: jest.fn(), findUnique: jest.fn() },
    dispute: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
  },
}))

const handlers: Record<string, (payload: unknown) => Promise<void> | void> = {}
jest.mock('../src/common/events/event-bus', () => ({
  eventBus: {
    emit: jest.fn().mockResolvedValue(undefined),
    on: (event: string, handler: (payload: unknown) => Promise<void> | void) => {
      handlers[event] = handler
    },
  },
}))

jest.mock('../src/modules/open-p2p/reconciliation.service', () => ({
  reconciliationService: { reconcilePeerPair: jest.fn().mockResolvedValue([]) },
}))

// @tetherto/wdk-wallet-evm ships pure ESM (no CJS build) — handlers.ts now
// transitively imports it via settlement-orchestrator.ts/escrow.service.ts/
// wdk-settlement.provider.ts (executeSettlement()'s auto-settle-on-match
// wiring). None of this suite's tests trigger openp2p.trade.created, so
// it's mocked out entirely, same reasoning as routes.test.ts.
jest.mock('@tetherto/wdk-wallet-evm', () => ({
  __esModule: true,
  default: class FakeWalletManagerEvm {},
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerEventHandlers } = require('../src/common/events/handlers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { joinRoom } = require('../src/modules/open-p2p/chat-room-registry')

function fakeSocket() {
  return { send: jest.fn(), readyState: 1, OPEN: 1 } as any
}

describe('Chat transport unification (openp2p.message.sent -> NEW_MESSAGE push)', () => {
  beforeAll(() => {
    registerEventHandlers()
  })

  it('pushes NEW_MESSAGE to a WS room member for a message that "arrived" via HumanChatChannel/Pears', async () => {
    const socket = fakeSocket()
    joinRoom('trade-unify-1', { socket, participantId: 'seller-1' })

    // Simulates negotiation.service.ts's HumanChatChannel emitting this
    // after persisting a Message via the Pears path — the WS route was
    // never involved in sending it.
    const payload = {
      messageId: 'msg-pears-1',
      tradeId: 'trade-unify-1',
      senderId: 'buyer-1',
      content: 'sending payment now',
      msgType: 'MESSAGE_EXCHANGED',
      timestamp: new Date().toISOString(),
    }

    await handlers['openp2p.message.sent'](payload)

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'NEW_MESSAGE', payload }))
  })

  it('pushes NEW_MESSAGE to every member of the same trade room, not just the sender', async () => {
    const buyerSocket = fakeSocket()
    const sellerSocket = fakeSocket()
    joinRoom('trade-unify-2', { socket: buyerSocket, participantId: 'buyer-1' })
    joinRoom('trade-unify-2', { socket: sellerSocket, participantId: 'seller-1' })

    const payload = {
      messageId: 'msg-ws-1',
      tradeId: 'trade-unify-2',
      senderId: 'buyer-1',
      content: 'hi',
      msgType: 'TEXT',
      timestamp: new Date().toISOString(),
    }

    await handlers['openp2p.message.sent'](payload)

    expect(buyerSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'NEW_MESSAGE', payload }))
    expect(sellerSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'NEW_MESSAGE', payload }))
  })

  it('does nothing (no throw) when nobody is watching that trade over WS', async () => {
    const payload = {
      messageId: 'msg-nobody-watching',
      tradeId: 'trade-with-no-ws-clients',
      senderId: 'buyer-1',
      content: 'hi',
      msgType: 'TEXT',
      timestamp: new Date().toISOString(),
    }

    expect(() => handlers['openp2p.message.sent'](payload)).not.toThrow()
  })
})
