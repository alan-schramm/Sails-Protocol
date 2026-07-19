/**
 * Timeline (RFC-007 D5, real as of RFC-017) — a real integration test
 * against the default InMemoryEventStore backing the shared `eventBus`
 * singleton (no mocking needed, unlike the QVAC-backed tests elsewhere in
 * this directory — this is plain in-process storage, genuinely fast and
 * deterministic to exercise for real).
 */
import { eventBus } from '../src/common/events/event-bus'
import { getTimeline } from '../src/core/timeline'

describe('Timeline.getEvents()', () => {
  it('returns published events for a correlationId, in publish order', async () => {
    const correlationId = `trade-timeline-${Date.now()}-a`

    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'hello', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm2', tradeId: correlationId, senderId: 'u2', content: 'hi back', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)

    const entries = await getTimeline(correlationId).getEvents()

    expect(entries).toHaveLength(2)
    expect(entries[0].eventType).toBe('openp2p.message.sent')
    expect(entries[0].payload).toMatchObject({ content: 'hello' })
    expect(entries[1].payload).toMatchObject({ content: 'hi back' })
    expect(entries.every((e) => typeof e.eventId === 'string' && e.eventId.length > 0)).toBe(true)
    expect(entries.every((e) => typeof e.occurredAt === 'string')).toBe(true)
  })

  it('returns [] for a correlationId with no events, never throws', async () => {
    const entries = await getTimeline(`never-used-${Date.now()}`).getEvents()
    expect(entries).toEqual([])
  })

  it('only returns events for the requested correlationId, not other trades', async () => {
    const correlationIdA = `trade-timeline-${Date.now()}-b`
    const correlationIdB = `trade-timeline-${Date.now()}-c`

    await eventBus.emit('openp2p.message.sent', {
      messageId: 'ma', tradeId: correlationIdA, senderId: 'u1', content: 'trade A message', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationIdA)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'mb', tradeId: correlationIdB, senderId: 'u1', content: 'trade B message', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationIdB)

    const entriesA = await getTimeline(correlationIdA).getEvents()
    expect(entriesA).toHaveLength(1)
    expect(entriesA[0].payload).toMatchObject({ content: 'trade A message' })
  })
})
