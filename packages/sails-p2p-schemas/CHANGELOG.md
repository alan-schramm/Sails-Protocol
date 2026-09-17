# Changelog

All notable changes to `@satsails/p2p-schemas` will be documented in this file.

Release mechanics and package identity are governed by `docs/SCHEMAS_RELEASE.md`.

## [0.2.0] - 2026-09-17

### Added
- Established the first forward release record under the Schemas release contract.
- Expanded the shared schema surface required by the current P2P Trading SDK and settlement flows.

### Changed
- Reconciled shared escrow and settlement schemas with the current protocol/runtime contract.
- Unified escrow-creation schema usage across consumers.
- Corrected SPLIT-related representation in the shared contract.
- Reconciled shared SDK-facing types and capability-denial semantics.
- Removed a redundant runtime validator where the canonical shared schema already owns validation.

### Historical note
- `0.1.0` predates the forward release contract. This changelog does not reconstruct or reinterpret that historical artifact.
