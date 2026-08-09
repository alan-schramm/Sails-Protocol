# Sails P2P Trading SDK — Relatório de Auditoria Arquitetural

> **Escopo**: Análise estrutural da arquitetura do `sails-push-ready` codebase (`src/` e `packages/`).
> **Instrução**: Não foram propostas mudanças de arquitetura. Apenas identificação de problemas existentes.
> **Status**: Auditoria de codigo completada. Nenhuma implementação foi feita.

---

## 1. Acoplamentos Desnecessários

### A. Uso direto de Prisma — 24 arquivos (HIGH)

Prisma é importado diretamente em **24 arquivos** de fonte, incluindo handlers de rota, middleware, e serviços de lógica de negócio — locais que deveriam invocar uma abstração de serviço/repositório, não o ORM diretamente.

**Atualização 2026-08-08** — análise real confirmou **197 call sites em ~34 arquivos**
(mais que os "100+" estimados), a maioria (170+) já dentro de `*.service.ts`/
`*-provider.ts`/`core/*-engine.ts` — ou seja, já razoavelmente encapsulados. O
gap real e acionável é mais estreito: as duas violações em rota
(`chat.routes.ts`/`trade.routes.ts`) e a ausência de uma interface
substituível na frente das 4 entidades nomeadas abaixo. Rollout
incremental iniciado — ver `## Recomendações Prioritárias`, item 3, para
o status atual (2/4 repositórios feitos).

| Arquivo | Caminho | Contexto |
|---------|---------|----------|
| `chat.routes.ts` | `src/modules/open-p2p/` | `prisma.trade.findUnique`, `prisma.message.create`, `prisma.message.findMany` em handlers de rota — **ainda aberto**, parte do step 3 (`TradeRepository`) |
| `trade.routes.ts` | `src/modules/open-p2p/` | `prisma.trade.findUnique` no route handler de reconciliação — **ainda aberto**, mesmo step |
| `escrow.service.ts` | `src/modules/open-settlement/` | Uso extenso de Prisma em todas as operações de cofre — **ainda aberto**, step 4 (`EscrowRepository`), deliberadamente por último (fundos reais) |
| `liquidity.service.ts` | `src/modules/open-liquidity/` | 356 linhas — fora do escopo dos 4 repositórios nomeados |
| `intent-engine.ts` | `src/core/` | ✅ **Fechado 2026-08-08** — `prisma.intent`/`prisma.intentEvent` movidos para `intent-repository.ts` |
| `coordination-engine.ts` | `src/core/` | ✅ **Fechado 2026-08-08** — mesmo `IntentRepository` |
| `capability-registry.ts` | `src/core/` | ✅ **Fechado 2026-08-08** — `prisma.capabilityGrant.*` movido para `capability-grant-repository.ts` |
| `auth.ts` | `src/common/middleware/` | Cache de sessão via Prisma — fora do escopo dos 4 repositórios nomeados |
| `proof.service.ts` | `src/modules/open-proof/` | Persistência direta — fora do escopo dos 4 repositórios nomeados |

**Recomendação**: Introduzir interfaces de repositório (`IntentRepository`, `CapabilityGrantRepository`, `TradeRepository`) e injeta-las via construtor.

### B. Uso direto de Redis — 2 arquivos (MEDIUM)

Redis é usado imperativamente em lógica de negócio, sem nenhuma abstração:

| Arquivo | Pattern | Contexto |
|---------|---------|----------|
| `auth.ts` | `redis.set()`, `redis.get()`, `redis.del()` | Armazenamento de sessão em middleware de auth ED25519 |
| `proof.service.ts` | `redis.setex()`, `redis.get()` | Gestão de nonces para verificação ZKP |

### C. Imports de tipos privados entre módulos — 2 arquivos (LOW)

| Arquivo 1 | Arquivo 2 | Import |
|-----------|-----------|--------|
| `seller-agent.ts` | `liquidity.service.ts` | `import type { CreateOfferInput }` (tipo interno) |
| `escrow-safe-signing.ts` | `settlement.ts`, `custody/kms-signer.ts` | `parseSafeGuardBundle`, `toEthereumSignature` — reutilização deliberada, documentada |

---

## 2. Módulos Grandes / Bloated

| Arquivo | Caminho | Linhas | Severidade |
|---------|---------|--------|------------|
| `escrow.service.ts` | `src/modules/open-settlement/` | **1,257** | CRITICAL |
| `handlers.ts` | `src/common/events/` | **497** | MEDIUM |

