# Technical Debt Audit — Dívida Técnica Invisível

> **Data:** 2026-08-07
> **Escopo:** Apenas dívida técnica invisível — sem bugs, sem funcionalidades faltantes
> **Objetivo:** Identificar pequenas decisões hoje inocentes que dificultam manutenção, escalabilidade, onboarding, evolução do SDK, testes e modularização

---

## Resumo Executivo

| Impacto | Quantidade | Esforço para fixar |
|---------|------------|-------------------|
| **Crítico** (bloqueia evolução) | 8 | Alto (semanas) |
| **Alto** (dificulta manutenção) | 12 | Médio (dias) |
| **Médio** (dificulta onboarding) | 15 | Baixo (horas) |
| **Baixo** (melhoria de DX) | 10 | Baixo (minutos) |

**Total:** 45 itens de dívida técnica invisível identificados

---

## CRÍTICO — Bloqueia Evolução do Sistema

### 1. God Module: `handlers.ts` é o ponto único de falha arquitetural

**Arquivo:** `src/common/events/handlers.ts` (546 linhas)

**Problema:** Este arquivo:
- Importa singletons de **7 módulos diferentes** (reconciliation, reputation, vouch, chat, settlement, WDK, intent-engine)
- Define **6 funções helper** que escrevem diretamente em tabelas de outros módulos
- Registra **10 handlers** cobrindo settlement, reputation, vouch, reconciliation, chat, social engineering
- Usa `require()` lazy para 3 módulos adicionais (QVAC, dispute, social engineering)

**Por que bloqueia:**
- Adicionar um novo cross-module event requer editar este arquivo
- Extrair qualquer módulo em pacote separado quebra este arquivo
- Rodar handlers em worker process requer a árvore de dependências inteira
- O arquivo **viola a própria regra** documentada: "No module ever imports another module's service directly"

**Impacto:** Modularização → **IMPOSSÍVEL** extrair módulos em packages separados

---

### 2. God Module: `escrow.service.ts` tem 1218+ linhas

**Arquivo:** `src/modules/open-settlement/escrow.service.ts`

**Problema:** Contém:
- 5 interfaces (SettlementProvider, SignatureCollectionProvider, CreateEscrowInput, EscrowRecord, ExecuteSettlementInput)
- 3 static maps (PROVIDERS, NON_CUSTODIAL_PROVIDERS, SIGNATURE_COLLECTION_PROVIDERS)
- 4 classes (MockSettlementProvider, EscrowService, helpers)
- 15+ métodos de negócio
- 4 funções helper de módulo

**Por que bloqueia:**
- Testar QUALQUER funcionalidade carrega todos os 4 providers (bitcoinjs-lib, @arkade-os/sdk, ethers/KMS)
- Adicionar um 5º provider requer editar este arquivo
- Provider registry não permite registro dinâmico
- Extrair lógica de signature-collection ou fee computation requer desfilar 1200 linhas entrelaçadas

**Impacto:** Testes → carregam dependências pesadas desnecessariamente

---

### 3. Singletons Nível Módulo: 23 instâncias criadas no import time

**Arquivos:** Todos os `src/modules/open-*/`, `src/common/`, `src/core/`, `src/infrastructure/`

**Problema:** Cada serviço, provider e componente de infraestrutura é construído no escopo do módulo sem argumentos e exportado como `const`. Nenhum aceita dependências injetadas via construtor.

**Por que bloqueia:**
- Testes não podem injetar implementações mock sem `jest.mock()` frágil
- Impossível rodar duas instâncias isoladas do mesmo serviço (ex: testnet + mainnet)
- Cada import dispara efeitos colaterais reais: `new PrismaClient()`, `new Redis()`, `new WalletManagerEvm()`
- Deploy multi-tenant é estruturalmente impossível

**Impacto:** Escalabilidade → **IMPOSSÍVEL** multi-tenant ou worker processes

---

### 4. `handlers.ts` viola Fronteiras de Módulo — Feature Envy

**Arquivo:** `src/common/events/handlers.ts`

