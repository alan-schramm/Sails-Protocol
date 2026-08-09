/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  clearMocks: true,
  // `app.ts` now imports the root package.json (API_VERSION, see its own
  // comment) — tsc's resolveJsonModule copies that file into dist/ as a
  // build artifact, which then collides with the real root package.json
  // in Jest's haste module map (both declare the same "name") once dist/
  // has been built locally. dist/ should never be scanned by Jest at all
  // regardless — this is the correct general exclusion, not a workaround
  // specific to that one file.
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
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
  // `@arkade-os/sdk`'s own dependency tree turned out to have several
  // ESM-only (`"type": "module"`) transitive packages, discovered one at
  // a time as each new test file happened to import a different part of
  // it: `@noble/curves` v2.x (forced into packages/sails-sdk's own
  // node_modules by this same tree, no real CJS entry even on its
  // "require" condition), `micro-packed` (@scure/btc-signer/musig2.js's
  // dependency), a NESTED `@scure/base` copy under
  // node_modules/@arkade-os/sdk/node_modules/, and `@marcbachmann/cel-js`
  // (surfaced only once `safeGuardEvmProvider.test.ts` imported
  // `@sails/sdk`'s full barrel, which pulls in escrow-ark-signing.ts's
  // real `@arkade-os/sdk` import). Allowlisting each by name as it
  // surfaces doesn't scale — an empty transformIgnorePatterns (transform
  // everything, node_modules included) is the robust fix: ts-jest
  // downlevel-compiles real ESM/modern syntax to CJS the same way it
  // already does for this repo's own source, regardless of which
  // package it came from. Verified: the full existing suite still passes
  // with this change (slower, not broken).
  transformIgnorePatterns: [],
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
    // Same reasoning — `safe-guard-evm.provider.ts` (RFC-020) is the
    // first backend code to import `@sails/sdk` for real (its real
    // userOpHash math + SailsSignerService, not duplicated server-side).
    '^@sails/sdk$': '<rootDir>/packages/sails-sdk/src/index.ts',
  },
}
