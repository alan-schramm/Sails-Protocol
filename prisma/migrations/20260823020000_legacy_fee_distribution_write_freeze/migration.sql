-- Missão 11 Fase 6.5.2 — CTO-authorized single-economic-authority cutover.
--
-- FeeCollectionEvidence(CONFIRMED) -> FeeObligation -> a frozen
-- DistributionPolicyVersion -> EntitlementLedgerEntry is now the ONLY
-- normative source of a future economic entitlement. The two legacy
-- accounting mechanisms below are reclassified HISTORICAL / SUPERSEDED /
-- WRITE-FROZEN:
--
--   Mechanism 1 (RFC-021 Phase 0)  -> fee_distributions
--   Mechanism 2 (Missão 11 Fase 2.2) -> fee_distribution_batches,
--                                       fee_distribution_batch_items
--
-- Fase 6.5.1's audit (read-only) found zero production call sites for
-- Mechanism 2 anywhere in this repository, and exactly one production
-- call site for Mechanism 1 (escrow.service.ts's releaseFunds(), removed
-- in this same phase) — both were already structurally inert in every
-- environment this repository evidences (PROTOCOL_FEE_RATE has never
-- been set above 0). This migration makes that inertness a real,
-- DB-native, permanent guarantee rather than an artifact of application
-- code no longer calling these paths.
--
-- Scope: INSERT, UPDATE, and DELETE are all rejected on all three
-- tables, unconditionally, from this point forward — mirroring
-- entitlement_ledger_entries_enforce_append_only()'s own precedent
-- exactly (Fase 6.3A). No application code path has ever issued an
-- UPDATE or DELETE against any of these three tables (verified by
-- direct read of fee-distribution-repository.ts and escrow-lifecycle.ts
-- — only .create() calls exist), so blocking those two operations
-- changes zero observable behavior; it exists to close the raw-SQL
-- bypass gap explicitly, since "no application call site" and "the
-- database itself cannot be made to do it" are different guarantees.
--
-- Historical rows are never touched: no DELETE, no UPDATE, no
-- migration of existing data. Every SELECT against these three tables
-- continues to work exactly as before — only the write path dies.

CREATE OR REPLACE FUNCTION legacy_fee_distribution_enforce_write_freeze()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'HISTORICAL / SUPERSEDED / WRITE-FROZEN: "%" no longer accepts new writes (Missão 11 Fase 6.5.2). FeeCollectionEvidence(CONFIRMED) -> FeeObligation -> DistributionPolicyVersion -> EntitlementLedgerEntry is the sole economic allocation authority. Existing historical rows in this table remain readable and are never modified by this guard.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fee_distributions_write_freeze_guard
BEFORE INSERT OR UPDATE OR DELETE ON "fee_distributions"
FOR EACH ROW
EXECUTE FUNCTION legacy_fee_distribution_enforce_write_freeze();

CREATE TRIGGER fee_distribution_batches_write_freeze_guard
BEFORE INSERT OR UPDATE OR DELETE ON "fee_distribution_batches"
FOR EACH ROW
EXECUTE FUNCTION legacy_fee_distribution_enforce_write_freeze();

CREATE TRIGGER fee_distribution_batch_items_write_freeze_guard
BEFORE INSERT OR UPDATE OR DELETE ON "fee_distribution_batch_items"
FOR EACH ROW
EXECUTE FUNCTION legacy_fee_distribution_enforce_write_freeze();
