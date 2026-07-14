/**
 * Database — Prisma client singleton.
 * Referenced by escrow.service.ts, liquidity.service.ts, and
 * common/events/handlers.ts. Nothing that touches Trade/Escrow/Offer/User
 * works without this existing.
 */
import { PrismaClient } from '@prisma/client'
import { config } from '../../config'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// Reuse the client across hot-reloads in dev (ts-node-dev) instead of
// opening a new connection pool on every file change.
export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: config.isProduction ? ['error', 'warn'] : ['error', 'warn', 'query'],
    datasources: { db: { url: config.database.url } },
  })

if (!config.isProduction) {
  global.__prisma = prisma
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect()
  console.log('[Database] Connected')
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}