### `escrow.service.ts` — 1,257 linhas (CRITICAL)

**✅ Recomendação #1 (extração em 4 módulos) implementada 2026-08-08** — ver
`### Recomendações Prioritárias` mais abaixo para o detalhamento. Itens
#4 (fees embutidos) e #6 (acesso direto ao Prisma, i.e. um
`EscrowRepository`) permanecem deliberadamente não endereçados — são a
recomendação #3 mais abaixo ("Introduzir repositórios"), maior escopo,
não incluída neste pass.

Responsabilidades misturadas em um único arquivo (estado no momento do
audit original — item 1/2/3/5 abaixo agora vivem em módulos separados,
ver nota acima):
1. **Gestão do ciclo de vida do cofre** (`createEscrow`, `lockFunds`, `releaseFunds`, `refundFunds`, etc.)
2. **Dispatch de providers** (mapa `PROVIDERS` hardcoded)
3. **Orquestração de dual-approval** (`approveRelease`, `hasDualApproval`, `getReleaseApprovals`)
4. **Cálculo de fees** (leitura direta de `config.settlement.protocolFeeRate`)
5. **Montagem de transações pendentes** (`initiateRelease`, `initiateRefund`, `submitTransactionSignature`)
6. **Acesso direto ao Prisma** — persistência embutida

### `handlers.ts` — 497 linhas (MEDIUM)

Coordinador central de eventos. Registra reações para eventos de 7+ módulos distintos. Conhece os formatos de evento de todos os módulos, atuando como amplificador de mudanças.

---

## 3. Dependências Circulares

### A. `transport-provider.ts` ⇄ `websocket-relay.service.ts` — CICLO REAL (HIGH)

```
transport-provider.ts → { WebSocketRelayService } (value import) → websocket-relay.service.ts
websocket-relay.service.ts → { PearsTransportProvider } (value import) → transport-provider.ts
```

**Severidade: HIGH** — Ambos os lados usam imports de valor (não `import type`), criando um ciclo real em tempo de execução. Fonte de erros `TypeError: Cannot access 'X' before initialization` em ESM.

### B. `event-bus.ts` ⇄ `event-store.ts` — LATENTE (LOW)

```
event-bus.ts  → { DurableEvent } (type-only import)
event-store.ts → { eventBus } (value import)
```

Type-only em uma direção — não cria ciclo em runtime, mas se o type import for alterado para value, virará ciclo real.

---

## 4. Responsabilidades Misturadas (Violções SRP)

| Arquivo | Responsabilidades Misturadas |
|---------|------------------------------|
| `escrow.service.ts` | 6 responsabilidades distintas (ver §2) |
| `handlers.ts` | Orquestração cross-module |
| `auth.ts` | Criptografia + persistência de sessão + emissão de token |
| `negotiation.service.ts` | Máquina de estados de negociação + persistência + wiring de transporte |
| `proof.service.ts` | Verificação ZKP + gestão de nonce |
| `capability-registry.ts` | Persistência de concessões + mapa estático de implementações |

---

## 5. Violações de SOLID

### Dependency Inversion Principle (DIP) — VIOLADA EM 11+ ARQUIVOS (HIGH)

Componentes centrais dependem diretamente de instâncias concretas de Prisma/Redis:

| Arquivo | Dependência Concreta | Abstração Disponível |
|---------|---------------------|----------------------|
| `intent-engine.ts` | `prisma.intent`, `prisma.intentEvent` | Nenhuma interface `IntentRepository` usada |
| `coordination-engine.ts` | `prisma.intent.findUnique` | Nenhuma interface `IntentRepository` usada |
| `capability-registry.ts` | `prisma.capabilityGrant` | Nenhuma interface `CapabilityGrantRepository` usada |
| `liquidity.service.ts` | `prisma.offer`, `prisma.trade` | Nenhuma interface `OfferRepository` usada |
| `negotiation.service.ts` | `prisma.trade`, `pearNodeRegistry` | `tradeService` existe, interface `PearsTransportProvider` não usada |
| `chat.routes.ts` | `prisma.trade`, `prisma.message` | `tradeService`, `messageService` existem mas são ignorados |
| `trade.routes.ts` | `prisma.trade` | `tradeService` existe mas é ignorado |
| `auth.ts` | `redis.set/get/del` | Nenhuma abstração de repositório de sessão |
| `proof.service.ts` | `redis.setex/get` | Nenhuma abstração de repositório de nonce |
| `escrow.service.ts` | `prisma.*` | Nenhuma abstração `EscrowRepository` usada |

