-- #246 — DB-enforced ownership for WDK economic submission generations.
-- PostgreSQL UNIQUE permits multiple NULLs intentionally: historical
-- generations relinquish ownership while one current generation owns the
-- deterministic escrowId:operationType key.
ALTER TABLE "WdkTransferAttempt"
ADD COLUMN "activeKey" TEXT;

CREATE UNIQUE INDEX "WdkTransferAttempt_activeKey_key"
ON "WdkTransferAttempt"("activeKey");

-- Backfill exactly the newest generation per logical operation.
WITH ranked AS (
  SELECT "id",
    ROW_NUMBER() OVER (
      PARTITION BY "escrowId", "operationType"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "WdkTransferAttempt"
)
UPDATE "WdkTransferAttempt" AS w
SET "activeKey" = w."escrowId" || ':' || w."operationType"::text
FROM ranked r
WHERE w."id" = r."id" AND r.rn = 1;
