/**
 * #235 R7G-F6B — read-only WDK LOCK authority preflight.
 *
 * Run against a database before deploying the signed-transaction LOCK authority (migration
 * 20261008120000_wdk_signed_lock_authority) and again afterwards. Reads only, inside a READ ONLY
 * transaction; changes nothing, re-signs nothing, broadcasts nothing:
 *
 *   DATABASE_URL=postgres://… npm run wdk:lock-preflight
 *
 * Blocking findings (each needs a human decision before WDK LOCK is enabled):
 *   LEGACY_LOCK_UNRESOLVED    a WDK transfer() LOCK attempt (no signed transaction) that may have moved
 *                             funds — SUBMISSION_UNKNOWN, SUBMITTED, CONFIRMED, or REVERTED under the old
 *                             "status !== 1" rule — on an escrow that is not terminal;
 *   SIGNED_LOCK_UNRESOLVED    a signed LOCK still SIGNED/SUBMITTED, or CONFIRMED under a CREATED escrow
 *                             (reconciliation should converge it; listed so it is not forgotten);
 *   NONCE_CONSUMED_ELSEWHERE  a signed LOCK whose nonce was consumed by another transaction;
 *   HALTED_NONCE_LANE         a treasury nonce lane halted on foreign nonce consumption;
 *   DUPLICATE_TX_HASH         one transaction hash on more than one attempt;
 *   CHAIN_NOT_PINNED          WDK escrows exist but WDK_CHAIN_ID is not set;
 *   TERMINAL_WITHOUT_EVIDENCE a signed LOCK CONFIRMED / REVERTED without finality evidence (#235 R7G-F6B-P:
 *                             migration 20261009120000 refuses to install over it).
 * Informational: WDK_FINALITY_CONFIRMATIONS unset (no WDK escrow will ever be projected FUNDS_LOCKED),
 * nonce lanes, legacy outbound attempts.
 *
 * Prints JSON and exits 1 when a blocking finding exists.
 */
import 'dotenv/config'
import { Client } from 'pg'

export async function runWdkLockPreflight(connectionString: string, env: NodeJS.ProcessEnv = process.env) {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const q = async <T>(sql: string) => (await client.query(sql)).rows as T[]
    const legacyLocks = await q<{ id: string; escrowId: string; status: string; txHash: string | null; escrowStatus: string }>(`
      SELECT a.id, a."escrowId", a.status::text AS status, a."txHash", e.status::text AS "escrowStatus"
      FROM wdk_transfer_attempts a JOIN escrows e ON e.id = a."escrowId"
      WHERE a."operationType" = 'LOCK' AND a.authority::text = 'LEGACY_TRANSFER_V0'
        AND a.status::text IN ('SUBMISSION_UNKNOWN', 'SUBMITTED', 'CONFIRMED', 'REVERTED')
        AND e.status::text NOT IN ('COMPLETED', 'REFUNDED', 'SPLIT')`)
    const signedUnresolved = await q<{ id: string; escrowId: string; status: string; txHash: string; nonce: string; escrowStatus: string }>(`
      SELECT a.id, a."escrowId", a.status::text AS status, a."txHash", a.nonce::text AS nonce, e.status::text AS "escrowStatus"
      FROM wdk_transfer_attempts a JOIN escrows e ON e.id = a."escrowId"
      WHERE a."operationType" = 'LOCK' AND a.authority::text = 'SIGNED_RAW_V1'
        AND (a.status::text IN ('SIGNED', 'SUBMITTED', 'NONCE_CONSUMED_ELSEWHERE') OR (a.status::text = 'CONFIRMED' AND e.status::text = 'CREATED'))`)
    const lanes = await q<{ chainId: number; account: string; nextNonce: string; haltedAt: Date | null; haltedReason: string | null }>(
      `SELECT "chainId", account, "nextNonce"::text AS "nextNonce", "haltedAt", "haltedReason" FROM wdk_nonce_lanes`)
    const duplicateHashes = await q<{ txHash: string; attempts: string }>(`
      SELECT "txHash", string_agg(id, ',' ORDER BY id) AS attempts FROM wdk_transfer_attempts
      WHERE "txHash" IS NOT NULL GROUP BY "txHash" HAVING count(*) > 1`)
    const legacyOutbound = await q<{ status: string; n: number }>(`
      SELECT status::text AS status, count(*)::int AS n FROM wdk_transfer_attempts
      WHERE "operationType" <> 'LOCK' AND status::text IN ('SUBMISSION_UNKNOWN', 'SUBMITTED') GROUP BY 1`)
    const [{ n: wdkEscrows }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM escrows WHERE type = 'WDK_USDT_EVM'`)
    const hasEvidence = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'wdk_transfer_attempts' AND column_name = 'receiptBlockNumber'`)).rowCount === 1
    const terminalWithoutEvidence = await q<{ id: string; escrowId: string; status: string; txHash: string }>(`
      SELECT id, "escrowId", status::text AS status, "txHash" FROM wdk_transfer_attempts
      WHERE authority::text = 'SIGNED_RAW_V1' AND status::text IN ('CONFIRMED', 'REVERTED')
      ${hasEvidence ? 'AND "receiptBlockNumber" IS NULL' : ''}`)
    await client.query('ROLLBACK')

    const blocking: Array<{ kind: string; detail: unknown }> = []
    for (const a of legacyLocks) blocking.push({ kind: 'LEGACY_LOCK_UNRESOLVED', detail: a })
    for (const a of signedUnresolved) blocking.push({ kind: a.status === 'NONCE_CONSUMED_ELSEWHERE' ? 'NONCE_CONSUMED_ELSEWHERE' : 'SIGNED_LOCK_UNRESOLVED', detail: a })
    for (const l of lanes.filter((l) => l.haltedAt)) blocking.push({ kind: 'HALTED_NONCE_LANE', detail: l })
    for (const d of duplicateHashes) blocking.push({ kind: 'DUPLICATE_TX_HASH', detail: d })
    const chainIdSet = (env.WDK_CHAIN_ID ?? '').trim() !== ''
    if (wdkEscrows > 0 && !chainIdSet) blocking.push({ kind: 'CHAIN_NOT_PINNED', detail: { wdkEscrows } })
    for (const a of terminalWithoutEvidence) blocking.push({ kind: 'TERMINAL_WITHOUT_EVIDENCE', detail: a })
    return {
      wdkEscrows,
      config: { WDK_CHAIN_ID: chainIdSet ? env.WDK_CHAIN_ID : null, WDK_FINALITY_CONFIRMATIONS: (env.WDK_FINALITY_CONFIRMATIONS ?? '').trim() || null },
      finalityPolicyConfigured: (env.WDK_FINALITY_CONFIRMATIONS ?? '').trim() !== '',
      nonceLanes: lanes,
      legacyOutboundUnresolved: legacyOutbound,
      blocking: blocking.length,
      findings: blocking,
    }
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is required')
    process.exit(2)
  }
  runWdkLockPreflight(url).then((report) => {
    console.log(JSON.stringify(report, null, 2))
    process.exit(report.blocking > 0 ? 1 : 0)
  }, (err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(2)
  })
}
