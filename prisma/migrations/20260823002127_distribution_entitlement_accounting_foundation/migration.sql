-- CreateEnum
CREATE TYPE "DistributionPolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "EntitlementLedgerEntryKind" AS ENUM ('ALLOCATION', 'REVERSAL');

-- CreateTable
CREATE TABLE "distribution_recipients" (
    "id" TEXT NOT NULL,
    "class" TEXT NOT NULL,
    "identityKey" TEXT,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_policy_versions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "DistributionPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "distribution_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_policy_recipients" (
    "id" TEXT NOT NULL,
    "policyVersionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "weightPct" DECIMAL(24,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_policy_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlement_ledger_entries" (
    "id" TEXT NOT NULL,
    "feeObligationId" TEXT NOT NULL,
    "confirmationEvidenceId" TEXT NOT NULL,
    "distributionPolicyVersionId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "asset" "AssetType" NOT NULL,
    "rail" TEXT NOT NULL,
    "kind" "EntitlementLedgerEntryKind" NOT NULL,
    "amount" DECIMAL(48,8) NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distribution_recipients_class_idx" ON "distribution_recipients"("class");

-- CreateIndex
CREATE INDEX "distribution_policy_versions_status_idx" ON "distribution_policy_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_policy_recipients_policyVersionId_recipientId_key" ON "distribution_policy_recipients"("policyVersionId", "recipientId");

-- CreateIndex
CREATE INDEX "entitlement_ledger_entries_feeObligationId_idx" ON "entitlement_ledger_entries"("feeObligationId");

-- CreateIndex
CREATE INDEX "entitlement_ledger_entries_recipientId_asset_rail_idx" ON "entitlement_ledger_entries"("recipientId", "asset", "rail");

-- CreateIndex
CREATE UNIQUE INDEX "entitlement_ledger_entries_confirmationEvidenceId_recipient_key" ON "entitlement_ledger_entries"("confirmationEvidenceId", "recipientId", "kind");

-- AddForeignKey
ALTER TABLE "distribution_policy_recipients" ADD CONSTRAINT "distribution_policy_recipients_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "distribution_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_policy_recipients" ADD CONSTRAINT "distribution_policy_recipients_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "distribution_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_entries_feeObligationId_fkey" FOREIGN KEY ("feeObligationId") REFERENCES "fee_obligations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_entries_confirmationEvidenceId_fkey" FOREIGN KEY ("confirmationEvidenceId") REFERENCES "fee_collection_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_entries_distributionPolicyVersionId_fkey" FOREIGN KEY ("distributionPolicyVersionId") REFERENCES "distribution_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_entries_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "distribution_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "entitlement_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Missão 11 Fase 6.3A — DB-native economic invariants beyond what Prisma's
-- schema DSL can express (no partial unique index, no CHECK, no trigger
-- syntax) — same "reuse the established Mission 11 hardening pattern"
-- discipline as fee_policy_versions_enforce_immutability() (Fase 2.1) and
-- escrow_participant_keys_enforce_arbiter_immutability() (Fase 5.2).

-- (1) At most one Treasury (or any other singleton-class) identity ever —
-- a partial unique index on (class) restricted to rows with a NULL
-- identityKey. A future multi-instance class (e.g. NODE) is unaffected:
-- any number of rows with the SAME class but DISTINCT, non-null
-- identityKey values remain fully permitted.
CREATE UNIQUE INDEX "distribution_recipients_singleton_class_key"
ON "distribution_recipients"("class")
WHERE "identityKey" IS NULL;

-- (2) DistributionPolicyRecipient immutability once the PARENT policy is
-- no longer DRAFT — the economic content (weightPct, which recipient) of
-- a PUBLISHED/RETIRED policy can never be inserted, updated, or deleted,
-- from this application or any raw SQL, mirroring
-- fee_policy_versions_enforce_immutability()'s own two-layer discipline
-- (repository surface + real trigger) exactly, just scoped to a CHILD
-- table since this policy's economic content lives one level down from
-- the parent row (DistributionPolicyVersion itself has no economic
-- columns of its own — see that model's own schema comment).
CREATE OR REPLACE FUNCTION distribution_policy_recipients_enforce_immutability()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "DistributionPolicyStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO parent_status FROM distribution_policy_versions WHERE id = OLD."policyVersionId";
    IF parent_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'distribution_policy_recipients: cannot delete a recipient row once the parent policy is not DRAFT (policyVersionId=%)', OLD."policyVersionId";
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO parent_status FROM distribution_policy_versions WHERE id = OLD."policyVersionId";
    IF parent_status IS DISTINCT FROM 'DRAFT' THEN
      IF NEW."weightPct" IS DISTINCT FROM OLD."weightPct" OR NEW."recipientId" IS DISTINCT FROM OLD."recipientId" OR NEW."policyVersionId" IS DISTINCT FROM OLD."policyVersionId" THEN
        RAISE EXCEPTION 'distribution_policy_recipients: economic fields are immutable once the parent policy is not DRAFT (policyVersionId=%)', OLD."policyVersionId";
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  SELECT status INTO parent_status FROM distribution_policy_versions WHERE id = NEW."policyVersionId";
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'distribution_policy_recipients: cannot add a recipient row once the parent policy is not DRAFT (policyVersionId=%)', NEW."policyVersionId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER distribution_policy_recipients_immutability_guard
BEFORE INSERT OR UPDATE OR DELETE ON "distribution_policy_recipients"
FOR EACH ROW
EXECUTE FUNCTION distribution_policy_recipients_enforce_immutability();

-- (3) entitlement_ledger_entries is append-only, unconditionally — every
-- UPDATE and DELETE is rejected outright, no exception, matching Phase
-- 6.2's own E12/CTO decision #6/#7: a correction is ALWAYS a new,
-- compensating REVERSAL row, never an edit. Stricter than
-- escrow_participant_keys_enforce_arbiter_immutability() (which still
-- allows buyer/seller rows to mutate freely) — here, EVERY row, of
-- EVERY kind, is permanently immutable the instant it is written.
CREATE OR REPLACE FUNCTION entitlement_ledger_entries_enforce_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'entitlement_ledger_entries: append-only — rows may never be deleted (id=%)', OLD.id;
  END IF;
  RAISE EXCEPTION 'entitlement_ledger_entries: append-only — rows may never be updated (id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entitlement_ledger_entries_append_only_guard
BEFORE UPDATE OR DELETE ON "entitlement_ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION entitlement_ledger_entries_enforce_append_only();

-- (4) Sign correctness — an ALLOCATION must be positive, a REVERSAL must
-- be negative. Defense-in-depth: the service layer never accepts a
-- caller-supplied sign either (amount is always +C for a fresh
-- allocation, always -original.amount for a reversal), but a real CHECK
-- constraint means this holds even against a direct, out-of-application
-- SQL write.
ALTER TABLE "entitlement_ledger_entries" ADD CONSTRAINT "entitlement_ledger_entries_amount_sign_check"
CHECK (
  ("kind" = 'ALLOCATION' AND "amount" > 0) OR
  ("kind" = 'REVERSAL' AND "amount" < 0)
);

-- (5) An entitlement can only ever be allocated against a CONFIRMED
-- collection generation, never a BROADCAST/REPLACED/DROPPED/REORGED_OUT/
-- ALTERNATE_SPEND one — Missão 11 Fase 6.3A §G13's own explicit
-- requirement, enforced here as a real DB guarantee (not only an
-- application-level check) since confirmationEvidenceId's own FK type
-- (a bare FeeCollectionEvidence id) cannot express "and it must be of
-- kind CONFIRMED" through a foreign key alone. Also independently
-- verifies the evidence row genuinely belongs to the SAME feeObligationId
-- the entry itself claims (§G14 "no allocation against the wrong
-- FeeObligation/evidence pairing") — two independent foreign keys on the
-- same row cannot express "and they must agree with each other" without
-- this trigger.
CREATE OR REPLACE FUNCTION entitlement_ledger_entries_enforce_confirmed_evidence()
RETURNS TRIGGER AS $$
DECLARE
  evidence_kind "FeeCollectionEvidenceKind";
  evidence_obligation_id TEXT;
BEGIN
  SELECT kind, "feeObligationId" INTO evidence_kind, evidence_obligation_id
  FROM fee_collection_evidence WHERE id = NEW."confirmationEvidenceId";

  IF evidence_kind IS DISTINCT FROM 'CONFIRMED' THEN
    RAISE EXCEPTION 'entitlement_ledger_entries: confirmationEvidenceId must reference a CONFIRMED FeeCollectionEvidence row (id=%, kind=%)', NEW."confirmationEvidenceId", evidence_kind;
  END IF;
  IF evidence_obligation_id IS DISTINCT FROM NEW."feeObligationId" THEN
    RAISE EXCEPTION 'entitlement_ledger_entries: confirmationEvidenceId (%) belongs to feeObligationId=%, not the entry''s own feeObligationId=% — refusing a wrong obligation/evidence pairing', NEW."confirmationEvidenceId", evidence_obligation_id, NEW."feeObligationId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entitlement_ledger_entries_confirmed_evidence_guard
BEFORE INSERT ON "entitlement_ledger_entries"
FOR EACH ROW
EXECUTE FUNCTION entitlement_ledger_entries_enforce_confirmed_evidence();
