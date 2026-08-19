-- Missão 10 (2026-08-19) — additive only. Bitcoin identifies a UTXO by
-- outpoint (txid:vout), not txid alone. txLockId's own meaning is
-- unchanged; this adds a new, separate, nullable column so new locks can
-- record the full outpoint. Existing rows (including the real Missão 09
-- mainnet escrow) get NULL here — no data loss, no reinterpretation of
-- what txLockId already means.

-- AlterTable
ALTER TABLE "escrows" ADD COLUMN     "txLockVout" INTEGER;

-- CreateIndex
-- Plain (non-partial) two-column unique constraint. Relies on Postgres's
-- own default NULLS DISTINCT behavior: a row with either column NULL
-- never collides with another NULL row (every pre-migration escrow, and
-- any escrow that hasn't locked funds yet), while two rows that both
-- have non-null, identical (txLockId, txLockVout) are rejected by the
-- database itself. No partial/filtered index needed — fully expressible
-- in schema.prisma, so `prisma migrate diff` / db:completeness-check see
-- schema and database agree exactly.
CREATE UNIQUE INDEX "escrows_txLockId_txLockVout_key" ON "escrows"("txLockId", "txLockVout");
