-- CreateIndex
-- Fixed 2026-08-09: IF NOT EXISTS added, believing the root cause was
-- this index being a genuine duplicate of one 20260807_init's own
-- migration.sql (line 454) already creates. That diagnosis was
-- incomplete. Corrected 2026-08-15: the real root cause is that this
-- folder used to be named `20260807_add_indices` — same date-only
-- prefix as `20260807_init` (now `20260807090000_init`), so Prisma's
-- lexical folder-name sort applied THIS migration's indices before
-- `_init` ever ran ("add" < "init" alphabetically), against tables that
-- didn't exist yet. Fixed for real by giving every migration folder a
-- proper full `YYYYMMDDHHMMSS` timestamp prefix (this one renamed to
-- 20260807100000_add_indices) so the sort order matches creation order.
-- The IF NOT EXISTS here is harmless and stays — the index genuinely is
-- redundant with init's own copy, just not the reason apply order broke.
CREATE INDEX IF NOT EXISTS "disputes_arbiterId_status_idx" ON "disputes"("arbiterId", "status");

-- CreateIndex
CREATE INDEX "users_reputationScore_idx" ON "users"("reputationScore");
