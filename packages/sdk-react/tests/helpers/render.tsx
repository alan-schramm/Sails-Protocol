import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SailsClient } from '@sails/sdk'
import { SailsProvider } from '../../src/providers/SailsProvider'
import { ToastProvider } from '../../src/components/feedback/Toast'
import { createMockSailsClient } from '../mocks/sails-client.mock'

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  client?: SailsClient
  queryClient?: QueryClient
}

/** Mirrors .storybook/preview.tsx's decorator stack so component behavior under test matches what Storybook actually renders. */
export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}) {
  const client = options.client ?? createMockSailsClient()
  const queryClient = options.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SailsProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </SailsProvider>
      </QueryClientProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    client,
    queryClient,
  }
}

export * from '@testing-library/react'
