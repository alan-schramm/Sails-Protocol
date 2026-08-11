/**
 * @satsails/p2p-trading-sdk — Sails P2P Trading SDK
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
// of the public @satsails/p2p-trading-sdk surface.

export {
  SailsError,
  SailsValidationError,
  SailsNotFoundError,
  SailsEscrowError,
  SailsAuthError,
  SailsForbiddenError,
  SailsInternalError,
  SailsRateLimitError,
  SailsTransportError,
  SailsConfigError,
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
export {
  SailsOpenP2PModule,
  WebSocketChannel,
  type ChatFrame,
  type ChatMessageEvent,
  type WebSocketChannelOptions,
  type WebSocketConnectionState,
} from './modules/openp2p'
export {
  SailsSettlementModule,
  type CreateEscrowInput,
  recommendedEscrowType,
  type SafeGuardBundle,
  parseSafeGuardBundle,
  type ArbiterProfile,
  type ReleaseApproval,
  type ReleaseApprovalsResult,
} from './modules/settlement'
export { SailsProofModule, type EvidenceBundle, type AssertClaimInput, type SubmitProofInput, type VerifyProofInput } from './modules/proof'
export {
  SailsAgentsModule,
  type GeneratedTradeIntent,
  type GeneratedOfferIntent,
  type IntentRiskAssessment,
  type IntentRiskLevel,
  type IntentRiskRecommendation,
  type AssessableIntent,
} from './modules/agents'
export type { Proof, Verification } from './types'
export { generateEscrowKeypair, signEscrowPsbt, type EscrowKeypair } from './modules/escrow-key'
export { signEscrowArkTx } from './modules/escrow-ark-signing'
export { signEscrowSafeUserOp } from './modules/escrow-safe-signing'
export { SailsPeersModule, type StaticTopic } from './modules/peers'
export { SailsCapabilitiesModule, type RegisterCapabilityInput } from './modules/capabilities'
export { SailsArbitrationModule, type ArbiterCandidate } from './modules/arbitration'
export { SailsPaymentAccountModule, type PaymentAccount } from './modules/payment-account'
export { hashPaymentAccount } from './payment-account'
export { encryptChatMessage, decryptChatMessage, type EncryptedChatMessage } from './chat-encryption'

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
// MockWalletAdapter — real, genuine external use case: README.md's own
// quickstart snippet needs a WalletAdapter a first-time visitor can run
// without a real wallet, and importing it via a relative source path
// (the previous state) only works inside this monorepo, not for an
// external `npm install @satsails/p2p-trading-sdk` consumer. Production Readiness Audit
// finding, closed 2026-08-09.
export { MockWalletAdapter } from './wallet-adapter-mock'

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
  PaginatedMessages,
  ReputationScore,
  LeaderboardEntry,
  LeaderboardResult,
  Intent,
  TradeIntentPayload,
  PeerStatus,
  CapabilityGrant,
  Vouch,
} from './types'
