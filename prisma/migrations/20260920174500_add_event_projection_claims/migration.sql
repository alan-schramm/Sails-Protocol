-- #253 — durable idempotency identity for event-derived projections.
--
-- The unique identity is semantic rather than handler-global so independent
-- module projections can converge/retry without a cross-module transaction.
CREATE TABLE "event_projection_claims" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "projectionKey" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_projection_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_projection_claim_identity_key"
ON "event_projection_claims"("eventId", "projectionKey", "subjectId");

CREATE INDEX "event_projection_claims_eventId_idx"
ON "event_projection_claims"("eventId");

CREATE INDEX "event_projection_claims_projectionKey_subjectId_idx"
ON "event_projection_claims"("projectionKey", "subjectId");
