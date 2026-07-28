/**
 * @sails/sdk — Sails P2P Trading SDK
 * See docs/SDK_GUIDE.md for the full interface specification and
 * docs/DEVELOPER_JOURNEY.md for the step-by-step onboarding flow.
 */
export { SailsClient, type SailsClientOptions } from './client'
// SailsTransport/SailsTransportOptions deliberately NOT re-exported here
// (audit finding, docs/TODO.md §28): internal plumbing SailsClient
// assembles itself — zero documented use case for an external caller
// constructing one directly, zero real external usage (packages/sails-ui,
// examples/simple-wallet), and this package's own tests already import
// it straight from './transport', never through this barrel. Still
// exported from transport.ts itself for that internal use; just not part
// of the public @sails/sdk surface.

export {
  SailsError,
  SailsValidationError,
  SailsNotFoundError,
  SailsEscrowError,
  SailsAuthError,
  SailsForbiddenError,
  SailsInternalError,
  SailsTransportError,
  SailsNotImplementedError,
} from './errors'

export {
  SailsIdentityModule,
  generateKeypair,
  hexToBytes,
  type Ed25519Keypair,
  type AuthenticateResult,
} from './modules/identity'
export { SailsReputationModule, type RateInput } from './modules/reputation'
export {
  SailsLiquidityModule,
  type PublishOfferInput,
  type OrderBook,
  type MatchInput,
  type LiquidityOfferSummary,
  type DiscoverResult,
} from './modules/liquidity'
export { SailsOpenP2PModule, WebSocketChannel, type ChatFrame, type ChatMessageEvent } from './modules/openp2p'
export { SailsSettlementModule, type CreateEscrowInput } from './modules/settlement'
export { generateEscrowKeypair, signEscrowPsbt, type EscrowKeypair } from './modules/escrow-key'
export { signEscrowArkTx } from './modules/escrow-ark-signing'
export { SailsPeersModule, type StaticTopic } from './modules/peers'
export { SailsCapabilitiesModule, type RegisterCapabilityInput } from './modules/capabilities'

// SailsIntentFacade (the class) deliberately NOT re-exported here (audit
// finding, docs/TODO.md §28): SailsClient.intents is private specifically
// so the six delegate methods (createIntent/cancelIntent/negotiate/
// submitProof/releaseAsset/dispute) are the only supported entry point —
// exporting the class itself would let a caller construct one directly
// against a raw transport, bypassing SailsClient's session management
// entirely, exactly what `private` was meant to prevent. Zero real
// external usage confirmed. The two payload types below stay exported —
// negotiate()/submitProof() callers genuinely need them to construct
// their second argument.
export {
  type NegotiationEvent,
  type ProofSubmission,
} from './intent-facade'

export type { WalletAdapter, WalletCapabilitiesDeclaration } from './wallet-adapter'

// RFC-020 custody providers (fulfills RFC-019 Phase 2) — see
// packages/sails-sdk/src/custody/types.ts's own header comment.
export type {
  CustodyProvider,
  CreateEscrowAccountParams,
  EscrowAccount,
  UnsignedCustodyAction,
  PackedUserOperation,
  MuSig2Nonces,
  MuSig2Round,
} from './custody/types'
export { ERC4337CustodyProvider, hashUserOp, domainSeparator, getUserOpHash, type Erc4337CustodyConfig } from './custody/evm-4337'
export { BitcoinCustodyProvider, type EscrowRulingPath, type MuSig2SigningRound } from './custody/bitcoin-taproot'
export {
  SailsSignerService,
  parseDerSignature,
  toEthereumSignature,
  extractUncompressedPubkeyFromSpki,
  ethereumAddressFromUncompressedPubkey,
  type SailsSignerServiceConfig,
} from './custody/kms-signer'

export type {
  AssetType,
  TradeSide,
  OfferStatus,
  TradeStatus,
  EscrowType,
  EscrowStatus,
  PaymentMethod,
  DisputeStatus,
  DisputeRuling,
  IntentStatus,
  Participant,
  Offer,
  Trade,
  PaginatedTrades,
  Escrow,
  EscrowPendingTransaction,
  EscrowTransactionSignature,
  Dispute,
  Message,
  ReputationScore,
  Intent,
  TradeIntentPayload,
  PeerStatus,
  CapabilityGrant,
} from './types'
