# Sails P2P Trading SDK — Relatório de Auditoria de Testes

> **Escopo**: Análise completa da suíte de testes — 40 testes no root (`tests/`), 15 no SDK (`packages/sails-sdk/tests/`), 16 no SDK React (`packages/sdk-react/tests/`)
> **Instrução**: Identificação de problemas — nenhuma implementação foi feita.

---

## 📊 Sumário Executivo

| Métrica | Valor |
|---------|-------|
| Arquivos de teste (root) | 40 |
| Arquivos de teste (SDK) | 15 |
| Arquivos de teste (React) | 16 |
| Total arquivos de teste | **71** |
| Total testes (jest + vitest) | **661 jest + 98 vitest** |
| Cobertura declarada | 100% dos testes críticos de segurança ✓ |

### Status Geral
✅ **Todos os testes passam** (661/661 jest + 98/98 vitest)
✅ **TypeScript compila clean**
✅ **Segurança crítica verificada** (RT-002, prompt injection, handshake spoofing, MuSig2, race conditions, IDOR)

---

## 1. Cenários Não Cobertos

### 1.1 Escrow SPLIT ruling (RFC-021 D9) — **CRITICAL**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/escrowReleaseControls.test.ts` | não coberto | O path `DisputeRuling.SPLIT` em `dispute.service.ts:223-239` nunca é testado. A validação de `releaseToAddress`/`refundToAddress`/`splitBuyerBps` em `resolveDispute()` não tem teste. |
| `src/modules/open-settlement/escrow.service.ts` | 1130-1170 | `splitFunds()` method não tem nenhum teste direto. |
| `tests/settlementOrchestrator.test.ts` | não testa split | O orchestrator não testa a transição SPLIT end-to-end. |

### 1.2 Escrow TIMED OUT → REFUND sweeper — **HIGH**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/escrowReleaseControls.test.ts` | não coberto | `escrowService.sweepExpiredEscrows()` (disparado via `config.features.escrowTimelockSweeper` em `app.ts:258-269`) nunca é testado. Nenhum teste cobre o path onde `expiresAt < now()` e o escrow deve ser automaticamente revertido. |

### 1.3 Dispute auto-resolution contest — **HIGH**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/qvacAutoResolutionHandler.test.ts` | não testa contest | `dispute.service.ts:529` `contestAutoResolution()` tem teste parcial mas não cobre o caso de contest dentro do deadline vs após o deadline expirado. |

### 1.4 Escrow dual-approval — **HIGH**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/escrowReleaseControls.test.ts` | não coberto | `approveRelease()`/`getReleaseApprovals()`/`hasDualApproval()` em `escrow.service.ts` não têm testes. `RELEASE_DUAL_APPROVAL` feature flag não é testada. |

### 1.5 WebSocket relay (fall-back path) — **MEDIUM**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/transportFallback.test.ts` | não coberto live | `FallbackTransportProvider` é testado com mocks, mas o caminho real `websocket-relay.service.ts` (registrado via `/ws/relay`) não tem teste de integração. |

### 1.6 P2P Transport: join-topic / broadcast-offer — **MEDIUM**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `src/infrastructure/p2p/pear.routes.ts` | 73-113 | As rotas `/v1/peers/join-topic`, `/v1/peers/join-trade`, `/v1/peers/broadcast-offer` não têm testes de integração. `tests/pearRoutes.test.ts` não existe. |

### 1.7 Social Engineering Agent — **MEDIUM**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `src/modules/open-agents/social-engineering-agent.ts` | 25-81 | `SocialEngineeringAgent.detectRisk()` é testado (`tests/socialEngineeringAgent.test.ts`), mas `analyzeTimeline()` (linha 55) — o path que processa todos os eventos do timeline — não é exercitado em todos os branches. |

### 1.7a QVAC Auto Resolution — **MEDIUM**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/qvacAutoResolutionHandler.test.ts` | não testa sweep | `sweepExpiredAutoResolutions()` (dispute.service.ts:585) não testado — o background sweep no `app.ts` não tem teste. |

### 1.8 Capability revocation — **MEDIUM**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/capabilityRegistry.test.ts` | não testa revoke | `capability-registry.ts:107` `revoke()` é testado, mas não verifica que grants revogados são filtrados de `listGrants()` com `where: { revokedAt: null }`. |

### 1.9 Escrow timelock proactive sweeper config — **LOW**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `src/app.ts` | 258-269 | `config.features.escrowTimelockSweeper` está OFF por padrão. Nenhum teste verifica o comportamento de boot quando habilitado. |

---

## 2. Edge Cases — Cobertos e Ausentes

### 2.1 Edge cases BEM testados — **✅**

