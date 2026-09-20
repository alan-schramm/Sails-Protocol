import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '../database'

type ProjectionTx = Prisma.TransactionClient

/**
 * #253 — apply one semantic event projection at most once.
 *
 * The claim and mutation share one PostgreSQL transaction. If the process
 * dies before commit, neither survives. If commit succeeds, replay collides
 * on the unique semantic identity and becomes a no-op.
 */
export async function applyEventProjectionOnce(
  eventId: string,
  projectionKey: string,
  subjectId: string,
  apply: (tx: ProjectionTx) => Promise<void>,
  client: Pick<PrismaClient, '$transaction'> = prisma,
): Promise<boolean> {
  return client.$transaction(async (tx) => {
    const claimed = await tx.eventProjectionClaim.createMany({
      data: [{ eventId, projectionKey, subjectId }],
      skipDuplicates: true,
    })

    if (claimed.count === 0) return false

    await apply(tx)
    return true
  })
}
