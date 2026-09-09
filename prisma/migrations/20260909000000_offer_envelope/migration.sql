-- CreateEnum
CREATE TYPE "OfferEnvelopeStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "offer_envelopes" (
    "id" TEXT NOT NULL,
    "logicalOfferId" TEXT NOT NULL,
    "ownerPublicKey" TEXT NOT NULL,
    "asset" "AssetType" NOT NULL,
    "side" "TradeSide" NOT NULL,
    "priceUsd" DECIMAL(24,8) NOT NULL,
    "minAmount" DECIMAL(24,8) NOT NULL,
    "maxAmount" DECIMAL(24,8) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "revisedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "OfferEnvelopeStatus" NOT NULL DEFAULT 'ACTIVE',
    "signature" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moduleId" TEXT NOT NULL DEFAULT 'openliquidity',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',

    CONSTRAINT "offer_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- CTO Gate correction (2026-09-09), Property H: offer identity is the
-- pair (ownerPublicKey, logicalOfferId) — revision uniqueness (and
-- convergence) is scoped to that pair, not to logicalOfferId alone, so
-- two distinct owners can never collide over the same creator-local id.
-- CTO Gate correction (2026-09-09), Property J: `signature` is also
-- part of this key — two DIFFERENT signed envelopes from the SAME owner
-- at the identical (ownerPublicKey, logicalOfferId, revision) is owner
-- equivocation, not a duplicate; both must be durably storable as
-- evidence, never silenced by a uniqueness constraint that only knows
-- about the first three columns.
-- This migration is corrected in place (not superseded by a new one)
-- because PR #100 has not yet merged and this table has never existed
-- in any shared environment.
-- Explicitly named (see prisma/schema.prisma's `map:`) — the
-- auto-generated four-column name exceeds Postgres's 63-byte
-- NAMEDATALEN limit and would otherwise be silently truncated.
CREATE UNIQUE INDEX "offer_envelopes_identity_revision_signature_key" ON "offer_envelopes"("ownerPublicKey", "logicalOfferId", "revision", "signature");

-- CreateIndex
CREATE INDEX "offer_envelopes_logicalOfferId_idx" ON "offer_envelopes"("logicalOfferId");

-- CreateIndex
CREATE INDEX "offer_envelopes_ownerPublicKey_idx" ON "offer_envelopes"("ownerPublicKey");
