# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within Sails Protocol, please send an email to [security@sailsprotocol.io](mailto:security@sailsprotocol.io). All security vulnerabilities will be promptly addressed.

**Please do not report security vulnerabilities through public GitHub issues.**

## Scope

This security policy applies to:

- **Backend API** (`@sails/api`) — Fastify server, authentication, escrow logic
- **SDK** (`@satsails/p2p-trading-sdk`) — Client library for interacting with the API
- **React SDK** (`@satsails/sdk-react`) — React hooks and components

## Out of Scope

- Third-party dependencies (report upstream)
- Social engineering attacks
- Physical attacks
- Denial of service attacks

## Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Fix timeline:** Depends on severity (critical: 24h, high: 1 week, medium: 1 month)

## Security Best Practices

### For Contributors

1. **Never commit secrets** — API keys, private keys, passwords, or tokens
2. **Use environment variables** — All sensitive configuration via `.env`
3. **Validate all inputs** — Zod schemas for all API endpoints
4. **Sanitize outputs** — No XSS, no injection
5. **Rate limiting** — All public endpoints rate-limited
6. **HTTPS only** — No plaintext HTTP in production

### For Users

1. **Never share your private key** — Not even with support; it's the only credential that exists, there's no password to fall back on
2. **Verify URLs** — Only use official domains
3. **Report suspicious activity** — Contact security@sailsprotocol.io

## Authentication

<!-- Corrected 2026-08-15 — this section previously described JWT/refresh
     tokens, which never existed in this codebase; found stale while
     verifying claims against the real implementation before adding
     automated CI scanning below. -->
- Ed25519 challenge-response — the client signs a server-issued nonce with
  their own keypair; no password ever exists to authenticate with
- Session token (a random 32-byte value, not a JWT) issued on successful
  verification, stored server-side in Redis, default 1-hour TTL
- No logout/session-revocation endpoint exists yet — a session ends only
  by expiring; tracked as a real gap, not implemented

### Long-lived credentials inventory

<!-- Added 2026-08-15 — audited every long-lived secret in this codebase
     for accidental exposure before writing this section, not assumed. -->
- `ARKADE_SEED`, `WDK_SEED_PHRASE` — operator-held master secrets
  (`.env.example`), used only server-side to derive/construct signing
  material; confirmed no route ever returns either value or anything
  derived directly from them (public keys derived from them are the only
  thing ever exposed, by design). Neither has a rotation path — rotating
  either changes every key it would derive going forward, breaking
  in-flight escrows that depend on the current derivation; a real
  operational constraint, not something this codebase automates today.
- Session tokens and WS tickets — confirmed each has exactly one issuance
  point (`POST /v1/identity/authenticate`, `POST /v1/identity/ws-ticket`
  respectively); no other route echoes either back.

## Data Protection

- No PII stored beyond public keys
- No logging of sensitive data (headers/cookies/tokens redacted — `app.ts`'s
  own pino `redact` config)
- Encryption at rest for the database is a deployment-time choice (e.g. AWS
  RDS storage encryption), not something this codebase enforces or verifies
  itself — confirm it's enabled for your own deployment, don't assume it
- TLS for all communications

## Dependency Security

- Regular dependency updates via Dependabot (`.github/dependabot.yml`)
- Automated static analysis (CodeQL, `security-extended` query pack) on
  every PR, every push to `main`, and weekly — `.github/workflows/codeql.yml`,
  added 2026-08-15. This line was aspirational before that date; corrected
  once it became true, not before.
- Lock files committed (`package-lock.json`)

## Compliance

- GDPR compliant (minimal data collection)
- SOC 2 Type II (planned)

## Contact

- **Security:** security@sailsprotocol.io
- **General:** hello@sailsprotocol.io

---

> **Last updated:** 2026-08-15
