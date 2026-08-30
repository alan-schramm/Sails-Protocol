-- CreateTable
CREATE TABLE "correspondence_evaluations" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "appealRound" INTEGER NOT NULL,
    "evaluatorIdentityName" TEXT NOT NULL,
    "evaluatorIdentityVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correspondence_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "correspondence_evaluations_escrowId_idx" ON "correspondence_evaluations"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "correspondence_evaluations_escrowId_appealRound_evaluatorId_key" ON "correspondence_evaluations"("escrowId", "appealRound", "evaluatorIdentityName", "evaluatorIdentityVersion", "policyVersion");

-- RenameIndex
ALTER INDEX "semantic_transition_records_interactionId_transitionType_appeal" RENAME TO "semantic_transition_records_interactionId_transitionType_ap_key";
