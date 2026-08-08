/**
 * @sails/sdk-react — React hooks and components for @sails/sdk.
 * See this package's README for setup (SailsProvider + a
 * QueryClientProvider, both required).
 */
export { SailsProvider, useSailsContext, type SailsProviderProps } from './providers/SailsProvider'

export { useSailsClient } from './hooks/useSailsClient'
export { useSailsTrade } from './hooks/useSailsTrade'
export { useSailsTrades, type UseSailsTradesOptions } from './hooks/useSailsTrades'
export { useSailsEscrow, type UseSailsEscrowResult } from './hooks/useSailsEscrow'
export { useSailsIdentity, type UseSailsIdentityResult } from './hooks/useSailsIdentity'
export { useSailsLiquidity, type UseSailsLiquidityResult, type UseSailsLiquidityOptions } from './hooks/useSailsLiquidity'
export { useSailsLiquidityDiscover, type UseSailsLiquidityDiscoverOptions } from './hooks/useSailsLiquidityDiscover'
export { useSailsReputation, type UseSailsReputationResult } from './hooks/useSailsReputation'
export { useSailsCapabilities, type UseSailsCapabilitiesResult } from './hooks/useSailsCapabilities'
export { useSailsProof, type UseSailsProofResult } from './hooks/useSailsProof'

export { TradeCard, type TradeCardProps, type TradeCardVariant } from './components/trade/TradeCard'
export { TradeStatusBadge, EscrowStatusBadge, type TradeStatusBadgeProps, type EscrowStatusBadgeProps } from './components/trade/StatusBadge'
export { ReputationBadge, type ReputationBadgeProps } from './components/identity/ReputationBadge'
export { ToastProvider, useToast, Toast, type ToastVariant, type ToastMessage } from './components/feedback/Toast'
export { Skeleton, type SkeletonProps } from './components/feedback/Skeleton'
