-- CreateEnum
CREATE TYPE "SemanticPriorPositionKind" AS ENUM ('LEGACY_UNVERIFIED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SemanticConditionResult" AS ENUM ('SATISFIED', 'NOT_YET_SATISFIED', 'UNSATISFIABLE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "semantic_transition_records" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "transitionType" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "priorPositionKind" "SemanticPriorPositionKind" NOT NULL,
    "priorPositionReference" TEXT,
    "rulesetName" TEXT NOT NULL,
    "rulesetIdentity" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "rulesetCommitment" TEXT NOT NULL,
    "rulesetExpectedEvaluatorName" TEXT NOT NULL,
    "rulesetExpectedEvaluatorVersion" TEXT NOT NULL,
    "rulesetExpectedProfileName" TEXT NOT NULL,
    "rulesetExpectedProfileVersion" TEXT NOT NULL,
    "evaluatorIdentityName" TEXT NOT NULL,
    "evaluatorIdentityVersion" TEXT NOT NULL,
    "profileIdentityName" TEXT NOT NULL,
    "profileIdentityVersion" TEXT NOT NULL,
    "deadlineMs" BIGINT NOT NULL,
    "evaluationTimeMs" BIGINT NOT NULL,
    "conditionResult" "SemanticConditionResult" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_transition_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "semantic_transition_records_interactionId_idx" ON "semantic_transition_records"("interactionId");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_transition_records_interactionId_transitionType_key" ON "semantic_transition_records"("interactionId", "transitionType");
