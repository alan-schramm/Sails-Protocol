-- Missão 11 Fase 7.2 — CTO-frozen decisions (Fase 7.1A recovery):
--
-- (1) DistributionPolicyVersion becomes economically binding at COLLECTED
--     time (FeeCollectionEvidence(CONFIRMED) recorded), never at whenever
--     an allocation worker happens to run. The frozen reference is
--     persisted directly on the CONFIRMED evidence row and is
--     immutable once set — see the new column and trigger below.
--
-- (2) DB-native exclusivity against ambiguous simultaneous active economic
--     policies — at most one PUBLISHED FeePolicyVersion per railScope, at
--     most one PUBLISHED DistributionPolicyVersion globally (it carries
--     no rail/scope column at all — confirmed by direct schema read).
--
-- (3) The four legacy Mechanism-2 bucket-percentage columns on
--     FeePolicyVersion (nodeOperatorPct/treasuryPct/walletRebatePct/
--     arbitratorReservePct) are made NULLABLE — no longer normative
--     inputs for a NEW FeePolicyVersion's economics. Additive and
--     non-destructive: existing historical rows keep their existing
--     values unchanged and fully readable.

-- AlterTable
ALTER TABLE "fee_collection_evidence" ADD COLUMN     "distributionPolicyVersionId" TEXT;

-- AlterTable
ALTER TABLE "fee_policy_versions" ALTER COLUMN "nodeOperatorPct" DROP NOT NULL,
ALTER COLUMN "treasuryPct" DROP NOT NULL,
ALTER COLUMN "walletRebatePct" DROP NOT NULL,
ALTER COLUMN "arbitratorReservePct" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "fee_collection_evidence" ADD CONSTRAINT "fee_collection_evidence_distributionPolicyVersionId_fkey" FOREIGN KEY ("distributionPolicyVersionId") REFERENCES "distribution_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Missão 11 Fase 7.2 §D — the COLLECTED-time freeze is meaningless if it
-- can be silently rewritten afterward. Same "two-layer immutability"
-- pattern already used for fee_policy_versions_enforce_immutability() /
-- escrows_enforce_fee_snapshot_immutability() / EscrowParticipantKey's
-- arbiter guard: a real Postgres trigger, independent of this
-- application entirely — rejects ANY change to this one column,
-- unconditionally, including null -> non-null (no backfill is permitted
-- without a future, explicit, CTO-approved migration that replaces this
-- trigger itself), non-null -> a different id, and non-null -> null.
-- Every OTHER column on this table is untouched by this guard.
CREATE OR REPLACE FUNCTION fee_collection_evidence_enforce_distribution_policy_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."distributionPolicyVersionId" IS DISTINCT FROM OLD."distributionPolicyVersionId" THEN
    RAISE EXCEPTION 'fee_collection_evidence: distributionPolicyVersionId is immutable once a row is created (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fee_collection_evidence_distribution_policy_immutability_guard
BEFORE UPDATE ON "fee_collection_evidence"
FOR EACH ROW
EXECUTE FUNCTION fee_collection_evidence_enforce_distribution_policy_immutability();

-- Missão 11 Fase 7.2 §H — DB-native economic-policy exclusivity, neither
-- representable in schema.prisma's DSL (partial/expression indexes have
-- no Prisma model syntax) nor detectable by `prisma migrate diff` /
-- db:completeness-check as a result — verified permanently by
-- tests/integration/dbNativeInvariants.test.ts's own index-catalog gate.
--
-- (a) FeePolicyVersion: at most one PUBLISHED row per railScope.
CREATE UNIQUE INDEX "fee_policy_versions_single_published_per_rail_key"
ON "fee_policy_versions"("railScope")
WHERE "status" = 'PUBLISHED';

-- (b) DistributionPolicyVersion: at most one PUBLISHED row globally. The
--     `((true))` expression index is the standard Postgres idiom for a
--     global "at most one row matching this partial predicate"
--     constraint — every row indexes to the identical value, so a second
--     PUBLISHED row can never coexist with the first.
CREATE UNIQUE INDEX "distribution_policy_versions_single_published_key"
ON "distribution_policy_versions"((true))
WHERE "status" = 'PUBLISHED';
