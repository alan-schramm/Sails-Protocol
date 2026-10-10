/**
 * ST-1 experimental PostgreSQL lock-order probe.
 * RUN ONLY against a disposable PostgreSQL database.
 * Usage: DATABASE_URL=postgresql://... node scripts/st1-postgres-lock-probe.cjs
 * Requires npm install (pg). No production schema mutation.
 *
 * This is a lock-level probe, NOT a substitute for application-level
 * dispute N/N+1, Outcome, signature, economic-effect or restart tests.
 */
'use strict'
const assert = require('node:assert/strict')
const { Client } = require('pg')
const url = process.env.ST1_TEST_DATABASE_URL
if (!url || !/^(postgres|postgresql):\/\//.test(url)) {
  console.error('Set ST1_TEST_DATABASE_URL to an isolated disposable PostgreSQL database')
  process.exit(2)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function connect(label) {
  const c = new Client({ connectionString: url, application_name: 'st1-probe-' + label })
  await c.connect()
  await c.query("SET lock_timeout = '4s'")
  await c.query("SET statement_timeout = '10s'")
  return c
}
async function begin(c) { await c.query('BEGIN') }
async function rollback(c) { await c.query('ROLLBACK').catch(() => {}) }
async function lock(c, key) {
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [key])
}
async function snapshot(c, stage) {
  const { rows } = await c.query(`SELECT pid, locktype, mode, granted, relation::regclass::text AS relation
    FROM pg_locks WHERE pid IN (SELECT pid FROM pg_stat_activity WHERE application_name LIKE 'st1-probe-%')
    ORDER BY pid, locktype, mode`)
  console.log(JSON.stringify({ stage, locks: rows }))
}
async function main() {
  const a = await connect('A'), b = await connect('B'), observer = await connect('observer')
  const dispute = 'economic-disposition:st1-experimental-dispute'
  const escrow = 'st1-experimental-escrow'
  try {
    // D -> E serializes both workers without a cycle.
    await begin(a); await begin(b)
    await lock(a, dispute); await lock(a, escrow)
    const second = (async () => { await lock(b, dispute); await lock(b, escrow); return 'acquired' })()
    await sleep(150); await snapshot(observer, 'D-E: second worker waiting')
    await rollback(a)
    assert.equal(await second, 'acquired')
    await rollback(b)
    console.log(JSON.stringify({ scenario: 'D->E same-order', result: 'PASS' }))

    // Deliberately exercise 40P01 with reversed lock order, proving
    // the probe detects a real PostgreSQL deadlock and transaction abort.
    await begin(a); await begin(b)
    await a.query("SET LOCAL deadlock_timeout = '100ms'").catch(() => {})
    await b.query("SET LOCAL deadlock_timeout = '100ms'").catch(() => {})
    await lock(a, escrow); await lock(b, dispute)
    const waitD = lock(a, dispute).then(() => 'acquired', e => e.code)
    await sleep(80)
    const waitE = lock(b, escrow).then(() => 'acquired', e => e.code)
    const [left, right] = await Promise.all([waitD, waitE])
    assert.ok([left, right].includes('40P01'), 'expected SQLSTATE 40P01')
    console.log(JSON.stringify({ scenario: 'deliberate E->D vs D->E', result: 'EXPECTED_DEADLOCK', sqlstates: [left, right] }))
    await rollback(a); await rollback(b)

    // Bounded retry after 40P01, using the approved D -> E order.
    let attempt = 0, committed = false
    while (!committed && attempt < 3) {
      attempt++
      try {
        await begin(a); await lock(a, dispute); await lock(a, escrow)
        await a.query('COMMIT'); committed = true
      } catch (e) {
        await rollback(a)
        if (e.code !== '40P01' || attempt === 3) throw e
        await sleep(25 * attempt)
      }
    }
    assert.ok(committed)
    console.log(JSON.stringify({ scenario: 'bounded retry', result: 'PASS', attempt }))
  } finally {
    await rollback(a); await rollback(b)
    await Promise.allSettled([a.end(), b.end(), observer.end()])
  }
}
main().catch(e => { console.error(JSON.stringify({ result: 'FAIL', code: e.code, message: e.message })); process.exitCode = 1 })