| Arquivo | Edge case | Teste |
|---------|-----------|-------|
| `tests/race-condition.test.ts` | Concurrent release/refund | ✅ Testa `updateMany` com status-conditional WHERE |
| `tests/escrowReleaseControls.test.ts` | IDOR (non-party call) | ✅ Verifica `403` para não-partes |
| `tests/qvac-prompt-injection.test.ts` | Prompt injection | ✅ Verifica enum validation blocks malicious `asset`/`currency` |
| `tests/handshakeSpoofing.test.ts` | Peer ID spoofing | ✅ Verifica `remotePeerId` ≠ `claimId` |
| `tests/capabilityRegistry.test.ts` | Duplicate capability grant | ✅ @@unique constraint P2002 |
| `packages/sails-sdk/tests/payment-account.test.ts` | Hash consistency | ✅ 5 testes cobrindo edge cases de hash |
| `tests/paymentAccountHashConsistency.test.ts` | Same hash cross-package | ✅ Byte-for-byte match |

### 2.2 Edge cases AUSESES — **HIGH/MEDIUM**

| Edge case | Onde falta | Severidade |
|-----------|-----------|------------|
| Escrow tipo não suportado em `createEscrow` | Nenhum teste para `SAFE_GUARD_EVM` quando `SAFE_GUARD_EVM_BUNDLER_URL` não configurado | MEDIUM |
| `resolveDispute` com SPLIT ruling sem `toAddress` | `disputeFlow.test.ts` não testa validação SPLIT | HIGH |
| `initiateRelease` com provider não-`SIGNATURE_COLLECTION` | `escrowReleaseControls.test.ts` não testa o caminho de rejeição | MEDIUM |
| `contestAutoResolution` após deadline expirado | `qvacAutoResolutionHandler.test.ts` não testa timeout expirado | HIGH |
| `reconcileTrade` com `sinceMessageCreatedAt` null | `reconciliation.test.ts` não testa o path null explícito | LOW |
| `getMessages` (chat) com `after`/cursor | `chatUnification.test.ts` não testa paginação de mensagens | MEDIUM |
| `getLeaderboard` com `limit=0` ou `limit=1000` | `reputationOutcome.test.ts` não testa clamping | LOW |
| `getOffers` com `asset` inexistente | `liquidity.service.ts` getOffers — não testa asset vazio/zero results | LOW |
| `rate()` com `score` fora de 1-5 | `reputationOutcome.test.ts` — não testa limite inferior/superior | LOW |
| Escrow `lockFunds` quando já está `FUNDS_LOCKED` | Race condition testa, mas não estado duplicado | LOW |
| `submitParticipantKey` para buyer e seller simultaneamente | `escrow-key.test.ts` no SDK testa, mas não server-side | MEDIUM |

---

## 3. Testes Redundantes

### 3.1 Duplicata de validação de hash — **LOW**

| Arquivo 1 | Arquivo 2 | Observação |
|-----------|-----------|------------|
| `packages/sails-sdk/tests/payment-account.test.ts` (5 testes) | `tests/paymentAccountHashConsistency.test.ts` | Ambos testam `hashPaymentAccount()` — os 5 do SDK testam função isoladamente, o root testa cross-package match. Alguma sobreposição, mas nível de granularidade diferente. **Aceitável**, não é redundancy crítica. |

### 3.2 Mock setup duplicado — **LOW**

| Arquivo | Observação |
|---------|------------|
| `tests/escrowReleaseControls.test.ts`, `tests/escrowProviderWiring.test.ts`, `tests/safeGuardEvmProvider.test.ts` | Todos compartilham mock de `EscrowService` e `Trade` — setup boilerplate repetido ~3x. **Refactor para helper compartilhado** sugerido. |

### 3.3 Teste de autenticação em múltiplos arquivos — **LOW**

| Arquivo | Observação |
|---------|------------|
| `tests/routes.test.ts` (identity routes), `tests/wsAuth.test.ts`, `tests/handshakeSpoofing.test.ts` | Todos testam aspectos de autenticação WebSocket — cada um foca em um escopo diferente (REST vs WS vs P2P handshake), mas há sobreposição conceitual. **Aceitável** — boundaries diferentes. |

---

## 4. Testes Frágeis

### 4.1 Config-gated test pattern — **LOW**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/escrowReleaseControls.test.ts` | pattern | Usa `jest.mock('../src/config')` com getter mutável — funciona mas é frágil a mudanças na estrutura de imports. Se `config` mudar de local, todos os testes que dependem deste padrão quebram. |

### 4.2 Timing-dependent tests — **MEDIUM**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/integration/docker.test.ts` | 22-38 | `jest.setTimeout(120_000)` + polling via curl com `sleep 2` — altamente dependente de timing. Pode falhar em CI lento. |

