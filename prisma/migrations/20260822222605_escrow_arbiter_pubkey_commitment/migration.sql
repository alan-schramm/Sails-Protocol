-- Missão 11 Fase 5.2 §3 — DB-native immutability for the arbiter public-key
-- commitment (EscrowParticipantKey role='arbiter'), matching the same
-- Mission 10/11 hardening model as fee_policy_versions_enforce_immutability()
-- / escrows_enforce_fee_snapshot_immutability() (20260821232008). No new
-- column: this reuses EscrowParticipantKey's existing schema (see the
-- model's own updated comment in schema.prisma) — buyer/seller rows remain
-- freely upsertable/deletable exactly as before this migration; ONLY a row
-- whose OLD.role = 'arbiter' is protected, on both UPDATE and DELETE, so a
-- once-persisted commitment cannot be silently mutated OR removed-then-
-- recreated as an equivalent bypass.
CREATE OR REPLACE FUNCTION escrow_participant_keys_enforce_arbiter_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."role" = 'arbiter' THEN
      RAISE EXCEPTION 'escrow_participant_keys: the arbiter public-key commitment is immutable and may not be deleted (escrowId=%)', OLD."escrowId";
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."role" = 'arbiter' THEN
    IF NEW."pubkey" IS DISTINCT FROM OLD."pubkey"
      OR NEW."participantId" IS DISTINCT FROM OLD."participantId"
      OR NEW."role" IS DISTINCT FROM OLD."role"
    THEN
      RAISE EXCEPTION 'escrow_participant_keys: the arbiter public-key commitment is immutable once written (escrowId=%)', OLD."escrowId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER escrow_participant_keys_arbiter_immutability_guard
BEFORE UPDATE OR DELETE ON "escrow_participant_keys"
FOR EACH ROW
EXECUTE FUNCTION escrow_participant_keys_enforce_arbiter_immutability();
