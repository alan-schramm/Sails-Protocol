# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-08-05
### Added
- Documentation: usage examples (`docs/EXAMPLES.md`) and API reference (`docs/API.md`).
- CI workflow (`.github/workflows/ci.yml`) with lint, test, and Docker build.
- Docker integration test script (`scripts/docker-test.sh`) and Jest test (`tests/integration/docker.test.ts`).
- Expanded mock wallet adapter tests to cover `signMessage` and `getCapabilities`.

### Changed
- Bumped SDK version to `0.1.1` in `package.json`.

### Fixed
- None (initial release of new features).
