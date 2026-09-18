-- ADR-004 / #211 — durable execution-commit authorization.
-- Deliberately independent of escrow_pending_transactions so successful
-- pending-row cleanup cannot erase the authority evidence for an economic
-- attempt that already crossed Gate B.
CREATE TABLE "capability_execution_authorizations" (
    "id" TEXT NOT NULL,
    "pendingOperationId" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "grantedTo" TEXT NOT NULL,
    "capabilityName" TEXT NOT NULL,
    "requiredScope" TEXT NOT NULL,
    "constraints" JSONB,
    "operationDigest" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_execution_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "capability_execution_authorizations_pendingOperationId_key"
ON "capability_execution_authorizations"("pendingOperationId");

CREATE INDEX "capability_execution_authorizations_escrowId_idx"
ON "capability_execution_authorizations"("escrowId");

CREATE INDEX "capability_execution_authorizations_grantId_idx"
ON "capability_execution_authorizations"("grantId");
