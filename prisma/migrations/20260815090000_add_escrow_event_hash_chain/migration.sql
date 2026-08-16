-- RFC-008 D2 amendment (Missão 05.5, 2026-08-15) — EscrowEvent gains the
-- same tamper-evident hash chain IntentEvent already has (see this repo's
-- init migration for the columns as originally shipped on IntentEvent).
-- Nullable, same as IntentEvent's own columns: existing rows are valid
-- as-is with entryHash/prevHash = NULL, meaning "written before this
-- chain existed" — verifyEscrowEventChain() (escrow-lifecycle.ts) treats
-- the first NULL-hash row for a given escrowId as the start of a new,
-- unverifiable-before-this-point segment, never as a broken link. No
-- backfill: a deterministic hash requires the exact historical
-- (fromStatus, toStatus, triggeredBy) triple in write order, which these
-- rows already have, but computing a chain over them now would silently
-- assert a tamper-evidence guarantee that was never actually enforced at
-- the time they were written — see this migration's own RFC-008 amendment
-- note in docs/rfcs/RFC-008-verifiable-timestamps-and-chained-timeline.md.

-- AlterTable
ALTER TABLE "escrow_events" ADD COLUMN "entryHash" TEXT;
ALTER TABLE "escrow_events" ADD COLUMN "prevHash" TEXT;

-- CreateIndex
-- Same hot-path reasoning RELATORIO_PERFORMANCE.md already established
-- for intent_events (see 20260809090000_remove_offer_requires_kyc): the
-- new write path does findFirst(where: { escrowId }, orderBy: { createdAt: 'desc' })
-- on every single Escrow transition to read the prior entryHash before
-- appending the next one.
CREATE INDEX "escrow_events_escrowId_createdAt_idx" ON "escrow_events"("escrowId", "createdAt");
