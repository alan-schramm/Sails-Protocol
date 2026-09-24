-- Issue #254 — historical reputation must classify a settlement from the
-- immutable disposition provenance captured when the terminal EscrowEvent is
-- committed, never from the mutable current Dispute row.
ALTER TABLE "escrow_events"
  ADD COLUMN "dispositionOrigin" TEXT,
  ADD COLUMN "dispositionAppealRound" INTEGER;

ALTER TABLE "escrow_events"
  ADD CONSTRAINT "escrow_events_disposition_provenance_check"
  CHECK (
    ("dispositionOrigin" IS NULL AND "dispositionAppealRound" IS NULL)
    OR ("dispositionOrigin" = 'COOPERATIVE' AND "dispositionAppealRound" IS NULL)
    OR ("dispositionOrigin" = 'DISPUTE' AND "dispositionAppealRound" >= 0)
  );
