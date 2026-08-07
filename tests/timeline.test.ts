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

// RFC-008 D2 — hash-chained Timeline, closed 2026-08-04. Real integration
// tests against the same InMemoryEventStore/eventBus singleton
// getTimeline() actually uses — no mocking, real SHA-256, same
// "genuinely fast and deterministic to exercise for real" reasoning
// this file's own header comment already established.
describe('Timeline — hash chaining (RFC-008 D2)', () => {
  it('the first entry for a correlationId has prevHash = GENESIS_HASH', async () => {
    const { GENESIS_HASH } = require('../src/common/events/event-store')
    const correlationId = `chain-${Date.now()}-a`

    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'first', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)

    const [entry] = await getTimeline(correlationId).getEvents()
    expect(entry.prevHash).toBe(GENESIS_HASH)
    expect(entry.entryHash).toMatch(/^[0-9a-f]{64}$/) // real 32-byte SHA-256 digest, hex
  })

  it('each subsequent entry\'s prevHash equals the previous entry\'s own entryHash — a real chain, not independent hashes', async () => {
    const correlationId = `chain-${Date.now()}-b`

    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'first', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm2', tradeId: correlationId, senderId: 'u2', content: 'second', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm3', tradeId: correlationId, senderId: 'u1', content: 'third', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)

    const [e1, e2, e3] = await getTimeline(correlationId).getEvents()
    expect(e2.prevHash).toBe(e1.entryHash)
    expect(e3.prevHash).toBe(e2.entryHash)
    // Distinct content -> distinct hashes, not a constant/degenerate value.
    expect(new Set([e1.entryHash, e2.entryHash, e3.entryHash]).size).toBe(3)
  })

  it('verifyChain() reports valid: true for a genuine, untampered chain', async () => {
    const correlationId = `chain-${Date.now()}-c`
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'a', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm2', tradeId: correlationId, senderId: 'u2', content: 'b', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)

    const result = await getTimeline(correlationId).verifyChain()
    expect(result).toEqual({ valid: true })
  })

  it('verifyChain() reports valid: true and brokenAtIndex undefined for a correlationId with no events', async () => {
    const result = await getTimeline(`chain-never-used-${Date.now()}`).verifyChain()
    expect(result).toEqual({ valid: true })
  })

  it('verifyChain() detects a payload mutated in place — the same tamper scenario a Dispute UI needs caught', async () => {
    const correlationId = `chain-${Date.now()}-tamper`
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'original', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm2', tradeId: correlationId, senderId: 'u2', content: 'reply', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)

    // Reach into the shared eventBus's own underlying InMemoryEventStore —
    // the same real store getTimeline() reads from, not a separate mock —
    // and mutate the first entry's payload without recomputing its hash,
    // simulating an attacker with direct storage access. TypeScript
    // `private` is compile-time only; `as any` is the pragmatic way to
    // reach it from a test, same pattern used elsewhere in this suite.
    const store = (eventBus as any).store
    const events = store.byCorrelationId.get(correlationId)
    events[0].payload = { ...events[0].payload, content: 'TAMPERED' }

    const result = await getTimeline(correlationId).verifyChain()
    expect(result).toEqual({ valid: false, brokenAtIndex: 0 })
  })

  it('verifyChain() detects a deleted/reordered entry (prevHash link broken) even if each remaining entry is individually self-consistent', async () => {
    const correlationId = `chain-${Date.now()}-reorder`
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm1', tradeId: correlationId, senderId: 'u1', content: 'a', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm2', tradeId: correlationId, senderId: 'u2', content: 'b', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)
    await eventBus.emit('openp2p.message.sent', {
      messageId: 'm3', tradeId: correlationId, senderId: 'u1', content: 'c', msgType: 'TEXT', timestamp: new Date().toISOString(),
    }, correlationId)

    const store = (eventBus as any).store
    const events: any[] = store.byCorrelationId.get(correlationId)
    events.splice(1, 1) // delete the middle entry — each remaining entry's own hash is still internally correct

    const result = await getTimeline(correlationId).verifyChain()
    expect(result.valid).toBe(false)
    expect(result.brokenAtIndex).toBe(1) // the entry now at index 1 (formerly index 2) has a prevHash that no longer matches
  })
})
