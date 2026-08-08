-- CreateIndex
CREATE INDEX "disputes_arbiterId_status_idx" ON "disputes"("arbiterId", "status");

-- CreateIndex
CREATE INDEX "users_reputationScore_idx" ON "users"("reputationScore");