---

## 6. Oportunidades de Simplificação

### A. Duplicação de funções utilitárias no SDK (MEDIUM)

#### `stripHexPrefix` — duplicado em 2 arquivos

```
packages/sails-sdk/src/custody/evm-4337.ts (lines 1-5)
packages/sails-sdk/src/custody/escrow-safe-signing.ts (lines 15-20)
```
Definições idênticas, não compartilhadas.

#### `toEthereumSignature` + lógica de recovery-id — algoritmo idêntico em 2 arquivos

```
packages/sails-sdk/src/custody/kms-signer.ts (lines 45-66)
packages/sails-sdk/src/custody/escrow-safe-signing.ts (lines 22-45, ~recoverV)
```
Mesmo loop de brute-force do recovery id, implementações separadas com nomes diferentes (`toEthereumSignature` vs `~recoverV`).

### B. Barrel de índice sem consolidação intermediária (LOW)

```
packages/sails-sdk/src/index.ts
```
Re-exporta explicitamente de submodules (`custody/mulsig-provider`, `modules/open-settlement`, `modules/escrow`) sem que existam barrels intermediários (`custody/index.ts`, `modules/open-settlement/index.ts`). O barrel principal atinge dois níveis de profundidade, aumentando acoplamento a paths internos.

### C. `isPartyOrAgent` declarado mas nunca usado (MEDIUM)

```
packages/sails-sdk/src/modules/escrow/escrow.service.ts (lines 72-81)
```
Método privado `isPartyOrAgent` existe, mas três métodos (`dispute()`, `approveDispute()`, `rejectDispute()`) re-implementam a mesma verificação inline.

### D. Padrão `assertTransition → updateMany → toDto` repetido em 8 métodos (MEDIUM)

```
packages/sails-sdk/src/modules/escrow/escrow.service.ts
```
Oito métodos seguem a mesma sequência de 3 passos — `initiateRelease`, `initiateRefund`, `dispute`, `approveDispute`, `rejectDispute`, `executeRelease`, `executeRefund`, `cancel`. Apenas os literals de status diferem.

### E. Padrão `try { ... } catch { revertPending + throw SailsWorkflowError }` repetido em 7 métodos (MEDIUM)

```
packages/sails-sdk/src/modules/escrow/escrow.service.ts
```
Sete métodos envolvem `claims.upsert`/`updateMany` em try/catch com catch idêntico: `this.claims.revertPending(claimId)` + `throw new SailsWorkflowError(...)`.

### F. Interfaces `EscrowRecord` e `XxxEscrowInput` com sobreposição de campos (LOW)

```
packages/sails-sdk/src/modules/escrow/escrow.service.ts (lines 55-70) — EscrowRecord
packages/sails-sdk/src/custody/multisig.provider.ts (lines 12-18) — MultisigEscrowInput
packages/sails-sdk/src/custody/evm-4337.ts (lines 8-14) — SafeGuardEvmEscrowInput
```
As três definições repetem `buyer`/`seller`/`arbiter`/`amount`/`token`/`tradeId` independentemente — nenhuma deriva de uma base compartilhada.

### G. Barrels triviais (LOW)

```
packages/sails-sdk/src/common/errors/index.ts
packages/sails-sdk/src/config/index.ts
```
Cada barrel re-exporta de apenas um único filho — não consolidam nada.

---

## 7. Mapa de Arquivos por Categoria

```
src/
├── core/                    [3 arquivos] — escrow.service.ts (1,257), handlers.ts (497)
├── modules/                 [15 files] — open-settlement, open-p2p, open-liquidity, open-proof, open-agents
├── common/                  [4 files]  — middleware, events, database, redis
├── infrastructure/          [3 files]  — p2p, custody
├── custody/                 [5 files]  — mulsig, evm-4337, kms-signer, bitcoin-taproot, escrow-safe-signing
└── config/                  [1 file]

packages/sails-sdk/src/
├── client.ts, index.ts
├── modules/    [5 files] — settlement, openp2p, liquidity, proof, reputation
├── custody/    [3 files] — mulsig-provider, evm-4337, kms-signer
└── common/     [2 dirs] — errors, database

packages/sdk-react/src/
├── hooks/    [6 files] — useSails* hooks
├── components/ [2 dirs]
└── client.ts
```

---

## Resumo Executivo

