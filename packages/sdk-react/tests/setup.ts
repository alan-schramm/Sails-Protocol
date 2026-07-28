/**
 * jsdom (25.x, via vitest's jsdom environment) installs its own realm's
 * Uint8Array onto globalThis, but Node's `Buffer` class was already built
 * against the original Node realm's Uint8Array. That makes
 * `Buffer.from(...) instanceof Uint8Array` false in this environment
 * (true under plain Node or real browser bundling), which breaks any
 * `value instanceof Uint8Array` validation — e.g. `@bitcoinerlab/
 * secp256k1`'s point/private-key checks, hit via `@sails/sdk`'s
 * escrow-key module — with opaque "Expected Private"/"ecc library
 * invalid" errors. Restore the global to the one Buffer actually
 * extends, before any other module (including mocks that pull in
 * @sails/sdk) loads.
 */
const nodeUint8Array = Object.getPrototypeOf(Buffer.prototype).constructor
if (globalThis.Uint8Array !== nodeUint8Array) {
  globalThis.Uint8Array = nodeUint8Array
}

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
