-- CreateIndex
-- Fixed 2026-08-09: IF NOT EXISTS added. Root cause found while diagnosing
-- a real `prisma migrate deploy` failure against a genuinely fresh
-- database ("relation disputes does not exist" on THIS migration) --
-- 20260807_init's own migration.sql (line 454) already creates this
-- exact index, a genuine duplicate across the two files. Every
-- environment so far bypassed this (db push pre-Prisma-7, migrate
-- resolve --applied post-upgrade baselines), so a from-scratch replay
-- had apparently never been exercised. Not editing 20260807_init itself
-- (already-applied migration, left untouched per project convention) --
-- this file is the one whose whole job is these two indices, so making
-- the already-redundant one idempotent here is the minimal, safe fix:
-- verified end-to-end against a truly empty database (both this file
-- and the full 3-migration sequence) before landing.
CREATE INDEX IF NOT EXISTS "disputes_arbiterId_status_idx" ON "disputes"("arbiterId", "status");

-- CreateIndex
CREATE INDEX "users_reputationScore_idx" ON "users"("reputationScore");
