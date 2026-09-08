-- CreateEnum
CREATE TYPE "WdkTransferOperationType" AS ENUM ('LOCK', 'RELEASE', 'REFUND', 'SPLIT_BUYER', 'SPLIT_SELLER');

-- CreateEnum
CREATE TYPE "WdkTransferAttemptStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'SUBMISSION_UNKNOWN', 'CONFIRMED', 'REVERTED', 'FAILED_BEFORE_SUBMISSION');

-- CreateTable
CREATE TABLE "wdk_transfer_attempts" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "operationType" "WdkTransferOperationType" NOT NULL,
    "status" "WdkTransferAttemptStatus" NOT NULL DEFAULT 'PREPARED',
    "destination" TEXT NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "chainId" INTEGER,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wdk_transfer_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wdk_transfer_attempts_escrowId_operationType_createdAt_idx" ON "wdk_transfer_attempts"("escrowId", "operationType", "createdAt");

-- AddForeignKey
ALTER TABLE "wdk_transfer_attempts" ADD CONSTRAINT "wdk_transfer_attempts_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
