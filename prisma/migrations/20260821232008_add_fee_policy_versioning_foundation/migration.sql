-- CreateEnum
CREATE TYPE "FeePolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "FeePayerModel" AS ENUM ('SELLER_PAYS');

-- CreateEnum
CREATE TYPE "FeeEconomicBasis" AS ENUM ('SELLER_DELIVERED_VALUE');

-- CreateEnum
CREATE TYPE "FeeEconomicDetermination" AS ENUM ('OWED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FeeCollectionStatus" AS ENUM ('PENDING_COLLECTION', 'IN_PROGRESS', 'WAIVED', 'UNCOLLECTIBLE_BYPASSED', 'COLLECTED', 'DISTRIBUTED');

-- CreateEnum
CREATE TYPE "FeeCollectionEvidenceKind" AS ENUM ('BROADCAST', 'CONFIRMED', 'REPLACED', 'DROPPED', 'REORGED_OUT', 'ALTERNATE_SPEND');

-- AlterTable
ALTER TABLE "escrows" ADD COLUMN     "feePolicyVersionId" TEXT,
ADD COLUMN     "snapshotEconomicBasis" "FeeEconomicBasis",
ADD COLUMN     "snapshotPayerModel" "FeePayerModel",
ADD COLUMN     "snapshotProtocolFeeRate" DECIMAL(24,8);

-- CreateTable
CREATE TABLE "fee_policy_versions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "railScope" TEXT NOT NULL,
    "status" "FeePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "protocolFeeRate" DECIMAL(24,8) NOT NULL,
    "payerModel" "FeePayerModel" NOT NULL,
    "economicBasis" "FeeEconomicBasis" NOT NULL,
    "nodeOperatorPct" DECIMAL(24,8) NOT NULL,
    "treasuryPct" DECIMAL(24,8) NOT NULL,
    "walletRebatePct" DECIMAL(24,8) NOT NULL,
    "arbitratorReservePct" DECIMAL(24,8) NOT NULL,
    "smallTradeRule" JSONB NOT NULL DEFAULT '{}',
    "triggerSemantics" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "fee_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_obligations" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "feePolicyVersionId" TEXT NOT NULL,
    "economicDetermination" "FeeEconomicDetermination" NOT NULL,
    "collectionStatus" "FeeCollectionStatus",
    "basisAmount" DECIMAL(24,8),
    "computedFee" DECIMAL(24,8),
    "asset" "AssetType",
    "recipientAddress" TEXT,
    "distributedInBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_collection_evidence" (
    "id" TEXT NOT NULL,
    "feeObligationId" TEXT NOT NULL,
    "kind" "FeeCollectionEvidenceKind" NOT NULL,
    "txid" TEXT,
    "vout" INTEGER,
    "scriptPubKey" TEXT,
    "amount" DECIMAL(24,8),
    "confirmedAtHeight" INTEGER,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_collection_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_distribution_batches" (
    "id" TEXT NOT NULL,
    "asset" "AssetType" NOT NULL,
    "totalAmount" DECIMAL(24,8) NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_distribution_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_distribution_batch_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "feeObligationId" TEXT NOT NULL,
    "feePolicyVersionId" TEXT NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "nodeOperatorShare" DECIMAL(24,8) NOT NULL,
    "treasuryShare" DECIMAL(24,8) NOT NULL,
    "walletRebateShare" DECIMAL(24,8) NOT NULL,
    "arbitratorReserveShare" DECIMAL(24,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_distribution_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_policy_versions_railScope_status_idx" ON "fee_policy_versions"("railScope", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fee_obligations_escrowId_key" ON "fee_obligations"("escrowId");

-- CreateIndex
CREATE INDEX "fee_obligations_feePolicyVersionId_idx" ON "fee_obligations"("feePolicyVersionId");

-- CreateIndex
CREATE INDEX "fee_obligations_collectionStatus_idx" ON "fee_obligations"("collectionStatus");

-- CreateIndex
CREATE INDEX "fee_collection_evidence_feeObligationId_recordedAt_idx" ON "fee_collection_evidence"("feeObligationId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "fee_distribution_batch_items_feeObligationId_key" ON "fee_distribution_batch_items"("feeObligationId");

-- CreateIndex
CREATE INDEX "fee_distribution_batch_items_batchId_idx" ON "fee_distribution_batch_items"("batchId");

-- CreateIndex
CREATE INDEX "fee_distribution_batch_items_feePolicyVersionId_idx" ON "fee_distribution_batch_items"("feePolicyVersionId");

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_feePolicyVersionId_fkey" FOREIGN KEY ("feePolicyVersionId") REFERENCES "fee_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_obligations" ADD CONSTRAINT "fee_obligations_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_obligations" ADD CONSTRAINT "fee_obligations_feePolicyVersionId_fkey" FOREIGN KEY ("feePolicyVersionId") REFERENCES "fee_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_obligations" ADD CONSTRAINT "fee_obligations_distributedInBatchId_fkey" FOREIGN KEY ("distributedInBatchId") REFERENCES "fee_distribution_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_collection_evidence" ADD CONSTRAINT "fee_collection_evidence_feeObligationId_fkey" FOREIGN KEY ("feeObligationId") REFERENCES "fee_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_distribution_batch_items" ADD CONSTRAINT "fee_distribution_batch_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "fee_distribution_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_distribution_batch_items" ADD CONSTRAINT "fee_distribution_batch_items_feeObligationId_fkey" FOREIGN KEY ("feeObligationId") REFERENCES "fee_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Missão 11 Fase 2.2 — Financial-integrity defense-in-depth (Fase 2.1 §1/§2
-- decision). These two triggers are NOT expressible in schema.prisma and are
-- NOT modeled by `prisma migrate diff`/`db:completeness-check` in any way —
-- that tool only compares tables/columns/indexes/constraints/enums, never
-- trigger objects. This is a real, permanent, disclosed blind spot: running
-- db:completeness-check will report clean identically whether these two
-- triggers exist in the live database or not. Their existence must be
-- verified directly against a real Postgres instance (done for this
-- migration — see Missão 11 Fase 2.2's own final report for the raw-SQL
-- UPDATE rejection proof), never inferred from a clean completeness-check.

-- Trigger 1: FeePolicyVersion economic-column immutability once
-- status != 'DRAFT'. Deliberately keyed on OLD.status (not
-- NEW.status = 'PUBLISHED'), so RETIRED stays exactly as immutable as
-- PUBLISHED — retiring a policy can never simultaneously smuggle in an
-- economic-field change. status/publishedAt/retiredAt are explicitly
-- excluded from the comparison and may always change.
CREATE OR REPLACE FUNCTION fee_policy_versions_enforce_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    IF NEW."protocolFeeRate" IS DISTINCT FROM OLD."protocolFeeRate"
      OR NEW."payerModel" IS DISTINCT FROM OLD."payerModel"
      OR NEW."economicBasis" IS DISTINCT FROM OLD."economicBasis"
      OR NEW."nodeOperatorPct" IS DISTINCT FROM OLD."nodeOperatorPct"
      OR NEW."treasuryPct" IS DISTINCT FROM OLD."treasuryPct"
      OR NEW."walletRebatePct" IS DISTINCT FROM OLD."walletRebatePct"
      OR NEW."arbitratorReservePct" IS DISTINCT FROM OLD."arbitratorReservePct"
      OR NEW."smallTradeRule" IS DISTINCT FROM OLD."smallTradeRule"
      OR NEW."triggerSemantics" IS DISTINCT FROM OLD."triggerSemantics"
      OR NEW."railScope" IS DISTINCT FROM OLD."railScope"
      OR NEW."label" IS DISTINCT FROM OLD."label"
    THEN
      RAISE EXCEPTION 'fee_policy_versions: economic/identity fields are immutable once status != DRAFT (id=%, status=%)', OLD.id, OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fee_policy_versions_immutability_guard
BEFORE UPDATE ON "fee_policy_versions"
FOR EACH ROW
EXECUTE FUNCTION fee_policy_versions_enforce_immutability();

-- Trigger 2: Escrow's own thin fee-policy scalar snapshot, once set
-- (non-null), is immutable as a group — mirrors the same defense-in-depth
-- reasoning as Trigger 1, scoped to only these three columns (every other
-- Escrow column is legitimately, frequently mutated for unrelated reasons
-- throughout its lifecycle, so this trigger must not touch anything but the
-- fee-snapshot fields).
CREATE OR REPLACE FUNCTION escrows_enforce_fee_snapshot_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."feePolicyVersionId" IS NOT NULL THEN
    IF NEW."feePolicyVersionId" IS DISTINCT FROM OLD."feePolicyVersionId"
      OR NEW."snapshotProtocolFeeRate" IS DISTINCT FROM OLD."snapshotProtocolFeeRate"
      OR NEW."snapshotPayerModel" IS DISTINCT FROM OLD."snapshotPayerModel"
      OR NEW."snapshotEconomicBasis" IS DISTINCT FROM OLD."snapshotEconomicBasis"
    THEN
      RAISE EXCEPTION 'escrows: fee policy snapshot is immutable once set (id=%)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER escrows_fee_snapshot_immutability_guard
BEFORE UPDATE ON "escrows"
FOR EACH ROW
EXECUTE FUNCTION escrows_enforce_fee_snapshot_immutability();
