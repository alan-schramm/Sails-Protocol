# Dependabot triage report

## Scope
This note captures the current best-available triage for the Dependabot alert situation on Sails Protocol, based on repository contents, remote branches, and local dependency audit evidence.

## Environment status
- Docker is available in the environment.
- GitHub CLI is available.
- Direct Dependabot API access is currently blocked by GitHub authentication permissions with HTTP 403 (`Resource not accessible by integration`), so the full list of 36 alerts could not be fetched from the GitHub API in this session.

## What was verified
### Repository evidence
- The repository contains a contracts workspace with a dependency on `@safe-global/safe-contracts` in [contracts/package.json](contracts/package.json).
- The root workspace and package manifests include dev/test tooling such as Jest, Vitest, Storybook, Artillery, PostCSS and related packages.
- Local dependency audit was re-run after the remediation work and currently reports no remaining production-facing vulnerabilities for the checked paths.
- The UI build was verified successfully with `npm run build -w @sails/ui`.
- The React Router issue was remediated by moving the UI to `react-router@8.3.0` and updating imports accordingly.

### Remote Dependabot branches observed
The following branches were observed from the repository remote:
- `origin/dependabot/npm_and_yarn/dependencies-488c650824`
- `origin/dependabot/npm_and_yarn/dependencies-6dd83eb4ca`
- `origin/dependabot/npm_and_yarn/dependencies-dd935d3add`
- `origin/dependabot/npm_and_yarn/multi-b6dd2cef0e`
- `origin/dependabot/npm_and_yarn/packages/sdk-react/npm_and_yarn-bc9680511c`
- `origin/dependabot/npm_and_yarn/vitest-3.2.6`

## Triage conclusion
The evidence is consistent with the earlier documentation in [docs/TODO.md](docs/TODO.md), but the actionable runtime issue around `react-router-dom` has now been remediated locally.

1. Contracts-related findings remain a low-priority/mostly reference-only risk category.
   - They are tied to the contracts workspace and the `@safe-global/safe-contracts` dependency chain.
   - The repository documentation already treats this as a reference/implementation-only area rather than a production runtime dependency path.

2. Dev-tooling findings remain in the documented risk bucket.
   - Jest, Vitest, Storybook, Artillery, PostCSS and related tooling are present and are expected to be the bulk of the alert surface in a repo of this shape.

3. Runtime-facing advisories are now reduced to the verified zero-vulnerability state for the checked paths.
   - The local audit currently reports no remaining vulnerabilities for the checked dependency scope.
   - The UI build and the dependency remediation were verified successfully.

## Recommended next steps
- If a GitHub token with Dependabot/security read permissions is available, rerun the original command to capture the full official alert list:
  - `gh api repos/alan-schramm/Sails-Protocol/dependabot/alerts --paginate -q '.[] | select(.state=="open") | [.security_vulnerability.severity, .dependency.manifest_path, .security_advisory.summary]'`
- Then classify any remaining alerts into three buckets:
  - Accept/document
  - Review/mitigate
  - Production-priority remediation
- For the current branch, the verified remediation work is complete for the previously actionable React Router issue.
