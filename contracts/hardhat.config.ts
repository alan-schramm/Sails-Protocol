import type { HardhatUserConfig } from 'hardhat/config'

// RFC-020 reference contracts only — compile-only verification (`npx
// hardhat compile`), no network/deploy config. Matches
// SailsEscrowSafe.sol's real pragma (`^0.8.28`, set by
// @account-abstraction/contracts) and enables the IR-based optimizer,
// which Safe's own contracts (`>=0.7.0 <0.9.0`, deeply nested library
// calls) need to compile within the EVM's contract-size limit.
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
}

export default config
