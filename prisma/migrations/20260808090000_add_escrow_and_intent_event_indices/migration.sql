-- DB_AUDIT_REPORT.md / RELATORIO_PERFORMANCE.md, closed 2026-08-08.

-- CreateIndex
-- escrows had zero indexes; sweepExpiredEscrows() (escrow.service.ts)
-- filters by exactly this pair on every sweep interval tick.
CREATE INDEX "escrows_status_expiresAt_idx" ON "escrows"("status", "expiresAt");

-- DropIndex
-- Superseded by the composite index below — a composite index on
-- (intentId, createdAt) already serves any query that filters on
-- intentId alone (leftmost-prefix rule), so the single-column index is
-- redundant.
DROP INDEX "intent_events_intentId_idx";

-- CreateIndex
-- writeIntentEvent()'s hot path does findFirst(where: { intentId },
-- orderBy: { createdAt: 'desc' }) on every single Intent transition (to
-- read the prior entryHash for the hash chain); this composite index
-- lets it be satisfied directly instead of a separate sort step.
CREATE INDEX "intent_events_intentId_createdAt_idx" ON "intent_events"("intentId", "createdAt");
