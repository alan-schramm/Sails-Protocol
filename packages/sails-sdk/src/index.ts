/**
 * @sails/sdk — Sails P2P Trading SDK
 * See docs/SDK_GUIDE.md for the full interface specification and
 * docs/DEVELOPER_JOURNEY.md for the step-by-step onboarding flow.
 */
export { SailsClient, type SailsClientOptions } from './client'
export { SailsTransport, type SailsTransportOptions } from './transport'

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
export { SailsLiquidityModule, type PublishOfferInput, type OrderBook, type MatchInput } from './modules/liquidity'
export { SailsOpenP2PModule, WebSocketChannel, type ChatFrame } from './modules/openp2p'
export { SailsSettlementModule, type CreateEscrowInput } from './modules/settlement'
export { SailsPeersModule, type StaticTopic } from './modules/peers'

export {
  SailsIntentFacade,
  type NegotiationEvent,
  type ProofSubmission,
} from './intent-facade'

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
  Escrow,
  Dispute,
  Message,
  ReputationScore,
  Intent,
  TradeIntentPayload,
  PeerStatus,
} from './types'