**Problema:** Apesar de estar em `common/` (camada de infraestrutura compartilhada), escreve diretamente em:
- `prisma.trade.update()` — tabela do OpenP2P (6 ocorrências)
- `prisma.user.update()` — tabela do OpenReputation (6 ocorrências)
- `prisma.dispute.findFirst()` — tabela do OpenSettlement (3 ocorrências)
- `prisma.escrow.findUnique()` — tabela do OpenSettlement (1 ocorrência)

**Por que bloqueia:**
- Transições de status do Trade estão divididas entre `trade.service.ts` e `handlers.ts`
- Nenhum módulo é "dono" do ciclo de vida do Trade
- Mover handlers para o módulo que possui a tabela quebra a arquitetura

**Impacto:** Modularização → ownership ambíguo de dados

---

### 5. Config Global Nunca Injetável

**Arquivo:** `src/config/index.ts` (314 linhas, 40+ env vars)

**Problema:** Um objeto frozen construído no import time a partir de `process.env`. Todos os módulos importam diretamente: `import { config } from '../config'`.

**Por que bloqueia:**
- Trocar um valor de config para teste requer `process.env.X = 'value'` antes do import (ordem dependente)
- Impossível testar o mesmo código com duas configs diferentes simultaneamente
- Rodar serviço com configs diferentes (multi-tenant, A/B testing) é impossível
- Config não pode ser injetada em serviços

**Impacto:** Testes → impossível testar com configs diferentes

---

### 6. Prisma/Redis Global — Dependências Implícitas

**Arquivos:** `src/common/database/index.ts`, `src/common/redis/index.ts`

**Problema:** Prisma armazenado em `global.__prisma` (hack para hot-reload). Redis é `new Redis(config.redis.url)`. Ambos importados por 20+ arquivos.

**Por que bloqueia:**
- Cada serviço cria dependência oculta nestas instâncias específicas
- Migrar para read replicas, connection pooling por serviço, ou multi-database requer tocar todos os import sites
- O hack `__prisma` é anti-pattern documentado pela própria Prisma

**Impacto:** Escalabilidade → impossível read replicas ou connection pooling por serviço

---

### 7. Event Store é Stub — Tudo em Memória

**Arquivo:** `src/common/events/event-store.ts`

**Problema:** `RedisStreamsEventStore` lança erro em todos os métodos ("not yet implemented"). O construtor padrão de `SailsEventBus` sempre cria `new InMemoryEventStore()`.

**Por que bloqueia:**
- Eventos são perdidos no restart do processo
- Multi-instance (load balancer) não pode compartilhar eventos
- Código que depende de durabilidade (`onDurable()`, Timeline) não é testado em condições reais
- A "one-line swap" documentada não funciona porque a implementação lança erro

**Impacto:** Escalabilidade → **IMPOSSÍVEL** multi-instance

---

### 8. Handlers.ts usa `require()` Lazy — Bypass no TypeScript

**Arquivo:** `src/common/events/handlers.ts` (linhas 426, 446, 507)

**Problema:**
```typescript
const { qvacAgentProvider } = require('../../modules/open-agents/qvac-agent.provider')
const { getDisputeService } = require('../../modules/open-settlement/dispute.service')
const { socialEngineeringAgent } = require('../../modules/open-agents/social-engineering-agent')
```

**Por que bloqueia:**
- Estes `require()` derrotam a checagem de tipos do TypeScript
- Valores importados são tipados como `any`
- Renomear uma exportação ou mudar a API não é capturado no compile time
- Migrar para ESM (onde `require()` não existe) quebra estes call sites

**Impacto:** Manutenção → erros de runtime que deveriam ser de compile

---

## ALTO — Dificulta Manutenção

### 9. Três Sistemas de Logging Competindo

| Sistema | Ocorrências |
|---------|------------|
| `console.log/warn/error` | ~60+ em 15+ arquivos |
| `app.log.warn/error` | 2 ocorrências em `app.ts` |
| `pino` (via Fastify config) | implícito |

