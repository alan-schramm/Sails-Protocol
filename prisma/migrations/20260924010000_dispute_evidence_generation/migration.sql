-- #309 — QVAC evidence-generation integrity.
-- Evidence appenders use this monotonic generation as an optimistic
-- concurrency token. Existing disputes start at generation 0; no
-- historical evidence entries are reinterpreted or assigned fabricated
-- per-entry generations.
ALTER TABLE "disputes"
  ADD COLUMN "evidenceGeneration" INTEGER NOT NULL DEFAULT 0;
