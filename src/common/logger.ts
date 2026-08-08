/**
 * Shared pino logger for code that runs outside a Fastify request
 * lifecycle (background services, event handlers, connection setup) —
 * PRODUCTION_READINESS_FIXES.md P0 item 8, closed 2026-08-08.
 *
 * `app.log` (Fastify's own per-request pino instance) is the right
 * logger inside a route handler, but pear.service.ts/event-store.ts/
 * handlers.ts/database/redis connection setup all run before or outside
 * any request — they never had a real logger to reach for, so they
 * fell back to bare `console.*`, with no level filtering, no structured
 * fields, and no way to redact anything. One base instance here (same
 * level/config `app.ts` builds its own Fastify logger from) with a
 * `.child({ module })` per call site, rather than five independent
 * ad-hoc `pino()` instances with their own hardcoded settings.
 */
import pino from 'pino'
import { config } from '../config'

// `config.app?.` — several existing test files mock '../config' with a
// partial shape covering only the fields their own module under test
// reads. Those mocks predate this file and never had a reason to include
// `app`, since nothing they imported used to read it. Falling back here
// keeps this shared, low-level module from hard-crashing at import time
// over a test double's shape rather than a real production config gap.
export const logger = pino({
  level: config.app?.logLevel ?? 'info',
  transport:
    config.app?.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
})

export function childLogger(module: string): pino.Logger {
  return logger.child({ module })
}