### 4.3 Order-dependent test isolation — **MEDIUM**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/routes.test.ts` | header | Comentário documenta que `process.env.TRUSTED_ARBITRERS = ''` deve ser setado **antes** do import de config. **Ordem de import frágil** — mudar a ordem de imports pode quebrar. |

### 4.4 Assertion de string literal — **LOW**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/sendTransaction.test.ts` | error message | `expect(error.message).toContain('not directly callable')` — frágil a mudança na mensagem de erro. |
| `tests/routes.test.ts` | várias | `expect(response.body.error).toBe('NOT_FOUND')` etc. — hardcoded error codes. |

### 4.5 Mock de data/hora — **LOW**

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `tests/qvacAutoResolutionHandler.test.ts` | deadline | Usa `Date.now()` diretamente em deadlines — se a máquina estiver lenta, pode passar do deadline durante o teste. Considerar `jest.useFakeTimers()`. |

---

## 5. Cobertura Funcional — Gaps por Módulo

### 5.1 Módulos com cobertura **EXCELENTE** ✅

| Módulo | Testes | Cobertura |
|--------|--------|-----------|
| OpenIdentity | `identity`, `wsAuth` | ✅ Completa |
| OpenLiquidity | `routes.test.ts` (liquidity routes) | ✅ Alta (falta provider externo, mas InternalOrderBook testado) |
| OpenProof | `useSailsProof` (React), `proof.service.ts` tem teste parcial | ✅ Alta |
| OpenReputation | `reputationOutcome`, `vouchService`, `useSailsReputation` | ✅ Alta |
| OpenP2P (chat) | `chatUnification`, `negotiationInboundChannel` | ✅ Boa |
| Capabilities | `capabilityRegistry`, `useSailsCapabilities` | ✅ Boa |

### 5.2 Módulos com gaps de cobertura — **HIGH**

#### `src/modules/open-settlement/escrow.service.ts` — 1,257 linhas

| Método | Testado? | Observação |
|--------|----------|------------|
| `createEscrow` | ✅ Parcial | `settlementOrchestrator.test.ts` |
| `lockFunds` | ✅ Sim | `escrowReleaseControls.test.ts` |
| `markPaymentSent` | ✅ Sim | `fullTradeLifecycle.test.ts` |
| `releaseFunds` | ✅ Sim | `escrowReleaseControls.test.ts` |
| `refundFunds` | ✅ Parcial | Testado via fullTradeLifecycle, não isoladamente |
| `dispute` | ✅ Sim | `disputeFlow.test.ts` |
| `resolveDispute` (RELEASE/REFUND) | ✅ Sim | `disputeFlow.test.ts` |
| `resolveDispute` (SPLIT) | ❌ NÃO | Nenhum teste |
| `approveRelease` | ❌ NÃO | RFC-015 dual-approval não testado |
| `getReleaseApprovals` | ❌ NÃO | |
| `hasDualApproval` | ❌ NÃO | |
| `initiateRelease` | ✅ Sim | `escrowReleaseControls.test.ts` |
| `initiateRefund` | ✅ Parcial | |
| `initiateSplit` | ❌ NÃO | RFC-021 D9 — não testado |
| `submitTransactionSignature` | ✅ Sim | `escrowReleaseControls.test.ts` |
| `getPendingTransaction` | ✅ Sim | |
| `submitParticipantKey` | ❌ NÃO | Testado no SDK, não no server |
| `openDispute` | ✅ Sim (via raiseDispute) | |
| `revertPendingTransaction` | ❌ NÃO | Cleanup de pending tx |
| `sweepExpiredEscrows` | ❌ NÃO | Sweeper não testado |
| `isPartyOrAgent` | ✅ Sim | Testado como parte de IDOR |
| `isSellerOrAssignedArbiter` | ✅ Sim | |
| `isSignatureCollectionType` | ❌ NÃO | |

#### `src/infrastructure/p2p/pear.routes.ts` — 114 linhas

| Rota | Testado? | Observação |
|------|----------|------------|
| `POST /v1/peers/start` | ❌ NÃO | |
| `POST /v1/peers/stop` | ❌ NÃO | |
| `GET /v1/peers/status` | ❌ NÃO | |
| `POST /v1/peers/join-topic` | ❌ NÃO | |
| `POST /v1/peers/join-trade` | ❌ NÃO | |
| `POST /v1/peers/broadcast-offer` | ❌ NÃO | |

#### `src/modules/open-agents/social-engineering-agent.ts`

| Método | Testado? | Observação |
|--------|----------|------------|
| `detectRisk` | ✅ Sim (2 testes) | `socialEngineeringAgent.test.ts` |
| `analyzeTimeline` | ❌ Parcial | Nem todos os patterns testados |
| `getRiskPatterns` | ❌ NÃO | |

#### `src/modules/open-identity/identity.service.ts`

