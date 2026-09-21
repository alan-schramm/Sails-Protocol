-- Day-0 #248: preserve the exact actor who authorized/initiated a direct-call
-- economic disposition before any irreversible provider side effect.
ALTER TABLE "escrows" ADD COLUMN "directExecutionTriggeredBy" TEXT;

-- Provenance becomes historical audit truth once frozen. Recovery may read it,
-- but retries/reconciliation may never rewrite or clear it.
CREATE OR REPLACE FUNCTION escrows_enforce_direct_execution_provenance_immutability()
RETURNS trigger AS $$
BEGIN
  IF OLD."directExecutionTriggeredBy" IS NOT NULL
     AND NEW."directExecutionTriggeredBy" IS DISTINCT FROM OLD."directExecutionTriggeredBy" THEN
    RAISE EXCEPTION 'directExecutionTriggeredBy is immutable once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "escrows_direct_execution_provenance_immutable"
BEFORE UPDATE ON "escrows"
FOR EACH ROW
EXECUTE FUNCTION escrows_enforce_direct_execution_provenance_immutability();
