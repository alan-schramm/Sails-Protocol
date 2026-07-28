/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  clearMocks: true,
  // @noble/curves v2.x (forced into packages/sails-sdk/node_modules by
  // @arkade-os/sdk's own transitive tree — verified via `npm ls
  // @noble/curves -w @sails/sdk --all`, npm cannot place a separate 1.x
  // copy there without breaking that tree) ships `"type": "module"` with
  // no real CJS entry point, even on its "require" condition. Jest's own
  // module registry (unlike plain Node 22+) doesn't interop with ESM-only
  // CJS-required packages, so `escrow-key.ts`/`custody/kms-signer.ts`
  // (both import `@noble/curves/secp256k1.js` directly) fail to load
  // under the default `transformIgnorePatterns`. ts-jest can transform
  // it like any other TS/JS source once it isn't ignored — verified: all
  // pre-existing `escrow-key.test.ts` cases still pass with this change.
  // `micro-packed` is `@scure/btc-signer/musig2.js`'s own real transitive
  // dependency, also `"type": "module"`, unscoped so the `@noble|@scure`
  // pattern alone doesn't cover it — added after `custody-musig2.test.ts`
  // hit the same "Cannot use import statement outside a module" failure.
  transformIgnorePatterns: ['node_modules/(?!(@noble|@scure|micro-packed)/)'],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest'],
  },
  moduleNameMapper: {
    // Resolve the workspace package straight to its TypeScript source so
    // tests never depend on `packages/*/dist` having been built first —
    // without this, `npm test` on a fresh clone fails until `npm run
    // build` has run once (found the hard way: deleting dist broke the
    // dispute suite while the code itself was fine).
    '^@sails/p2p-schemas$': '<rootDir>/packages/sails-p2p-schemas/src/index.ts',
  },
}
