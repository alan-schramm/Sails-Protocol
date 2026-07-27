/**
 * Intentionally a no-op. global-setup.ts's Postgres/Redis connections
 * are already closed in their own `finally` blocks — there's no
 * suite-wide connection or on-chain state this needs to release (see
 * settlement.fixture.ts's header for why there's no chain to reset).
 * Kept as an explicit file, matching the brief's ask for a teardown
 * hook, rather than silently omitting one a future reader might expect
 * to find.
 */
export default async function globalTeardown(): Promise<void> {}
