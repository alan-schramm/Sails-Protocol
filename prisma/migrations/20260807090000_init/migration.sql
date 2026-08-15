-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('BTC', 'USDT_ERC20', 'USDT_TRC20', 'USDT_LIQUID', 'USDT_LIGHTNING', 'LN_BTC', 'LIQUID_BTC', 'SPARK', 'STACKS', 'RSK_BTC');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EscrowType" AS ENUM ('MULTISIG', 'LIGHTNING_HODL', 'LIQUID_COVENANT', 'WDK_USDT_EVM', 'SAFE_GUARD_EVM', 'MOCK');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('CREATED', 'FUNDS_LOCKED', 'PAYMENT_PENDING', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'SPLIT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'TED', 'BANK_TRANSFER', 'CRYPTO_DIRECT', 'LIGHTNING_DIRECT', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPENED', 'EVIDENCE_SUBMITTED', 'ARBITRATED', 'RESOLVED', 'APPEALED', 'AUTO_PROPOSED');

-- CreateEnum
CREATE TYPE "DisputeRuling" AS ENUM ('RELEASE', 'REFUND', 'SPLIT');

-- CreateEnum
CREATE TYPE "VerificationVerdict" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "displayName" TEXT,
    "peerId" TEXT,
    "reputationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "disputeCount" INTEGER NOT NULL DEFAULT 0,
    "totalVolumeBtc" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "cumulativeFeesObserved" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "moduleId" TEXT NOT NULL DEFAULT 'openidentity',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" "AssetType" NOT NULL,
    "side" "TradeSide" NOT NULL,
    "priceUsd" DECIMAL(24,8) NOT NULL,
    "priceBrl" DECIMAL(24,8),
    "minAmount" DECIMAL(24,8) NOT NULL,
    "maxAmount" DECIMAL(24,8) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentDetails" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "network" TEXT,
    "description" TEXT,
    "requiresKyc" BOOLEAN NOT NULL DEFAULT false,
    "moduleId" TEXT NOT NULL DEFAULT 'openliquidity',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "intentType" TEXT,
    "intentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "asset" "AssetType" NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "priceUsd" DECIMAL(24,8) NOT NULL,
    "totalUsd" DECIMAL(24,8) NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "escrowId" TEXT,
    "network" TEXT,
    "moduleId" TEXT NOT NULL DEFAULT 'openp2p',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "intentType" TEXT NOT NULL DEFAULT 'TradeIntent',
    "intentId" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrows" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "type" "EscrowType" NOT NULL DEFAULT 'MOCK',
    "status" "EscrowStatus" NOT NULL DEFAULT 'CREATED',
    "lockedAmount" DECIMAL(24,8) NOT NULL,
    "asset" "AssetType" NOT NULL,
    "network" TEXT,
    "multisigAddr" TEXT,
    "redeemScript" TEXT,
    "txLockId" TEXT,
    "txReleaseId" TEXT,
    "timelockHours" INTEGER NOT NULL DEFAULT 24,
    "feeCharged" DECIMAL(24,8),
    "moduleId" TEXT NOT NULL DEFAULT 'opensettlement',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "lockedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_distributions" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "totalFee" DECIMAL(24,8) NOT NULL,
    "asset" "AssetType" NOT NULL,
    "nodeOperatorShare" DECIMAL(24,8) NOT NULL,
    "treasuryShare" DECIMAL(24,8) NOT NULL,
    "walletRebateShare" DECIMAL(24,8) NOT NULL,
    "arbitratorReserveShare" DECIMAL(24,8) NOT NULL,
    "moduleId" TEXT NOT NULL DEFAULT 'opensettlement',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "arbiterId" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPENED',
    "ruling" "DisputeRuling",
    "resolvedAt" TIMESTAMP(3),
    "appealRound" INTEGER NOT NULL DEFAULT 0,
    "previousRuling" "DisputeRuling",
    "previousArbiterId" TEXT,
    "autoResolutionRecommendation" "DisputeRuling",
    "autoResolutionConfidence" DOUBLE PRECISION,
    "autoResolutionReasoning" TEXT,
    "autoResolutionDeadline" TIMESTAMP(3),
    "autoResolved" BOOLEAN NOT NULL DEFAULT false,
    "moduleId" TEXT NOT NULL DEFAULT 'opensettlement',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_appeal_fees" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "appealRound" INTEGER NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "amount" DECIMAL(24,8) NOT NULL,
    "asset" "AssetType" NOT NULL,
    "outcome" TEXT,
    "settledAt" TIMESTAMP(3),
    "moduleId" TEXT NOT NULL DEFAULT 'opensettlement',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_appeal_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arbiter_profiles" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "monetaryCollateral" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "collateralAsset" "AssetType",
    "arbiterReputation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rulingsTotal" INTEGER NOT NULL DEFAULT 0,
    "rulingsOverturned" INTEGER NOT NULL DEFAULT 0,
    "cumulativeFeesObserved" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slashedAt" TIMESTAMP(3),
    "moduleId" TEXT NOT NULL DEFAULT 'opensettlement',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arbiter_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountHash" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "firstUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedTrades" INTEGER NOT NULL DEFAULT 0,
    "chargebacks" INTEGER NOT NULL DEFAULT 0,
    "moduleId" TEXT NOT NULL DEFAULT 'opensettlement',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouches" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "voucheeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "burnedAt" TIMESTAMP(3),
    "moduleId" TEXT NOT NULL DEFAULT 'openreputation',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',

    CONSTRAINT "vouches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_events" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "fromStatus" "EscrowStatus" NOT NULL,
    "toStatus" "EscrowStatus" NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intents" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "participantId" TEXT NOT NULL,
    "agentId" TEXT,
    "parentIntentId" TEXT,
    "moduleId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "fulfilledBy" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intent_events" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryHash" TEXT,
    "prevHash" TEXT,

    CONSTRAINT "intent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "msgType" TEXT NOT NULL DEFAULT 'TEXT',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_events" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "moduleId" TEXT NOT NULL DEFAULT 'openreputation',
    "protocolVersion" TEXT NOT NULL DEFAULT '0.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_grants" (
    "id" TEXT NOT NULL,
    "grantedTo" TEXT NOT NULL,
    "capabilityName" TEXT NOT NULL,
    "scope" TEXT[] NOT NULL,
    "constraints" JSONB,
    "issuedBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_release_approvals" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_release_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_participant_keys" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_participant_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_pending_transactions" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "toAddressSecondary" TEXT,
    "unsignedPsbtBase64" TEXT NOT NULL,
    "requiredSigners" TEXT[] NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_pending_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_transaction_signatures" (
    "id" TEXT NOT NULL,
    "pendingTxId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "signedPsbtBase64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escrow_transaction_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "claimedBy" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "assertion" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "proofId" TEXT NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "verdict" "VerificationVerdict" NOT NULL,
    "reason" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_publicKey_key" ON "users"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_peerId_key" ON "users"("peerId");

