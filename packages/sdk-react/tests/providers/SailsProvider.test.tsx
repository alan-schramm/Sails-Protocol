import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SailsProvider } from '../../src/providers/SailsProvider'
import { useSailsClient } from '../../src/hooks/useSailsClient'
import { createMockSailsClient } from '../mocks/sails-client.mock'

describe('SailsProvider / useSailsClient', () => {
  it('throws when useSailsClient() is called outside a SailsProvider', () => {
    expect(() => renderHook(() => useSailsClient())).toThrow(/must be called within a <SailsProvider/)
  })

  it('returns the exact client instance passed to the provider', () => {
    const client = createMockSailsClient()
    function wrapper({ children }: { children: ReactNode }) {
      return <SailsProvider client={client}>{children}</SailsProvider>
    }
    const { result } = renderHook(() => useSailsClient(), { wrapper })
    expect(result.current).toBe(client)
  })
})