| Categoria | Crítico | Alto | Médio | Total |
|-----------|---------|------|-------|-------|
| Acoplamentos desnecessários | — | 26 (Prisma) | 2 (Redis) | 28 |
| Módulos grandes | 1,257 linhas | 1,497 linhas | — | 2 |
| Responsabilidades misturadas | 1 (6 responsabilidades) | 4 | — | 5 |
| Dependências circulares | 0 | 1 (real) + 1 (latente) | — | 2 pares |
| SOLID violations | — | 11+ (DIP) | 3 (OCP, SRP, ISP) | 14+ |
| Oportunidades de simplificação | — | 2 (isPartyOrAgent, try/catch) | 5 (duplicação, barrel triviais) | 7+ |

### Recomendações Prioritárias (sem implementação)

1. **Extrair `escrow.service.ts`** em pelo menos 4 módulos focados: ciclo de vida, registry de providers, dual-approval, transações pendentes. ✅ **Feito 2026-08-08** — `escrow-providers.ts`, `escrow-lifecycle.ts`, `escrow-dual-approval.ts`, `escrow-pending-tx.ts`; `escrow.service.ts` caiu de 1.257 para 653 linhas, mantendo a classe `EscrowService`/singleton `escrowService` com API pública idêntica (zero mudança em qualquer caller externo).
2. **Quebrar o ciclo real**: `transport-provider.ts ⇄ websocket-relay.service.ts` — introduzir interface `TransportProvider`.
3. **Introduzir repositórios**: `IntentRepository`, `CapabilityGrantRepository`, `TradeRepository`, `EscrowRepository` — dependência via injeção no construtor. **Rollout incremental iniciado 2026-08-08** (menor/mais seguro primeiro, código de fundos reais por último):
   - ✅ **Passo 1 — `CapabilityGrantRepository`** (`src/core/capability-grant-repository.ts`) — os 5 `prisma.capabilityGrant.*` de `capability-registry.ts` movidos verbatim. `capability-registry.ts` virou uma factory function (`createCapabilityRegistry(repo)`, não uma classe — o registry sempre foi um objeto literal, não havia construtor pra adicionar) com o repositório como parâmetro opcional, mesmo padrão de injeção que `DisputeService` já usa para `ArbitrationProvider`. API pública (`capabilityRegistry.grant/check/revoke/listGrants`) idêntica — zero mudança em qualquer caller externo. `tests/capabilityRegistry.test.ts` reescrito: era `jest.mock('../src/common/database', () => ({ prisma: { capabilityGrant: {...} } }))`, agora um objeto fake simples passado direto pra `createCapabilityRegistry(fakeRepo)`, sem mock de módulo.
   - ✅ **Passo 2 — `IntentRepository`** (`src/core/intent-repository.ts`) — os `prisma.intent.*`/`prisma.intentEvent.*` de `intent-engine.ts` (incluindo o `claimTransition()` atômico, mesma proteção contra race condition de `escrow.service.ts`) e o `prisma.intent.findUnique` de `coordination-engine.ts` movidos verbatim. Mesmo padrão de factory function (`createIntentEngine(repo)`/`createCoordinationEngine(repo)`). Testes existentes (`tests/intentFlow.test.ts` etc.) continuam passando sem modificação — mockam `prisma` no nível de módulo, que `intent-repository.ts` compartilha transitivamente.
   - ⏳ **Passo 3 — `TradeRepository`** — pendente, passe separado. Fecha também o item #4 abaixo (as duas violações em rota).
   - ⏳ **Passo 4 — `EscrowRepository`** — pendente, passe separado, por último — código de movimentação real de fundos, precisa da mesma cautela usada na decomposição de `escrow.service.ts` (item #1 acima).
   - Verificado a cada passo: `npx tsc --noEmit` limpo, suíte completa sem regressão (776/776 no passo 2, incluindo os testes já existentes intocados).
4. **Remover Prisma de handlers de rota**: `chat.routes.ts` e `trade.routes.ts` devem chamar `tradeService`/`messageService`. Será fechado junto do passo 3 acima (`TradeRepository`).
5. **Extrair utilitários duplicados no SDK**: `stripHexPrefix`, recovery-id logic → módulo `custody/common.ts`.
6. **Consolidar o padrão de transição de estado**: extrair `assertTransition → updateMany → toDto` e `try/catch(revert)` em métodos auxiliares.
7. **Eliminar `isPartyOrAgent` não usado** e usar o método existente ou extrair um shared validator.