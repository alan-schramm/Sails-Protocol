# End-to-end tests (Playwright)

Real browser tests against the real server + real Postgres/Redis — not
mocked. DX audit, 2026-08-10: this suite existed and was wired into
`npm run test:e2e` but had no doc of its own explaining how to run it.

## Run it

```bash
npm run db:local:start && npm run redis:local:start   # once, if not already running
npm run test:e2e
```

`playwright.config.ts`'s own `webServer` entries start the app server
for you and wait for `/health`. `global-setup.ts` additionally checks
Postgres/Redis are actually reachable before any spec runs (`/health`
alone can't tell you that — see its own header comment) and fails
fast with a clear message if not, instead of every spec failing on a
confusing mid-test connection error.

No destructive reset runs between specs (no `TRUNCATE`/`DROP`) — every
spec here is written to be safe to run repeatedly against a shared
local database with leftover state from a previous run.

## What's covered

| Folder | What |
|---|---|
| `flows/` | Full user journeys: P2P trade happy path, dispute flow, concurrency, network reconnection, timeout handling |
| `pages/` | Page Object Model — one file per screen (`home`, `create-trade`, `trade`, `wallet`) |
| `fixtures/` | Shared Playwright fixtures (Sails client, settlement, wallet) |
| `accessibility/` | `@axe-core/playwright` WCAG checks |
| `visual/` | Visual regression |

For the SDK's own (non-browser) integration testing —
`examples/simple-wallet/` is the equivalent dogfooding test at the
SDK level, no UI involved.