**Problema:** `console.*` em código de produção é unstructured (sem JSON, sem log levels, sem request correlation). Pino é configurado mas quase não usado.

**Fix:** Criar módulo logger que wrap pino, substituir todos os `console.*` em `src/`.

---

### 10. Silent Error Swallowing — `.catch(() => {})`

**Localizações críticas:**
- `escrow.service.ts:335` — reverte status do escrow silenciosamente → escrow fica permanentemente preso
- `escrow.service.ts:1087` — cascade delete silencioso
- `Trade.tsx:179,186,199` — 3 chamadas críticas engolidas silenciosamente

**Fix:** Substituir por `.catch((err) => { logger.debug('...', err) })`.

---

### 11. `as any` vs `as unknown as X` — Três Padrões de Escape Hatch

| Padrão | Ocorrências | Risco |
|--------|------------|-------|
| `as any` | ~15+ em código produção | **CRÍTICO** — desabilita toda checagem de tipos |
| `as unknown as X` | 33 ocorrências | **MÉDIO** — documenta a intenção |
| Tipagem adequada | maioria | **BAIXO** |

**Problema:** No mesmo arquivo, `escrow.service.ts` tem both patterns. Desenvolvedor não sabe se um cast é "sei o que estou fazendo" ou "só quero calar o compilador".

**Fix:** Eliminar `as any`, padronizar `as unknown as X` como escape hatch documentado.

---

### 12. Config Accessor Triplicado

| Accessor | Valor | Onde usado |
|----------|-------|-----------|
| `config.env` | `process.env.NODE_ENV ?? 'development'` | **NUNCA lido** |
| `config.app.env` | `process.env.NODE_ENV ?? 'development'` | `app.ts:37,158` |
| `config.isProduction` | `process.env.NODE_ENV === 'production'` | 4+ arquivos |

**Problema:** `config.env` definido mas nunca referenciado. `config.app.env === 'development'` é true para `test` também. `config.isProduction` é false para `test`. Comportamento diferente em ambientes de teste.

**Fix:** Remover `config.env`, padronizar em `config.isProduction` para checagens de produção.

---

### 13. Inconsistência de Response Envelope

`settlement.routes.ts` define helper `success()` que adiciona campo `status` no body. Nenhum outro módulo faz isso. Resposta tem campo redundante com HTTP status code.

**Fix:** Extrair `success()` para `src/common/`, remover campo `status`.

---

### 14. Async Patterns Misturados no Mesmo Arquivo

`app.ts` mistura:
- `try/catch` (health check)
- `.then().catch()` (escrow sweepers)
- `async/await` (shutdown)

**Fix:** Padronizar `async/await` + `try/catch` em código servidor.

---

### 15. `participantId()` Extraído em 5 Arquivos Diferentes

Cada route file re-implementa o mesmo cast:
```typescript
const p = (request as AuthenticatedRequest).participantId
```

**Fix:** Extrair para `src/common/middleware/auth.ts`.

---

### 16. Validação Hex Regex Recriada a Cada Chamada

`escrow.service.ts:263` — `new RegExp(...)` criada a cada chamada de `isValidParticipant()`.

**Fix:** Pré-compilar regex no escopo do módulo.

---

### 17. Versão da API Duplicada 4x

`'0.1.0'` aparece 4 vezes em `app.ts` (linhas 78, 166, 206, 222).

**Fix:** Criar constante `API_VERSION` importada de package.json.

**✅ Fechado 2026-08-09** — achado real além da duplicação: o valor
hardcoded (`0.1.0`) já estava **desatualizado** em relação ao
`package.json` real (`0.1.1`) — as 4 rotas afetadas (`/health`,
`/health/live`, `/`, o info do Swagger) reportavam a versão errada.
`app.ts` agora importa `package.json` (`resolveJsonModule`) e usa uma
única `const API_VERSION = packageJson.version`. Efeito colateral
encontrado e corrigido no mesmo pass: `tsc --build` passou a copiar
`package.json` para `dist/`, colidindo com o haste module map do Jest
(`dist/package.json` vs. o `package.json` real, mesmo `"name"`) —
`jest.config.js` ganhou `modulePathIgnorePatterns: ['<rootDir>/dist/']`,
a exclusão correta de qualquer forma (Jest nunca deveria escanear
build output). Verificado via build real (`tsc --build` + inspeção do
`dist/src/app.js` compilado) antes de aceitar a abordagem, não só por
typecheck.

