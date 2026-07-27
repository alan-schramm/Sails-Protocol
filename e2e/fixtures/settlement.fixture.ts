import { test as base } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Named `settlement.fixture.ts`, not the brief's `blockchain.fixture.ts`
 * — there is no on-chain blockchain to mine blocks or set balances on
 * here. Real settlement is `MockSettlementProvider`/`WdkSettlementProvider`
 * (config-flag gated) writing Trade/Escrow rows to Postgres, and
 * "wallets" are Ed25519 keypairs (see wallet.fixture.ts), not funded
 * on-chain accounts. Confirmed by direct research before naming this
 * file (per user's confirmed direction: use the real model, not
 * mineBlock/setBalance/advanceTime).
 *
 * The one thing this DOES provide that no HTTP call can reach: direct
 * Postgres access, needed by timeout-flow.spec.ts to seed an
 * Intent.expiresAt in the past. As of this writing, nothing in this
 * codebase's real request paths ever sets that column (confirmed by
 * grep across src/ — only ever read, never written outside this
 * fixture and the engine's own internal EXPIRED transition) — so a
 * real E2E test of the CISO Byzantine "Free Option" timeout rule
 * (core/state-machine.ts's isExpired()) has no way to reach an expired
 * Intent through the UI or API alone.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/sails_protocol'

export interface SettlementFixtures {
  /** Direct Prisma client against the real local Postgres — same connection string src/common/database/index.ts uses, a separate instance (this is a Playwright test file, not the app's ts-node-dev runtime). */
  db: PrismaClient
}

export const test = base.extend<SettlementFixtures>({
  db: async ({}, use) => {
    const adapter = new PrismaPg({ connectionString: DATABASE_URL })
    const prisma = new PrismaClient({ adapter })
    await use(prisma)
    await prisma.$disconnect()
  },
})

export { expect } from '@playwright/test'
