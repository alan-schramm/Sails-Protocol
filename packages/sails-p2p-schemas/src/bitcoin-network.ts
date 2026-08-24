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

/**
 * Missão 11 Fase 9.1.1 §3 — closes a real gap found building sails-ui's
 * own independent PSBT verification: `Escrow.network` (the field) is just
 * whatever string a caller happened to pass at `createEscrow()` time —
 * NOT a reliable source for which Bitcoin network a MULTISIG escrow's
 * deposit address is actually on (confirmed by reading
 * `escrow.service.ts`'s `createEscrow()`: `network: input.network`,
 * verbatim passthrough, often left unset entirely). The one thing a
 * verifier can always trust is the address itself: a P2WSH bech32
 * address's own human-readable prefix (bc1/tb1/bcrt1) is defined by
 * BIP-173/350 to encode exactly this, and bitcoinjs-lib enforces it on
 * every address it produces — no separate network-config exposure is
 * needed at all once the address is already public (which it must be,
 * to verify the funding input against in the first place).
 */
export function networkFromMultisigAddress(address: string): BitcoinNetwork {
  if (address.startsWith('bcrt1')) return 'regtest'
  if (address.startsWith('tb1')) return 'testnet'
  if (address.startsWith('bc1')) return 'mainnet'
  throw new Error(
    `Cannot determine Bitcoin network from address '${address}' — expected a bech32 P2WSH address ` +
    "(bc1.../tb1.../bcrt1... prefix). Refusing to silently guess a network."
  )
}
