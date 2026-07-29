/**
 * Fase 6 — real, pure-logic tests for the integration helpers
 * (`intent-builder.ts`, `event-handler.ts`, `wallet-mock/`). No live
 * Sails node needed for these — that's what the two `examples/*.ts`
 * scripts are for (documented in this package's README as manually-run,
 * same as `examples/simple-wallet`'s own script). Written test-first,
 * per the brief's own "Regras de Execução" rule 3: each block below
 * existed and failed (no implementation module yet) before its
 * implementation was written.
 */
import { buildTradeIntentPayload, buildBuyIntent, buildSellIntent } from '../src/sails-integration/intent-builder'
import { TradeEventHandler, type ChannelLike } from '../src/sails-integration/event-handler'
import { MockWalletAdapter } from '../src/wallet-mock'
import type { ChatFrame, ChatMessageEvent } from '@sails/sdk'

describe('buildTradeIntentPayload', () => {
  it('builds a real TradeIntentPayload with the required fields', () => {
    const payload = buildTradeIntentPayload({ asset: 'BTC', side: 'BUY' })
    expect(payload).toEqual({ asset: 'BTC', side: 'BUY' })
  })

  it('includes optional fields only when provided (no undefined keys leaking in)', () => {
    const payload = buildTradeIntentPayload({ asset: 'USDT_LIGHTNING', side: 'SELL', maxValue: '100.00', currency: 'BRL' })
    expect(payload).toEqual({ asset: 'USDT_LIGHTNING', side: 'SELL', maxValue: '100.00', currency: 'BRL' })
    expect(Object.keys(payload)).not.toContain('minValue')
  })

  it('rejects a non-decimal-string maxValue/minValue (RFC-009 — never a JS number)', () => {
    // @ts-expect-error — deliberately passing a number to prove the real function rejects it at runtime, not just via types
    expect(() => buildTradeIntentPayload({ asset: 'BTC', side: 'BUY', maxValue: 100 })).toThrow(/decimal string/)
  })
})

describe('buildBuyIntent / buildSellIntent', () => {
  it('buildBuyIntent fixes side to BUY', () => {
    expect(buildBuyIntent('BTC', { currency: 'USD' })).toEqual({ asset: 'BTC', side: 'BUY', currency: 'USD' })
  })

  it('buildSellIntent fixes side to SELL', () => {
    expect(buildSellIntent('LN_BTC', {})).toEqual({ asset: 'LN_BTC', side: 'SELL' })
  })
})

// A minimal fake matching WebSocketChannel's real shape
// (onMessage/onEvent/send/leave/close) — lets TradeEventHandler be
// tested without a live WebSocket/Sails node, the same reason
// escrow.service.ts's own EscrowRecord uses a structural type instead
// of the full Prisma row.
class FakeChannel implements ChannelLike {
  private messageHandlers: Array<(msg: ChatMessageEvent) => void> = []
  private eventHandlers: Array<(frame: ChatFrame) => void> = []
  sent: Array<{ content: string; msgType?: string }> = []
  left = false
  closed = false

  onMessage(handler: (msg: ChatMessageEvent) => void): void {
    this.messageHandlers.push(handler)
  }
  onEvent(handler: (frame: ChatFrame) => void): void {
    this.eventHandlers.push(handler)
  }
  send(input: { content: string; msgType?: string }): void {
    this.sent.push(input)
  }
  leave(): void {
    this.left = true
  }
  close(): void {
    this.closed = true
  }

  // Test-only helper: simulates the server pushing a frame down the socket.
  emit(frame: ChatFrame): void {
    for (const h of this.eventHandlers) h(frame)
    if (frame.type === 'NEW_MESSAGE') for (const h of this.messageHandlers) h(frame.payload as ChatMessageEvent)
  }
}

function realMessage(overrides: Partial<ChatMessageEvent> = {}): ChatMessageEvent {
  return { messageId: 'msg-1', tradeId: 'trade-1', senderId: 'buyer-1', content: 'oi', msgType: 'TEXT', timestamp: new Date().toISOString(), ...overrides }
}

