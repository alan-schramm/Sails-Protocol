# Changelog

All notable changes to `@satsails/sdk-react` will be documented in this file.

## [0.2.0] - 2026-09-17

### Changed
- Reconciled the React integration package with the current `@satsails/p2p-trading-sdk` public surface.
- Updated the SDK dependency range to `^0.2.0`.
- Aligned package metadata with the independently versioned `0.2.0` release.

### Fixed
- Corrected the useSailsLiquidity() offer-detail query type from the stale Offer contract to the SDK's current PublicOfferDetail return type.

### Removed
- Removed `hardhat` from runtime dependencies. Hardhat remains a legitimate development dependency of the repository's `contracts` workspace and is not required by `@satsails/sdk-react` at runtime.
