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
CREATE UNIQUE INDEX "offer_envelopes_logicalOfferId_revision_key" ON "offer_envelopes"("logicalOfferId", "revision");

-- CreateIndex
CREATE INDEX "offer_envelopes_logicalOfferId_idx" ON "offer_envelopes"("logicalOfferId");

-- CreateIndex
CREATE INDEX "offer_envelopes_ownerPublicKey_idx" ON "offer_envelopes"("ownerPublicKey");