describe('TradeEventHandler', () => {
  it('buffers real messages in order and exposes them via getHistory()', () => {
    const channel = new FakeChannel()
    const handler = new TradeEventHandler(channel)

    channel.emit({ type: 'NEW_MESSAGE', payload: realMessage({ messageId: 'm1', content: 'primeira' }) })
    channel.emit({ type: 'NEW_MESSAGE', payload: realMessage({ messageId: 'm2', content: 'segunda' }) })

    expect(handler.getHistory().map((m) => m.content)).toEqual(['primeira', 'segunda'])
  })

  it('dispatches TRADE_STATUS_UPDATE frames to onTradeStatusChange, not onMessage', () => {
    const channel = new FakeChannel()
    const handler = new TradeEventHandler(channel)
    const statusUpdates: unknown[] = []
    const messages: ChatMessageEvent[] = []
    handler.onTradeStatusChange((p) => statusUpdates.push(p))
    handler.onMessage((m) => messages.push(m))

    channel.emit({ type: 'TRADE_STATUS_UPDATE', payload: { status: 'ACTIVE' } })

    expect(statusUpdates).toEqual([{ status: 'ACTIVE' }])
    expect(messages).toEqual([])
  })

  it('dispatches ESCROW_STATUS_UPDATE frames to onEscrowStatusChange', () => {
    const channel = new FakeChannel()
    const handler = new TradeEventHandler(channel)
    const escrowUpdates: unknown[] = []
    handler.onEscrowStatusChange((p) => escrowUpdates.push(p))

    channel.emit({ type: 'ESCROW_STATUS_UPDATE', payload: { status: 'FUNDS_LOCKED' } })

    expect(escrowUpdates).toEqual([{ status: 'FUNDS_LOCKED' }])
  })

  it('dispatches ERROR frames to onError', () => {
    const channel = new FakeChannel()
    const handler = new TradeEventHandler(channel)
    const errors: unknown[] = []
    handler.onError((p) => errors.push(p))

    channel.emit({ type: 'ERROR', payload: { message: 'boom' } })

    expect(errors).toEqual([{ message: 'boom' }])
  })

  it('sendMessage() delegates to the real channel.send()', () => {
    const channel = new FakeChannel()
    const handler = new TradeEventHandler(channel)

    handler.sendMessage('oi')

    expect(channel.sent).toEqual([{ content: 'oi', msgType: undefined }])
  })

  it('leave()/close() delegate to the real channel', () => {
    const channel = new FakeChannel()
    const handler = new TradeEventHandler(channel)

    handler.leave()
    handler.close()

    expect(channel.left).toBe(true)
    expect(channel.closed).toBe(true)
  })
})

describe('MockWalletAdapter — real WalletAdapter interface, fake values (never for real funds)', () => {
  it('getPeerId() returns a stable, deterministic id across calls', async () => {
    const wallet = new MockWalletAdapter()
    const a = await wallet.getPeerId()
    const b = await wallet.getPeerId()
    expect(a).toBe(b)
  })

  it('two independently-constructed wallets get different peer ids', async () => {
    const a = await new MockWalletAdapter().getPeerId()
    const b = await new MockWalletAdapter().getPeerId()
    expect(a).not.toBe(b)
  })

  it('getAddress() is deterministic per asset and differs across assets', async () => {
    const wallet = new MockWalletAdapter()
    const btcA = await wallet.getAddress('BTC')
    const btcB = await wallet.getAddress('BTC')
    const usdt = await wallet.getAddress('USDT_ERC20')
    expect(btcA).toBe(btcB)
    expect(btcA).not.toBe(usdt)
  })

  it('getBalance() returns a real decimal string (RFC-009), configurable at construction', async () => {
    const wallet = new MockWalletAdapter({ initialBalances: { BTC: '1.50000000' } })
    expect(await wallet.getBalance('BTC')).toBe('1.50000000')
    expect(await wallet.getBalance('USDT_ERC20')).toBe('0.00000000')
  })

  it('signTransaction() returns a clearly-labeled fake signature, never a real one', async () => {
    const wallet = new MockWalletAdapter()
    const signed = await wallet.signTransaction('BTC', { to: 'addr', amount: '1.0' }) as { mock: true }
    expect(signed.mock).toBe(true)
  })

  it('broadcastTransaction() returns a fake but well-formed txid', async () => {
    const wallet = new MockWalletAdapter()
    const signed = await wallet.signTransaction('BTC', { to: 'addr', amount: '1.0' })
    const txId = await wallet.broadcastTransaction('BTC', signed)
    expect(txId).toMatch(/^mock-tx-/)
  })

  it('getCapabilities() reflects the configured asset list', async () => {
    const wallet = new MockWalletAdapter({ assets: ['BTC', 'LN_BTC'] })
    const caps = await wallet.getCapabilities()
    expect(caps.assets).toEqual(['BTC', 'LN_BTC'])
    expect(caps.supportsP2PTrading).toBe(true)
  })
})
