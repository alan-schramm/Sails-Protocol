/**
 * #246 — real PostgreSQL evidence for WDK generation ownership.
 * These tests intentionally use the real Prisma client/database. They prove
 * the database, not a Jest mock, arbitrates concurrent economic ownership.
 */
import { prisma } from '../src/common/database'
import { wdkTransferAttemptRepository } from '../src/modules/open-settlement/wdk-transfer-attempt-repository'

const escrowId = 'wdk-ownership-race-test'
const operationType = 'RELEASE' as const
const destination = '0x00000000000000000000000000000000000000aa'
const amount = '1'

describe('WDK active generation ownership — PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.wdkTransferAttempt.deleteMany({ where: { escrowId } })
  })

  afterAll(async () => {
    await prisma.wdkTransferAttempt.deleteMany({ where: { escrowId } })
  })

  it('allows at most one concurrent first-generation owner', async () => {
    const attempts = await Promise.allSettled([
      wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount }),
      wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount }),
    ])

    expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((x) => x.status === 'rejected')).toHaveLength(1)

    const active = await prisma.wdkTransferAttempt.findMany({
      where: { escrowId, operationType, activeKey: `${escrowId}:${operationType}` },
    })
    expect(active).toHaveLength(1)
  })

  it('allows at most one replacement generation under concurrent retry', async () => {
    const first = await wdkTransferAttemptRepository.create({ escrowId, operationType, destination, amount })
    await wdkTransferAttemptRepository.updateStatus(first.id, 'REVERTED', undefined, ['PREPARED'])

    const replacements = await Promise.allSettled([
      wdkTransferAttemptRepository.replaceActive(first.id, { escrowId, operationType, destination, amount }),
      wdkTransferAttemptRepository.replaceActive(first.id, { escrowId, operationType, destination, amount }),
    ])

    expect(replacements.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(replacements.filter((x) => x.status === 'rejected')).toHaveLength(1)

    const active = await prisma.wdkTransferAttempt.findMany({
      where: { escrowId, operationType, activeKey: `${escrowId}:${operationType}` },
    })
    expect(active).toHaveLength(1)
  })
})
