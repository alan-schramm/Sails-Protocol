-- CreateTable
CREATE TABLE "escrow_release_evidence" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "kind" "EscrowFundingEvidenceKind" NOT NULL,
    "txid" TEXT,
    "observedAtHeight" INTEGER,
    "tipHeightAtObservation" INTEGER,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_release_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escrow_release_evidence_escrowId_recordedAt_idx" ON "escrow_release_evidence"("escrowId", "recordedAt");

-- AddForeignKey
ALTER TABLE "escrow_release_evidence" ADD CONSTRAINT "escrow_release_evidence_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
