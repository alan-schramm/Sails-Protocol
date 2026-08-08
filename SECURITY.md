# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within Sails Protocol, please send an email to [security@sailsprotocol.io](mailto:security@sailsprotocol.io). All security vulnerabilities will be promptly addressed.

**Please do not report security vulnerabilities through public GitHub issues.**

## Scope

This security policy applies to:

- **Backend API** (`@sails/api`) — Fastify server, authentication, escrow logic
- **SDK** (`@sails/sdk`) — Client library for interacting with the API
- **React SDK** (`@sails/sdk-react`) — React hooks and components

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

1. **Never share your private key** — Not even with support
2. **Verify URLs** — Only use official domains
3. **Enable 2FA** — Where available
4. **Report suspicious activity** — Contact security@sailsprotocol.io

## Authentication

- JWT tokens with short expiry (15 minutes)
- Refresh tokens stored securely
- No password-based authentication (public key based)
- Session invalidation on logout

## Data Protection

- No PII stored beyond public keys
- No logging of sensitive data (headers, tokens)
- Encryption at rest for database
- TLS for all communications

## Dependency Security

- Regular dependency updates via Dependabot
- Automated vulnerability scanning in CI
- Lock files committed (`package-lock.json`)

## Compliance

- GDPR compliant (minimal data collection)
- SOC 2 Type II (planned)

## Contact

- **Security:** security@sailsprotocol.io
- **General:** hello@sailsprotocol.io

---

> **Last updated:** 2026-08-07
