-- ADR-005 / #218 — durable ruling-generation provenance and execution-commit
-- authorization for disputed pending economic operations.
--
-- Additive only. Legacy escrow_pending_transactions rows (every pending
-- operation created before this migration) get NULL for all six new
-- columns, including any that happen to originate from a disputed ruling —
-- never backfilled, never fabricated (ADR-005 §9 / mission #218 discipline:
-- "do not manufacture historical authority provenance"). A legacy row with
-- no recorded generation is one economic-disposition-authority.ts treats as
-- ADR-005-inapplicable (same as an ordinary cooperative operation), not as
-- an already-proven current generation.
ALTER TABLE "escrow_pending_transactions"
  ADD COLUMN "disputeId" TEXT,
  ADD COLUMN "rulingAppealRound" INTEGER,
  ADD COLUMN "rulingArbiterId" TEXT,
  ADD COLUMN "rulingOutcome" "DisputeRuling",
  ADD COLUMN "rulingAuthoritySignature" TEXT,
  ADD COLUMN "rulingAuthorityIssuedAt" TIMESTAMP(3);

CREATE TABLE "economic_disposition_authorizations" (
    "id" TEXT NOT NULL,
    "pendingOperationId" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "appealRound" INTEGER NOT NULL,
    "arbiterId" TEXT NOT NULL,
    "ruling" "DisputeRuling" NOT NULL,
    "operationDigest" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "economic_disposition_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "economic_disposition_authorizations_pendingOperationId_key"
ON "economic_disposition_authorizations"("pendingOperationId");

CREATE INDEX "economic_disposition_authorizations_escrowId_idx"
ON "economic_disposition_authorizations"("escrowId");

CREATE INDEX "economic_disposition_authorizations_disputeId_idx"
ON "economic_disposition_authorizations"("disputeId");