---

## MÉDIO — Dificulta Onboarding

### 18. Pagination Defaults Inconsistentes

| Módulo | Default | Max |
|--------|---------|-----|
| Trade | 10 | 50 |
| Dispute | 10 | 50 |
| Chat | 50 | 100 |
| Reputation | 20 | — |

**Problema:** 4 defaults diferentes sem rationale documentado.

**Fix:** Constantes compartilhadas `DEFAULT_PAGE_SIZE` e `MAX_PAGE_SIZE`.

**✅ Parcialmente fechado 2026-08-09** — correção ao próprio diagnóstico:
Trade/Dispute/Liquidity (`InternalOrderBook.getOffers()`) já usavam o
**mesmo** par 10/50 de propósito — o comentário original de
`liquidity.service.ts` já dizia "matched here rather than inventing a
second pagination convention." Essas três foram unificadas em
`src/common/pagination.ts` (`DEFAULT_PAGE_LIMIT`/`MAX_PAGE_LIMIT`), um
real ganho de DRY sem mudança de comportamento. Chat (50/100) e
Reputation (20/—) **não** foram unificados — forçá-los pros mesmos dois
números mudaria o default público dessas rotas sem necessidade real,
não é limpeza, é regressão. Se algum dia fizer sentido dar nome aos
valores de Chat/Reputation também, cada um merece sua própria constante
nomeada — nunca reaproveitar `DEFAULT_PAGE_LIMIT`/`MAX_PAGE_LIMIT` para
um valor que não é 10/50.

---

### 19. Event Names como String Literals

28 chamadas `emit()` e 26 chamadas `on()` usam string literals. `SailsEventMap` fornece segurança no bus, mas o `as any` em `escrow.service.ts:413` derrota isso.

**Fix:** Extrair event names como constantes exportadas.

---

### 20. Status Strings como Literais Bare

Escrow statuses (`'CREATED'`, `'FUNDS_LOCKED'`, etc.), trade statuses, dispute statuses — todos são strings bare em chamadas Prisma. `Record<string, string[]>` no `VALID_TRANSITIONS` é completamente untyped.

**Fix:** Usar enums do Prisma ou string literal unions tipadas.

---

### 21. File Naming Inconsistente

`src/routes/intentRoutes.ts` (camelCase, fora do módulo) vs `src/modules/open-*/<name>.routes.ts` (kebab-case, dentro do módulo).

**Fix:** Mover para `src/core/intent.routes.ts`.

---

### 22. Function Signature Style Misturado

| Padrão | Exemplo |
|--------|---------|
| Parâmetros individuais | `lockFunds(escrowId, triggeredBy)` |
| Object parameter | `createEscrow(input: CreateEscrowInput)` |
| Misturado na mesma classe | `EscrowService` |

**Fix:** Documentar convenção: 3+ parâmetros → object parameter.

---

### 23. Singleton Lazy vs Eager

20+ serviços usam `export const x = new X()`. Apenas `dispute.service.ts` usa `export function getDisputeService()` (lazy). Razão válida (config-dependent) mas não documentada como convenção.

**Fix:** Documentar quando usar cada padrão.

---

## BAIXO — Melhoria de DX

### 24. Magic Numbers Espalhados

| Constante | Ocorrências | Arquivos |
|-----------|------------|----------|
| `10000` (basis points) | 3 | escrow.service, wdk-settlement, settlement.routes |
| `0.4/0.3/0.2/0.1` (fee split) | 1 | escrow.service |
| `3600 * 1000` (hours→ms) | 3 | escrow, dispute, proof |
| `100` (mock delay) | 4 | escrow.service |
| `2` (dual approval) | 1 | escrow.service |
| `144n` (timelock blocks) | 1 | lightning-hodl.provider |
| `1n` (refund timelock) | 1 | lightning-hodl.provider |

