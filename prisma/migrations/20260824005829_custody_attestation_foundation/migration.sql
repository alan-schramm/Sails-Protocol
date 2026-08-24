-- CreateEnum
CREATE TYPE "CustodyAttestationAuthority" AS ENUM ('BOOTSTRAP_OPERATOR_ATTESTED', 'CRYPTOGRAPHIC_PROOF');

-- CreateTable
CREATE TABLE "custody_attestations" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "descriptor" JSONB NOT NULL,
    "attestationAuthority" "CustodyAttestationAuthority" NOT NULL DEFAULT 'BOOTSTRAP_OPERATOR_ATTESTED',
    "attestedBy" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custody_attestations_recipientId_asset_attestedAt_idx" ON "custody_attestations"("recipientId", "asset", "attestedAt");

-- AddForeignKey
ALTER TABLE "custody_attestations" ADD CONSTRAINT "custody_attestations_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "distribution_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Missão 11 Fase 7.3.2 §3 (CTO-approved design) — hand-written additions
-- below this line (Prisma's schema DSL cannot express a partial unique
-- index or a trigger; the CREATE TABLE/INDEX/FK above this line are the
-- unmodified `prisma migrate dev --create-only` auto-generated diff).

-- Only one ACTIVE (supersededAt IS NULL) attestation may exist per
-- (recipientId, asset) at a time — the real, DB-enforced "current
-- attestation" invariant, not merely an application convention. Same
-- partial-unique-index pattern as fee_policy_versions_single_published_per_rail_key
-- (migration 20260823182951).
CREATE UNIQUE INDEX "custody_attestations_single_active_per_recipient_asset_key"
ON "custody_attestations" ("recipientId", "asset")
WHERE "supersededAt" IS NULL;

-- Append-only immutability, same two-layer discipline as every other
-- economically-meaningful row in this schema (FeePolicyVersion, the
-- arbiter pubkey commitment): DELETE is rejected outright; UPDATE is
-- rejected for every column except a ONE-TIME supersededAt transition
-- from NULL to a real timestamp. This is what makes "rotation does not
-- rewrite history" a database-enforced fact, not just a repository-layer
-- convention that a raw SQL statement could bypass.
CREATE OR REPLACE FUNCTION custody_attestations_enforce_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'custody_attestations: rows are append-only and may never be deleted (id=%)', OLD."id";
  END IF;

  IF NEW."recipientId" IS DISTINCT FROM OLD."recipientId"
    OR NEW."asset" IS DISTINCT FROM OLD."asset"
    OR NEW."descriptor" IS DISTINCT FROM OLD."descriptor"
    OR NEW."attestationAuthority" IS DISTINCT FROM OLD."attestationAuthority"
    OR NEW."attestedBy" IS DISTINCT FROM OLD."attestedBy"
    OR NEW."attestedAt" IS DISTINCT FROM OLD."attestedAt"
    OR OLD."supersededAt" IS NOT NULL
    OR NEW."supersededAt" IS NULL
  THEN
    RAISE EXCEPTION 'custody_attestations: rows are immutable once written — only a one-time NULL -> timestamp transition of supersededAt is permitted (id=%)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custody_attestations_immutability_guard
BEFORE UPDATE OR DELETE ON "custody_attestations"
FOR EACH ROW
EXECUTE FUNCTION custody_attestations_enforce_immutability();
