// tests/postgresTestHarness.test.ts
//
// Missão 11 Fase 6.3B.1 §I/§A10 — adversarial, connection-free proof of
// the fail-closed test-database safety guard
// (tests/integration/postgresTestHarness.ts's assertTestDatabaseAuthorized()).
// Deliberately never opens a real network connection — every case here is
// pure parsing/env-var logic, exercised directly against rejected and
// accepted targets. No external/production database is ever touched.

import { assertTestDatabaseAuthorized, TestDatabaseSafetyError } from './integration/postgresTestHarness'

const AUTH_VAR = 'SAILS_INTEGRATION_TEST_DB_CONFIRMED'
const AUTH_VALUE = 'yes-i-am-sure'
const SAFE_URL = 'postgresql://postgres:hunter2@localhost:5432/sails_protocol'

describe('assertTestDatabaseAuthorized() — fail-closed test-database guard', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects when the explicit authorization marker is missing entirely', () => {
    delete process.env[AUTH_VAR]
    expect(() => assertTestDatabaseAuthorized(SAFE_URL)).toThrow(TestDatabaseSafetyError)
    expect(() => assertTestDatabaseAuthorized(SAFE_URL)).toThrow(/authorization is missing/)
  })

  it('rejects when the marker is set to a falsy/wrong value (e.g. "1" or "true") — not just any truthy string', () => {
    process.env[AUTH_VAR] = '1'
    expect(() => assertTestDatabaseAuthorized(SAFE_URL)).toThrow(TestDatabaseSafetyError)
    process.env[AUTH_VAR] = 'true'
    expect(() => assertTestDatabaseAuthorized(SAFE_URL)).toThrow(TestDatabaseSafetyError)
  })

  it('rejects a malformed connection URL even when authorization is present', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    expect(() => assertTestDatabaseAuthorized('not-a-url-at-all')).toThrow(TestDatabaseSafetyError)
    expect(() => assertTestDatabaseAuthorized('not-a-url-at-all')).toThrow(/not a valid connection URL/)
  })

  it('rejects a suspicious (non-approved) host even when authorization is present and the URL is well-formed', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@some-remote-host.example.com:5432/sails_protocol')).toThrow(
      TestDatabaseSafetyError,
    )
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@some-remote-host.example.com:5432/sails_protocol')).toThrow(
      /not an approved test-database host/,
    )
  })

  it('rejects a database name that looks like production, even on an otherwise-approved host', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@localhost:5432/sails_production')).toThrow(TestDatabaseSafetyError)
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@localhost:5432/sails_production')).toThrow(/unsafe for tests/)
  })

  it('rejects an empty database name', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@localhost:5432/')).toThrow(TestDatabaseSafetyError)
  })

  it('accepts a valid local test configuration: marker set, localhost, non-production db name', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    expect(() => assertTestDatabaseAuthorized(SAFE_URL)).not.toThrow()
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@127.0.0.1:5432/sails_protocol')).not.toThrow()
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@[::1]:5432/sails_protocol')).not.toThrow()
  })

  it('accepts a valid CI-style configuration: marker set, an explicitly operator-allowlisted service host', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    process.env.SAILS_TEST_DB_EXTRA_HOSTS = 'postgres,ci-postgres-service'
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@postgres:5432/sails_protocol')).not.toThrow()
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@ci-postgres-service:5432/sails_protocol')).not.toThrow()
  })

  it('still rejects a non-allowlisted host even when SAILS_TEST_DB_EXTRA_HOSTS is set to something else', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    process.env.SAILS_TEST_DB_EXTRA_HOSTS = 'ci-postgres-service'
    expect(() => assertTestDatabaseAuthorized('postgresql://postgres:pw@some-other-host:5432/sails_protocol')).toThrow(TestDatabaseSafetyError)
  })

  it('never includes the raw password in any thrown error message (host-rejection case)', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    const secret = 'super-secret-password-should-never-leak'
    try {
      assertTestDatabaseAuthorized(`postgresql://postgres:${secret}@untrusted-host.example.com:5432/sails_protocol`)
      throw new Error('expected assertTestDatabaseAuthorized to throw')
    } catch (err) {
      expect(String((err as Error).message)).not.toContain(secret)
      expect(String((err as Error).message)).toContain('***')
    }
  })

  it('never includes the raw password in any thrown error message (unsafe-db-name case)', () => {
    process.env[AUTH_VAR] = AUTH_VALUE
    const secret = 'another-secret-value'
    try {
      assertTestDatabaseAuthorized(`postgresql://postgres:${secret}@localhost:5432/production_db`)
      throw new Error('expected assertTestDatabaseAuthorized to throw')
    } catch (err) {
      expect(String((err as Error).message)).not.toContain(secret)
    }
  })
})
