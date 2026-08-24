/**
 * Canonical Bitcoin network vocabulary — Missão 11 Fase 8.1 LB-01/LB-07.
 *
 * Before this file existed, the server (src/config/index.ts's
 * MULTISIG_NETWORK -> multisig.provider.ts's networkFor()) and the SDK
 * (escrow-key-derivation.ts's EscrowKeyNetwork -> wallet-verification.ts's
 * own separately-written networkFor()) each had their own independently
 * coded mapping from a raw string to a bitcoinjs-lib network object —
 * with DIFFERENT accepted literals ('bitcoin' recognized server-side
 * only) and, server-side, a SILENT fallback to testnet for anything
 * unrecognized (typo, unset, wrong case). A wallet integrator using the
 * server's own documented value ('bitcoin') in SDK-side config would
 * silently verify against testnet instead of throwing.
 *
 * Both packages now import this one function instead of re-implementing
 * it — the single source of truth for what a "Bitcoin network" string
 * means anywhere in this protocol, client or server.
 */

export type BitcoinNetwork = 'mainnet' | 'testnet' | 'regtest'

// 'bitcoin' is accepted as a documented alias for 'mainnet' (matches
// .env.example/docs/DEPLOYMENT.md's own canonical MULTISIG_NETWORK=bitcoin
// production value) — normalized here, once, rather than requiring every
// consumer to know about the alias itself.
const RECOGNIZED: Record<string, BitcoinNetwork> = {
  mainnet: 'mainnet',
  bitcoin: 'mainnet',
  testnet: 'testnet',
  regtest: 'regtest',
}

/**
 * Normalizes a raw configured/user-supplied network string into the
 * canonical BitcoinNetwork literal. THROWS on missing, empty, or
 * unrecognized input — never falls back to any network, mainnet or
 * testnet, in either direction. Case-sensitive by design: every
 * documented value in this repo is lowercase, and accepting mixed case
 * would just reintroduce a second class of typo this function exists to
 * eliminate.
 */
export function normalizeBitcoinNetwork(raw: string | undefined): BitcoinNetwork {
  if (raw === undefined || raw === '') {
    throw new Error(
      'Bitcoin network is not configured. Expected one of: mainnet, testnet, regtest ' +
      "('bitcoin' accepted as an alias for mainnet)."
    )
  }
  const normalized = RECOGNIZED[raw]
  if (!normalized) {
    throw new Error(
      `Unrecognized Bitcoin network '${raw}'. Expected one of: mainnet, testnet, regtest ` +
      "('bitcoin' accepted as an alias for mainnet). Refusing to silently fall back to any network."
    )
  }
  return normalized
}
