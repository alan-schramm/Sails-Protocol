-- Missão 07.6.2 — schema/migration drift reconciliation (A + B + C from
-- the CTO-approved Stop Gate #1 report). Same root cause as R1
-- (Claim.tradeId, 20260817000000): three elements were declared in
-- prisma/schema.prisma but never captured by any migration. Generated
-- verbatim from `prisma migrate diff` against a fresh, migration-only
-- database — no hand-authored SQL, no reinterpretation.
--
-- Deliberately excludes Drift D (the three escrowId foreign keys the
-- live database has that schema.prisma no longer declares as
-- relations) — that is a real, separate architectural decision
-- (registered as R3), not a missing-element gap, and stays untouched
-- here per explicit CTO instruction.
--
-- A — PayoutAddress (payout_addresses): real, wired feature
-- (payout-address.service.ts) with no migration until now.
-- B — EvidenceReference (evidence_references): the drift Missão 07.6.1
-- found blocking getTradeEvidenceBundle()'s downstream join.
-- C — Proof.evidenceHash index (RFC-007 D1, ProofRegistry.findDuplicates()):
-- declared in schema, on the already-existing `proofs` table, never
-- migrated — index-only, no functional break today, closed alongside
-- B since both trace to the same RFC-007 era.

-- CreateTable
CREATE TABLE "payout_addresses" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "asset" "AssetType" NOT NULL,
    "address" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL DEFAULT 'opensettlement',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_references" (
    "id" TEXT NOT NULL,
    "proofId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "anchorProof" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payout_addresses_participantId_asset_key" ON "payout_addresses"("participantId", "asset");

-- CreateIndex
CREATE INDEX "evidence_references_proofId_idx" ON "evidence_references"("proofId");

-- CreateIndex
CREATE INDEX "proofs_evidenceHash_idx" ON "proofs"("evidenceHash");

-- AddForeignKey
ALTER TABLE "payout_addresses" ADD CONSTRAINT "payout_addresses_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_references" ADD CONSTRAINT "evidence_references_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "proofs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
