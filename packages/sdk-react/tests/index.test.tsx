import { describe, it, expect } from 'vitest'
import * as SdkReact from '../src/index'

/**
 * Smoke test for the package's public entry point — every other test in
 * this suite imports from `../../src/<module>` directly, so `src/index.ts`
 * itself (the barrel a real consumer actually imports from) never
 * otherwise executes. This just confirms every advertised export is
 * really there and of the right kind, catching a broken/missing
 * re-export before it ships.
 */
describe('@satsails/sdk-react public exports', () => {
  it('exports the provider and its context hook', () => {
    expect(SdkReact.SailsProvider).toBeTypeOf('function')
    expect(SdkReact.useSailsContext).toBeTypeOf('function')
  })

  it('exports all data hooks', () => {
    expect(SdkReact.useSailsClient).toBeTypeOf('function')
    expect(SdkReact.useSailsTrade).toBeTypeOf('function')
    expect(SdkReact.useSailsTrades).toBeTypeOf('function')
    expect(SdkReact.useSailsEscrow).toBeTypeOf('function')
    expect(SdkReact.useSailsProof).toBeTypeOf('function')
    expect(SdkReact.useSailsIdentity).toBeTypeOf('function')
    expect(SdkReact.useSailsLiquidity).toBeTypeOf('function')
    expect(SdkReact.useSailsLiquidityDiscover).toBeTypeOf('function')
    expect(SdkReact.useSailsReputation).toBeTypeOf('function')
    expect(SdkReact.useSailsCapabilities).toBeTypeOf('function')
  })

  it('exports all components', () => {
    expect(SdkReact.TradeCard).toBeTypeOf('function')
    expect(SdkReact.TradeStatusBadge).toBeTypeOf('function')
    expect(SdkReact.EscrowStatusBadge).toBeTypeOf('function')
    expect(SdkReact.ReputationBadge).toBeTypeOf('function')
    expect(SdkReact.Skeleton).toBeTypeOf('function')
  })

  it('exports the toast provider, hook, and presentational component', () => {
    expect(SdkReact.ToastProvider).toBeTypeOf('function')
    expect(SdkReact.useToast).toBeTypeOf('function')
    expect(SdkReact.Toast).toBeTypeOf('function')
  })
})
