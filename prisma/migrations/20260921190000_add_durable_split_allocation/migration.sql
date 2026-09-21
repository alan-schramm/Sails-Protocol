-- Day-0 #247: preserve the economic allocation that authorized a SPLIT
-- before any settlement provider side effect can occur.
ALTER TABLE "escrows" ADD COLUMN "splitBuyerBps" INTEGER;

ALTER TABLE "escrows"
  ADD CONSTRAINT "escrows_splitBuyerBps_range_check"
  CHECK ("splitBuyerBps" IS NULL OR ("splitBuyerBps" > 0 AND "splitBuyerBps" < 10000));

-- Once frozen, the allocation is historical economic truth. It may not be
-- changed or cleared by application code, retries, or later recovery.
CREATE OR REPLACE FUNCTION escrows_enforce_split_allocation_immutability()
RETURNS trigger AS $$
BEGIN
  IF OLD."splitBuyerBps" IS NOT NULL
     AND NEW."splitBuyerBps" IS DISTINCT FROM OLD."splitBuyerBps" THEN
    RAISE EXCEPTION 'splitBuyerBps is immutable once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "escrows_split_allocation_immutable"
BEFORE UPDATE ON "escrows"
FOR EACH ROW
EXECUTE FUNCTION escrows_enforce_split_allocation_immutability();
