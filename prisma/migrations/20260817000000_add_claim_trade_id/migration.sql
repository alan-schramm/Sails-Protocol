-- Missão 07.6.1 — schema/migration drift repair (P0 R1 from Missão 07.6).
--
-- `Claim.tradeId` has existed in prisma/schema.prisma since before this
-- repo's very first migration (RFC-007 D6, closed 2026-08-04 — see the
-- model's own header comment) but no migration ever created the column:
-- the 20260807090000_init migration's CREATE TABLE "claims" never
-- included it. Any database built exclusively from this repo's official
-- migration history was therefore missing a column the Prisma schema
-- (and proof.service.ts's assertClaim()) has always assumed exists,
-- causing a real 500 the moment a caller passed a tradeId. Purely
-- additive: nullable column (matches the schema's own `tradeId String?`
-- — not every Claim is trade-related), no default, no backfill, no
-- FK (the schema defines none), no change to any existing row.

-- AlterTable
ALTER TABLE "claims" ADD COLUMN "tradeId" TEXT;

-- CreateIndex
CREATE INDEX "claims_tradeId_idx" ON "claims"("tradeId");
