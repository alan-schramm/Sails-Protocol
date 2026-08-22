-- AlterTable
ALTER TABLE "escrows" ADD COLUMN     "snapshotFeeCollectionAddress" TEXT,
ADD COLUMN     "snapshotFeeCollectionWaivedPreFunding" BOOLEAN;

-- Missão 11 Fase 4.1 §1/§3/§9 — extends escrows_enforce_fee_snapshot_immutability()
-- (20260821232008_add_fee_policy_versioning_foundation) to also guard the
-- two new columns above, as part of the SAME immutable-once-set group.
-- CREATE OR REPLACE is additive/idempotent — the trigger itself
-- (escrows_fee_snapshot_immutability_guard) does not need to be recreated,
-- only the function body it already points to.
CREATE OR REPLACE FUNCTION escrows_enforce_fee_snapshot_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."feePolicyVersionId" IS NOT NULL THEN
    IF NEW."feePolicyVersionId" IS DISTINCT FROM OLD."feePolicyVersionId"
      OR NEW."snapshotProtocolFeeRate" IS DISTINCT FROM OLD."snapshotProtocolFeeRate"
      OR NEW."snapshotPayerModel" IS DISTINCT FROM OLD."snapshotPayerModel"
      OR NEW."snapshotEconomicBasis" IS DISTINCT FROM OLD."snapshotEconomicBasis"
      OR NEW."snapshotFeeCollectionAddress" IS DISTINCT FROM OLD."snapshotFeeCollectionAddress"
      OR NEW."snapshotFeeCollectionWaivedPreFunding" IS DISTINCT FROM OLD."snapshotFeeCollectionWaivedPreFunding"
    THEN
      RAISE EXCEPTION 'escrows: fee policy snapshot is immutable once set (id=%)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
