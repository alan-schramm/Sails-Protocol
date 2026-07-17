/**
 * demo-satsails-qvac.ts — Sails Protocol, root-level ecosystem entrypoint
 *
 * Boots the full reference-implementation stack in one process:
 *
 *   1. QVAC agents        — src/modules/open-agents (QvacAgentProvider,
 *                            BuyerAgent, SellerAgent) — real local LLM
 *                            inference via @qvac/sdk, not a canned response.
 *   2. Pears P2P network   — src/infrastructure/p2p (PearsTransportProvider,
 *                            real HyperDHT/Hyperswarm keypairs, a
 *                            trade-scoped topic join that triggers real
 *                            NAT hole-punching, sendIntentToPeer's
 *                            libsodium sealed-box encryption).
 *   3. Sails Protocol
 *      state machine       — src/core (intentEngine.create()'s
 *                            CREATED -> VALIDATED -> COORDINATED, RFC-012,
 *                            rfcs/RFC-012-intent-validation-and-coordination.md).
 *   4. WDK signing         — src/modules/open-settlement
 *                            (executeSettlement() -> escrowService.releaseFunds()
 *                            -> WdkSettlementProvider -> a real, digitally
 *                            signed @tetherto/wdk-wallet-evm transfer).
 *
 * This file does not reimplement any of that — duplicating ~150 lines of
 * already-real, already-tested orchestration logic into a second file
 * would be a maintenance/drift risk, not a genuine second implementation.
 * It delegates to src/demo/pix-to-usdt-flow.ts's `main()` (exported for
 * exactly this reuse, guarded behind `require.main === module` there so
 * this import doesn't also trigger that file's own standalone run) — the
 * same real flow already covering all four pieces above, in that exact
 * order, each with its own detailed step-by-step log line as it actually
 * executes (not a static, pre-announced list disconnected from real
 * progress). See that file's own header for the full per-piece
 * verification status, including the honest caveat that a live
 * Postgres/Redis/P2P network isn't reachable in every environment this
 * runs in — this root entrypoint inherits that same requirement, it does
 * not remove it.
 *
 * Run: `npm run demo:qvac` (equivalently: `ts-node --transpile-only
 * demo-satsails-qvac.ts`). Behavior is entirely .env-driven — see
 * .env.example for DATABASE_URL/REDIS_URL, MOCK_ESCROW, WDK_SEED_PHRASE/
 * WDK_RPC_URL/WDK_USDT_CONTRACT, and HYPERDHT_BOOTSTRAP.
 */
import { main as runPixToUsdtFlow } from './src/demo/pix-to-usdt-flow'

console.log('=== Sails Protocol — Boot completo do ecossistema (QVAC + Pears P2P + Core + WDK) ===')
console.log('Componentes a instanciar, nesta ordem, cada um com seu próprio log detalhado abaixo:')
console.log('  1. Agentes QVAC (inferência local, @qvac/sdk)')
console.log('  2. Rede P2P Pears (HyperDHT/Hyperswarm — hole-punching real)')
console.log('  3. Máquina de estados do Sails Protocol (Intent Engine, RFC-012)')
console.log('  4. Assinatura WDK (@tetherto/wdk-wallet-evm)')

runPixToUsdtFlow().catch((err) => {
  console.error('\n[demo-satsails-qvac] Falhou:', err)
  process.exit(1)
})
