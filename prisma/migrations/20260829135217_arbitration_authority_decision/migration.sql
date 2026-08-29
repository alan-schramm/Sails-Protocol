-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "authorityBuyerBps" INTEGER,
ADD COLUMN     "authorityIssuedAt" TIMESTAMP(3),
ADD COLUMN     "authoritySignature" TEXT;
