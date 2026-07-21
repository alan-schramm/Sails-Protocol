# Load tests

Real Artillery scripts against the real server — not synthetic echo
endpoints. Closes the gap `TECHNICAL_WHITEPAPER.md` section 12 disclosed
("no numbers exist yet for throughput"). See that section for the actual
results and their methodology caveats (single local machine, rate limits
raised for the Intent API run, pre-authenticated session pool for the WS
run) before citing these numbers anywhere.

## Prerequisites

- Local server running (`npm run dev`) against a real local Postgres/Redis
  (`docs/DEVELOPER_JOURNEY.md`'s local setup, or `docker-compose.yml`).
- `npm install --save-dev artillery` (not a `dependencies` entry — this is
  a dev-only tool, not shipped).

## Intent API (`intent-api.yml`)

Each virtual user goes through the real Ed25519 challenge-response auth
flow (`processor.js`'s `setupAuthenticatedUser`) before creating and
cancelling a `TradeIntent`. Run as-is:

```
npx artillery run loadtest/intent-api.yml
```

At the shipped rate-limit defaults (`RATE_LIMIT_AUTH_MAX=10`/min) this
will mostly measure the rate limiter, not the Intent API — which is a
real, correct result (the limiter is enforced), just not what "Intent
API throughput" usually means. To isolate application throughput,
restart the server with those limits raised first:

```
RATE_LIMIT_MAX=100000 RATE_LIMIT_AUTH_MAX=100000 npm run dev
```

## Chat WebSocket (`chat-ws.yml`)

Requires a pre-generated pool of authenticated sessions — Artillery's
`ws` engine only honors a `connect` step as the literal first item in a
scenario's flow (see `processor.js`'s `pickChatSession` doc comment for
where this was found), so per-VU auth can't run as an earlier flow step
the way it does for the `http` engine above.

```
node loadtest/pregenerate-users.js 50
npx artillery run loadtest/chat-ws.yml
```

`users.json` is gitignored — it holds real (if throwaway) session
tokens for whichever local server generated them.
