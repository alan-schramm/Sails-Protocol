/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  clearMocks: true,
  moduleNameMapper: {
    // Resolve the workspace package straight to its TypeScript source so
    // tests never depend on `packages/*/dist` having been built first —
    // without this, `npm test` on a fresh clone fails until `npm run
    // build` has run once (found the hard way: deleting dist broke the
    // dispute suite while the code itself was fine).
    '^@sails/p2p-schemas$': '<rootDir>/packages/sails-p2p-schemas/src/index.ts',
  },
}
