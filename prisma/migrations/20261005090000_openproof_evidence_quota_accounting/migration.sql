-- Issue #267 — OpenProof Evidence Upload Policy V1.
-- Persist the actual authorized uploader and decoded media byte size so
-- PostgreSQL, not object storage, is the durable cumulative quota ledger.
--
-- Existing rows predate durable uploader/size accounting and cannot be
-- reconstructed safely from Proof.submittedBy or provider metadata.
-- Day-0 migration therefore fails closed if evidence already exists rather
-- than fabricating quota provenance. A production operator with legacy rows
-- must explicitly reconcile/backfill them before applying this migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM evidence_references LIMIT 1) THEN
    RAISE EXCEPTION
      'Issue #267 migration requires explicit reconciliation of existing evidence_references before durable uploader/size quota accounting can be enabled';
  END IF;
END $$;

ALTER TABLE evidence_references
  ADD COLUMN "submittedBy" TEXT NOT NULL,
  ADD COLUMN "sizeBytes" INTEGER NOT NULL;

ALTER TABLE evidence_references
  ADD CONSTRAINT evidence_references_size_bytes_positive
  CHECK ("sizeBytes" > 0);

CREATE INDEX evidence_references_proofId_submittedBy_idx
  ON evidence_references("proofId", "submittedBy");