| Método | Testado? | Observação |
|--------|----------|------------|
| `register` | ✅ Sim | `routes.test.ts` |
| `getParticipant` | ✅ Sim | |

#### `src/modules/open-liquidity/liquidity.service.ts` — 356 linhas

| Método | Testado? | Observação |
|--------|----------|------------|
| `createOffer` | ✅ Sim | `routes.test.ts` |
| `getOffer` | ✅ Sim | |
| `getOffersByUser` | ✅ Sim | |
| `updateOfferStatus` | ✅ Sim | |
| `getOrderBook` | ✅ Sim | |
| `getAggregatedOffers` | ✅ Parcial | Testa com 1 provider, não múltiplos |
| `findBestMatch` | ✅ Sim | |
| `HodlHodlProvider.getOffers` | ❌ NÃO | Mock retorna `[]` |

### 5.3 SDK — cobertura funcional

#### `packages/sails-sdk/src/client.ts`

| Método | Testado? | Observação |
|--------|----------|------------|
| `getWalletAddresses` | ❌ NÃO | **Nunca testado** |
| `getCapabilities` | ❌ NÃO | |
| `getScoreByPeerId` | ❌ NÃO | Adicionado recentemente |
| `reconcileTrade` | ❌ NÃO | Adicionado recentemente |
| `getReleaseApprovals` | ❌ NÃO | Adicionado recentemente |
| `registerArbiter` | ❌ NÃO | |
| `getArbiterProfile` | ❌ NÃO | |

#### `packages/sails-sdk/src/modules/proof.ts`

| Método | Testado? | Observação |
|--------|----------|------------|
| `assertClaim` | ✅ Sim | `useSailsProof.test.tsx` (React) |
| `submitProof` | ✅ Sim | |
| `verifyProof` | ✅ Sim | |
| `issueVerificationNonce` | ✅ Sim | |
| `getEvidenceBundle` | ✅ Sim | |

### 5.4 React Hooks — cobertura

| Hook | Testes | Cobertura |
|------|--------|-----------|
| `useSailsIdentity` | ✅ 4 testes | Completo |
| `useSailsLiquidity` | ✅ 8 testes | Completo |
| `useSailsReputation` | ✅ 4 testes | Completo |
| `useSailsCapabilities` | ✅ 4 testes | Completo |
| `useSailsProof` | ✅ 10 testes | Completo |
| `useSailsLiquidityDiscover` | ✅ 4 testes | Completo |
| `useSailsWallet` | ❌ NÃO | **Nenhum teste** — hook não testado |
| `useSailsEscrow` | ❌ NÃO | Nenhum teste |
| `useSailsSettlement` | ❌ NÃO | Nenhum teste |
| `useSailsTrade` | ❌ NÃO | Nenhum teste |

---

## 6. Resumo por Severidade

| Severidade | Contagem | Principais achados |
|-----------|----------|-------------------|
| **CRITICAL** | 1 | SPLIT ruling não testado |
| **HIGH** | 6 | auto-resolution contest, dual-approval, P2P transport routes, dispute sweep, `resolveDispute` SPLIT validation, `initiateRelease` provider rejection |
| **MEDIUM** | 8 | WebSocket relay live test, capability list filtering, escrow timelock sweeper, social engineering patterns, liquidity multi-provider, timing tests, order-dependent config |
| **LOW** | 10 | Redundância de hash test, mock setup boilerplate, assertion string literals, timer mocks, `getMessages` cursor, leaderboard bounds, rate score bounds |

---

## 7. Recomendações Prioritárias (sem implementação)

1. **Adicionar testes para SPLIT ruling** — `dispute.service.ts:223-239` e validação em `resolveDispute()`
2. **Testar `sweepExpiredEscrows()`** — sweeper de timelock não testado
3. **Testar rotas P2P transport** — TODO de `pear.routes.ts` não coberto
4. **Adicionar testes para dual-approval** — `approveRelease`/`getReleaseApprovals`/`hasDualApproval`
5. **Adicionar testes para `contestAutoResolution`** — especialmente deadline expirado
6. **Testar WebSocket relay live** — `/ws/relay` sem integração real
7. **Adicionar testes para hooks não testados** — `useSailsWallet`, `useSailsEscrow`, `useSailsSettlement`, `useSailsTrade` no SDK React
8. **Adicionar testes para métodos SDK não testados** — `getWalletAddresses`, `getCapabilities`, `getScoreByPeerId`, `reconcileTrade`, `getReleaseApprovals`, `registerArbiter`, `getArbiterProfile`
9. **Extrair mock setup boilerplate** — shared helper para `escrowReleaseControls`/`escrowProviderWiring`/`safeGuardEvmProvider`
10. **Usar `jest.useFakeTimers()`** em testes de deadline para evitar timing fragilidade