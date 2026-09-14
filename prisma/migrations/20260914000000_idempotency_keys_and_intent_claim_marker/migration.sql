-- CROSS-LAYER-SEMANTIC-CORRECTIVE-1 / -R1 / -R4 (2026-09-13/14) —
-- this migration was overdue: the `idempotency_keys` table (item 37's
-- own mechanism, `src/common/idempotency.ts`) and its `UNKNOWN` status
-- value (R1's own Defect A fix) were never given a real migration file,
-- only ever applied to CI's ephemeral test Postgres via `prisma generate`
-- populating the client's types against `schema.prisma` directly — which
-- silently worked because no integration test ever supplied an
-- idempotency key, so `prisma.idempotencyKey.*` was never actually
-- invoked against a live database. R4's `Intent.idempotencyClaimId`
-- broke that lucky silence: it's written on EVERY `intentEngine.create()`
-- call (many integration tests use this as ordinary fixture setup), so
-- the missing column surfaced immediately as a real CI failure — see
-- `docs/BACKLOG.md` item 37's own R4 record for the corrected account of
-- this. This single migration captures the full accumulated drift.

-- CreateEnum
CREATE TYPE "IdempotencyKeyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'UNKNOWN', 'FAILED');

-- AlterTable
ALTER TABLE "intents" ADD COLUMN     "idempotencyClaimId" TEXT;

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdempotencyKeyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "resultRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_participantId_key_key" ON "idempotency_keys"("scope", "participantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "intents_idempotencyClaimId_key" ON "intents"("idempotencyClaimId");
