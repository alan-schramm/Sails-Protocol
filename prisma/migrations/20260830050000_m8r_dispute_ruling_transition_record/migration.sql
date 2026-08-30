-- Sails Core Implementation Program M8-R (Live Dispatch Retry).
-- Additive-only: adds the K2 (attribution) + K3 (Outcome) columns
-- `semantic_transition_records` was always designed to grow (see that
-- model's own comment in prisma/schema.prisma), plus a non-nullable
-- `appealRound` sentinel column needed to keep the replay-resistance
-- unique constraint correct once a second, appeal-repeatable transition
-- type (Mission13 dispute ruling) exists alongside M4's own
-- single-shot expiry transition. No existing column is altered or
-- dropped; no existing row's meaning changes (every existing row
-- backfills appealRound = -1, "not applicable to this transition type").

-- AlterTable
ALTER TABLE "semantic_transition_records"
  ADD COLUMN "attributionActor" TEXT,
  ADD COLUMN "attributionRawProof" TEXT,
  ADD COLUMN "attributionResolvedIdentity" TEXT,
  ADD COLUMN "outcomeContent" JSONB,
  ADD COLUMN "outcomeDestinationBinding" JSONB,
  ADD COLUMN "appealRound" INTEGER NOT NULL DEFAULT -1;

-- DropIndex (the old 2-column replay-resistance key)
DROP INDEX "semantic_transition_records_interactionId_transitionType_key";

-- CreateIndex (the new 3-column replay-resistance key, appealRound
-- included so a repeatable transition type like Mission13's dispute
-- ruling gets one durable record PER appeal round, never colliding with
-- an earlier round's own record)
CREATE UNIQUE INDEX "semantic_transition_records_interactionId_transitionType_appealRound_key" ON "semantic_transition_records"("interactionId", "transitionType", "appealRound");
