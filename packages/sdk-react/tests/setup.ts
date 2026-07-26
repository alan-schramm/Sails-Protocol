import '@testing-library/jest-dom/vitest'

/** jsdom doesn't implement matchMedia; several components/hooks may query it indirectly via responsive libraries consumers wrap around this SDK. */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList
}

/** jsdom doesn't implement IntersectionObserver, used by infinite-scroll consumers of useSailsTrades. */
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
if (typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
}

/** jsdom doesn't implement the Clipboard API, used by "copy trade id" style UI built on top of TradeCard. */
if (!navigator.clipboard) {
  Object.assign(navigator, {
    clipboard: {
      writeText: async () => {},
      readText: async () => '',
    },
  })
}
