import type { Preview } from '@storybook/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../src/providers/SailsProvider'
import { ToastProvider } from '../src/components/feedback/Toast'
import { createMockSailsClient } from '../tests/mocks/sails-client.mock'

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' },
  },
  decorators: [
    (Story) => {
      // A fresh QueryClient/SailsClient per story render — no cross-story
      // cache bleed (a story that mutates one trade shouldn't affect
      // what a later story's query returns).
      const [queryClient] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
      const [client] = React.useState(() => createMockSailsClient())
      return (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>
            <ToastProvider>
              <Story />
            </ToastProvider>
          </SailsProvider>
        </QueryClientProvider>
      )
    },
  ],
}

export default preview
