-- AlterTable
ALTER TABLE "escrow_pending_transactions" ADD COLUMN     "feeCollectionSats" INTEGER,
ADD COLUMN     "feeCollectionWaived" BOOLEAN;
