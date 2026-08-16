-- RFC-008 D2 amendment (Missão 05.7, 2026-08-15) — durable_events is the
-- Postgres-backed storage for EventStore's DurableEvent stream
-- (common/events/event-store.ts), closing the one gap the 2026-08-04 D2
-- note and the Missão 05.5 EscrowEvent amendment both explicitly
-- disclosed and deferred: the hash-chained DurableEvent stream lived only
-- in InMemoryEventStore, gone on process restart. See this migration's
-- own RFC-008 amendment section for the durability argument.
--
-- publishedAt is TEXT, not TIMESTAMPTZ, on purpose: computeEntryHash()
-- hashes the exact ISO-8601 string produced at publish() time, and a
-- native timestamp column read back through Prisma would round-trip
-- through a JS Date object first — a real, avoidable risk of the
-- recomputed hash silently disagreeing with what was stored. Storing the
-- literal string removes that risk entirely; ISO-8601's own format still
-- sorts correctly under a plain lexicographic ORDER BY.

-- CreateTable
CREATE TABLE "durable_events" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TEXT NOT NULL,
    "entryHash" TEXT NOT NULL,
    "prevHash" TEXT NOT NULL,

    CONSTRAINT "durable_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "durable_events_correlationId_publishedAt_idx" ON "durable_events"("correlationId", "publishedAt");
