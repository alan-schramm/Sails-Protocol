/**
 * @sails/p2p-schemas — the domain contract layer between Sails Core
 * (generic protocol) and any P2P trading SDK/wallet integration
 * (04-Deepseek Review.md Task 1: "camada intermediária de Schemas de
 * Domínio antes do SDK" — the 'contrato social' every wallet implements).
 *
 * A real npm workspace package (`packages/sails-p2p-schemas`, wired via
 * the root package.json's `workspaces` field), consumed by the reference
 * implementation as `@sails/p2p-schemas` — the same import path any
 * external wallet integration would use once this is published. Types
 * only, zero runtime dependencies: a wallet written in any framework can
 * depend on this without pulling in Prisma, Fastify, or anything else
 * from the reference implementation.
 */
export * from './offer'
export * from './trade'
export * from './dispute'
