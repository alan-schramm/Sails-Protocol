-- CreateEnum
CREATE TYPE "EscrowFundingEvidenceKind" AS ENUM ('OBSERVED_CONFIRMED', 'REORGED_INVALIDATED', 'RECONFIRMED', 'REPLACEMENT_OBSERVED', 'AMBIGUOUS');

-- CreateTable
CREATE TABLE "escrow_funding_evidence" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "kind" "EscrowFundingEvidenceKind" NOT NULL,
    "txid" TEXT,
    "vout" INTEGER,
    "amountSats" BIGINT,
    "observedAtHeight" INTEGER,
    "tipHeightAtObservation" INTEGER,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_funding_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escrow_funding_evidence_escrowId_recordedAt_idx" ON "escrow_funding_evidence"("escrowId", "recordedAt");

-- AddForeignKey
ALTER TABLE "escrow_funding_evidence" ADD CONSTRAINT "escrow_funding_evidence_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
