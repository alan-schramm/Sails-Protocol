# Support

## Getting Help

Start with the repository's current entry path:

- [README](README.md) — product and repository overview
- [Project Context](docs/PROJECT_CONTEXT.md) — institutional/product context
- [System Design](docs/SYSTEM_DESIGN.md) — consolidated current system-level technical map
- [SDK Guide](docs/SDK_GUIDE.md) — SDK onboarding and integration guidance
- [Stable API](docs/API_STABLE.md) — pre-v1 compatibility contract for the public SDK
- [API Reference](docs/API_REFERENCE.md) — endpoint documentation
- [Contributing](CONTRIBUTING.md) — contribution workflow and architecture discipline

## Public Questions, Bugs, and Feature Requests

This repository currently uses **GitHub Issues** as the verified public support surface.

- **Bug reports** — use the Bug / Regression issue template.
- **Feature / implementation requests** — use the Implementation / Feature template.
- **Architecture or protocol changes** — use the Architecture / Protocol Change template and follow the RFC/governance process.
- **Research / unresolved questions** — use the Research / Investigation template.
- **Security vulnerabilities** — do **not** disclose sensitive exploit details in a public issue; follow [SECURITY.md](SECURITY.md).

GitHub Discussions is not currently enabled for this repository. This file therefore does not advertise Discussions, Discord, social accounts, commercial email addresses, or external support portals as official support channels unless they are explicitly established and maintained.

## Reporting Bugs

Include enough evidence for another developer to reproduce or falsify the report:

1. **Environment** — OS, Node.js version, package version/commit where relevant.
2. **Steps to reproduce** — minimal commands or code.
3. **Expected behavior** — what property should hold.
4. **Actual behavior** — what happened instead.
5. **Evidence** — logs, failing test, stack trace, transaction/provider evidence where appropriate.
6. **Economic/security impact** — state explicitly if the issue can affect authority, settlement, funds, evidence, privacy, or a frozen invariant.

## Feature Requests

Before filing:

1. Search existing Issues to avoid duplicate work.
2. Describe the user/integrator problem before proposing an implementation.
3. Identify the desired property and relevant canonical owner when known.
4. Keep architecture, implementation, evidence, and production eligibility as separate claims.

## Pull Requests

See [CONTRIBUTING.md](CONTRIBUTING.md) and the repository PR template.

The project uses consequence-weighted review. Protocol-sensitive, financial-authority, security-sensitive, evidence-sensitive, and settlement-sensitive work requires stronger evidence than ordinary reversible changes.

## Support Commitments

This repository does **not** publish a blanket response-time SLA for community issues, integration requests, or commercial support.

Security reporting expectations are governed by [SECURITY.md](SECURITY.md). Any future commercial support channel or response-time commitment should be documented only after the corresponding operational capability actually exists.

---

> **Last updated:** 2026-09-19
