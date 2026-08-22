-- AlterTable
ALTER TABLE "fee_policy_versions" ADD COLUMN     "requiredConfirmations" INTEGER;

-- Missão 11 Fase 5 §3 — extends fee_policy_versions_enforce_immutability()
-- (20260821232008_add_fee_policy_versioning_foundation) so the new
-- confirmation-depth column is protected by the SAME publish-time freeze
-- as every other economic/identity column. CREATE OR REPLACE is
-- additive/idempotent — the trigger itself does not need recreating, only
-- the function body it already points to.
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
      OR NEW."requiredConfirmations" IS DISTINCT FROM OLD."requiredConfirmations"
    THEN
      RAISE EXCEPTION 'fee_policy_versions: economic/identity fields are immutable once status != DRAFT (id=%, status=%)', OLD.id, OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