-- CreateIndex
CREATE INDEX "offers_asset_side_status_idx" ON "offers"("asset", "side", "status");

-- CreateIndex
CREATE INDEX "offers_userId_idx" ON "offers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "trades_escrowId_key" ON "trades"("escrowId");

-- CreateIndex
CREATE INDEX "trades_buyerId_idx" ON "trades"("buyerId");

-- CreateIndex
CREATE INDEX "trades_sellerId_idx" ON "trades"("sellerId");

-- CreateIndex
CREATE INDEX "trades_status_idx" ON "trades"("status");

-- CreateIndex
CREATE UNIQUE INDEX "escrows_tradeId_key" ON "escrows"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_distributions_escrowId_key" ON "fee_distributions"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_tradeId_key" ON "disputes"("tradeId");

-- CreateIndex
CREATE INDEX "disputes_escrowId_idx" ON "disputes"("escrowId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_arbiterId_status_idx" ON "disputes"("arbiterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_appeal_fees_disputeId_appealRound_key" ON "dispute_appeal_fees"("disputeId", "appealRound");

-- CreateIndex
CREATE UNIQUE INDEX "arbiter_profiles_participantId_key" ON "arbiter_profiles"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_accountHash_key" ON "payment_accounts"("accountHash");

-- CreateIndex
CREATE INDEX "payment_accounts_ownerId_idx" ON "payment_accounts"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "vouches_voucherId_voucheeId_key" ON "vouches"("voucherId", "voucheeId");

-- CreateIndex
CREATE INDEX "vouches_voucheeId_idx" ON "vouches"("voucheeId");

-- CreateIndex
CREATE INDEX "intents_participantId_idx" ON "intents"("participantId");

-- CreateIndex
CREATE INDEX "intents_status_idx" ON "intents"("status");

-- CreateIndex
CREATE INDEX "intent_events_intentId_idx" ON "intent_events"("intentId");

-- CreateIndex
CREATE INDEX "messages_tradeId_idx" ON "messages"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "reputation_events_tradeId_raterId_key" ON "reputation_events"("tradeId", "raterId");

-- CreateIndex
CREATE INDEX "capability_grants_grantedTo_idx" ON "capability_grants"("grantedTo");

-- CreateIndex
CREATE INDEX "capability_grants_capabilityName_idx" ON "capability_grants"("capabilityName");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_release_approvals_escrowId_approverId_key" ON "escrow_release_approvals"("escrowId", "approverId");

-- CreateIndex
CREATE INDEX "escrow_release_approvals_escrowId_idx" ON "escrow_release_approvals"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_participant_keys_escrowId_role_key" ON "escrow_participant_keys"("escrowId", "role");

-- CreateIndex
CREATE INDEX "escrow_participant_keys_escrowId_idx" ON "escrow_participant_keys"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_pending_transactions_escrowId_key" ON "escrow_pending_transactions"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_transaction_signatures_pendingTxId_participantId_key" ON "escrow_transaction_signatures"("pendingTxId", "participantId");

-- CreateIndex
CREATE INDEX "escrow_transaction_signatures_pendingTxId_idx" ON "escrow_transaction_signatures"("pendingTxId");

-- CreateIndex
CREATE INDEX "claims_claimedBy_idx" ON "claims"("claimedBy");

-- CreateIndex
CREATE INDEX "proofs_claimId_idx" ON "proofs"("claimId");

-- CreateIndex
CREATE INDEX "verifications_proofId_idx" ON "verifications"("proofId");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_distributions" ADD CONSTRAINT "fee_distributions_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_appeal_fees" ADD CONSTRAINT "dispute_appeal_fees_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arbiter_profiles" ADD CONSTRAINT "arbiter_profiles_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouches" ADD CONSTRAINT "vouches_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouches" ADD CONSTRAINT "vouches_voucheeId_fkey" FOREIGN KEY ("voucheeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_events" ADD CONSTRAINT "escrow_events_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intent_events" ADD CONSTRAINT "intent_events_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_ratedId_fkey" FOREIGN KEY ("ratedId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_release_approvals" ADD CONSTRAINT "escrow_release_approvals_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_participant_keys" ADD CONSTRAINT "escrow_participant_keys_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_pending_transactions" ADD CONSTRAINT "escrow_pending_transactions_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_transaction_signatures" ADD CONSTRAINT "escrow_transaction_signatures_pendingTxId_fkey" FOREIGN KEY ("pendingTxId") REFERENCES "escrow_pending_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "proofs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