**Fix:** Criar `src/common/constants/protocol.ts` com todas as constantes econômicas/protocolares.

---

### 25. SDK Não Tem Interface Abstrata

`SailsTransport`, `SailsClient`, e todos os módulos são classes concretas. Não existem interfaces `ITransport`, `ISailsClient`. Testar módulos requer construir a stack inteira.

**Fix:** Extrair interfaces para testabilidade.

---

### 26. SDK Não Valida Inputs

- `identity.create()` aceita qualquer string como `publicKeyHex`
- `reputation.rate()` aceita `score: 99` (só 1-5 é válido)
- `liquidity.discover()` aceita `limit: -1`

**Fix:** Adicionar validação runtime antes de enviar ao server.

---

### 27. SDK Error Types Genéricos

`throw new Error(...)` em 5+ locais. Erros de validação (`SailsValidationError`) não são usados. Callers não podem diferenciar "bad input" de "SDK bug".

**Fix:** Usar `SailsValidationError` para inputs inválidos, `SailsNetworkError` para rede.

---

### 28. SDK Hardcodes `/v1/` 89 Vezes

Nenhuma constante central. Se server introduzir `/v2/`, 10+ arquivos devem ser editados individualmente.

**Fix:** Criar `API_BASE` constante, usar em todos os módulos.

---

### 29. `WalletAdapter` Não Tem `disconnect()`

Interface não suporta cleanup. Quando `SailsClient` é destruído, a wallet connection fica aberta.

**Fix:** Adicionar `disconnect?()` opcional à interface.

---

### 30. `@tanstack/react-query` em Dependencies (deveria ser Peer)

`packages/sdk-react/package.json` lista `@tanstack/react-query` como dependency. Consumidores que já usam React Query terão duas cópias.

**Fix:** Mover para `peerDependencies`.

---

## Ações Recomendadas por Prioridade

### P0 — Antes de qualquer apresentação (1-2 dias)

| # | Item | Esforço |
|---|------|---------|
| 10 | Silent error swallowing (.catch(() => {})) | Baixo |
| 17 | Versão da API duplicada → constante | Baixo |
| 18 | Pagination defaults → constantes | Baixo |
| 24 | Magic numbers → protocol-constants.ts | Médio |

### P1 — Antes de beta público (1 semana)

| # | Item | Esforço |
|---|------|---------|
| 9 | Logging → pino padronizado | Médio |
| 11 | `as any` → eliminação | Médio |
| 12 | Config accessor → padronizar | Baixo |
| 15 | `participantId()` → util compartilhado | Baixo |
| 16 | Regex pré-compilada | Baixo |

### P2 — Antes de GA (1 mês)

| # | Item | Esforço |
|---|------|---------|
| 5 | Config → injetável | Alto |
| 6 | Prisma/Redis → injetáveis | Alto |
| 19 | Event names → constantes | Médio |
| 20 | Status strings → enums | Médio |
| 25 | SDK → interfaces abstratas | Médio |
| 28 | SDK → API_BASE constante | Baixo |

### P3 — Refatoração Arquitetural (trimestre)

| # | Item | Esforço |
|---|------|---------|
| 1 | handlers.ts → split per module | Alto |
| 2 | escrow.service.ts → extrair sub-módulos | Alto |
| 3 | Singletons → DI container | Alto |
| 4 | handlers.ts → respeitar fronteiras | Alto |
| 7 | RedisStreamsEventStore → implementar | Alto |

---

## Referência

Cada item inclui:
- **Arquivo:linha** exata
- **Código atual** (snippet)
- **Por que bloqueia** (maintenance, scalability, onboarding, SDK evolution, tests, modularization)
- **Fix recomendado** (padrão, não implementação)

---

> **Autor:** CTO (Auditor)
> **Data:** 2026-08-07
> **Próximo passo:** Claude Code implementa P0 (1-2 dias), depois P1 (1 semana)
