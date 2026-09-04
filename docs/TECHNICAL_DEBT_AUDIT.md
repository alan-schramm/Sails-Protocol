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

**Total:** 45 itens de dívida técnica invisível identificados no
levantamento original de 2026-08-07 (tabela acima, itens classificados
na escala Crítico/Alto/Médio/Baixo).

**Nota — 2026-09-04 (Independent Master Backlog Audit), contagem
verificada diretamente da fonte, não assumida.** Este documento foi
posteriormente estendido por missões subsequentes (Mission 9, Missão
M8.5, Missão 11, Durable Protocol Truth, entre outras) que registraram
itens adicionais numerados até o **item #50** — verificado por contagem
direta dos cabeçalhos `### N.` deste arquivo, sequencial, sem lacunas.
Esses itens adicionais (aproximadamente #31-#50) usam seu próprio
vocabulário de classificação específico da missão que os registrou
(ex.: "débito arquitetural reconhecido", "POSSIBLE VIOLATION",
"débito de superfície de leitura") em vez da escala Crítico/Alto/Médio/
Baixo da tabela acima — deliberadamente não forçados nela nesta
correção, para não fabricar uma classificação de severidade que a
missão original que os registrou nunca atribuiu. A tabela acima
permanece precisa para o escopo do levantamento original de
2026-08-07; ela nunca pretendeu, e não deve ser lida como, cobrindo
o total atual de itens registrados neste documento.

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

### 21. File Naming Inconsistente ✅ RESOLVIDO 2026-08-10

~~`src/routes/intentRoutes.ts` (camelCase, fora do módulo) vs `src/modules/open-*/<name>.routes.ts` (kebab-case, dentro do módulo).~~

Movido para `src/core/intent.routes.ts` — consistente com toda a
convenção `<name>.routes.ts` co-localizada no módulo/core dono do
código (Intent é primitivo Core, não um módulo `open-*`).

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

### 31. SDK: `SailsSettlementModule.getArbiterProfile()`/`ArbiterProfile` duplicam `SailsArbitrationModule` com tipos errados

Achado durante a Missão 11 Fase 9.3.4, registrado na Fase 9.3.5 e
**corrigido nesta entrada na Fase 9.3.6** — o nome do método e o status
de "morto" declarados na versão original desta entrada estavam ambos
errados, e essa correção só apareceu por acidente: investigando o
contrato público de `ReputationScore` (item de dívida separado, ver
`docs/PROTOCOL_INVARIANTS.md`'s `INV-OP-10`/`SECURITY_MODEL.md` §4.7),
`tests/modules.test.ts` (SDK) apareceu com um teste real, passando,
chamando exatamente este método contra uma URL real — provando
diretamente que a alegação original ("zero chamadas, confirmado via
grep") estava errada. Mesma lição desta fase inteira: nunca confiar em
"confirmado via grep" de uma sessão anterior sem re-verificar.

`packages/sails-sdk/src/modules/settlement.ts` tem um método real,
testado e alcançável — `getArbiterProfile()` (não
`getArbitrationProfile()`, nome que nunca existiu no código; erro de
digitação/memória da Fase 9.3.4, propagado sem verificação até aqui) —
e um tipo `ArbiterProfile`, que duplicam `SailsArbitrationModule.
getProfile()`/`ArbiterCandidate` (`packages/sails-sdk/src/modules/
arbitration.ts`): **ambos batem exatamente nas mesmas duas rotas reais**
(`POST /v1/settlement/arbitration/register`,
`GET /v1/settlement/arbitration/profile/:participantId`) — mas
`ArbiterProfile` usa nomes de campo errados: `reputationScore`/
`activeDisputes`/`registeredAt` em vez dos campos reais que
`market-arbitration.provider.ts`'s `toCandidate()` de fato retorna
(`arbiterReputation`/`effectiveStake`/`cumulativeFeesObserved`) — a
mesma classe de bug que `ReputationScore` tinha (nomes de campo que nunca
corresponderam à resposta real do servidor). `tests/modules.test.ts`
exercita ambos os caminhos (`registerArbiter()`/`getArbiterProfile()`
com o tipo errado, `SailsArbitrationModule.register()`/`getProfile()`
com o tipo certo) contra o mesmo par de rotas — os testes passam porque
são autoconsistentes com o mock, não porque a forma está certa. Não é
referência circular nem risco de segurança — é uma superfície pública
duplicada e alcançável, com um dos dois lados usando nomes de campo que
nunca corresponderam à resposta real do servidor.

**Fix:** consolidar em `SailsArbitrationModule`/`ArbiterCandidate` (a
forma correta) e remover `getArbiterProfile()`/`registerArbiter()`/
`ArbiterProfile` de `settlement.ts`, ou corrigir os nomes de campo de
`ArbiterProfile` para bater com a resposta real — numa passada de
limpeza de release/API separada, não sob um mandato de contract-
integrity pontual (fora do escopo da Missão 11 Fase 9.3.6, cujo mandato
era exclusivamente `reputation.service.ts`/`ReputationScore`). Deixado
intocado nesta fase por instrução explícita do CTO.

---

### 32. Reconciliação de crash-recovery (INV-OP-11) — verdade-autoritativa do fund movement só cobre MULTISIG; catch-up de efeitos downstream (C5) já cobre todas as rails

Achado na Missão 11 Fase 9.6, refinado na Fase 9.7 depois que o
mecanismo de reconciliação ganhou um segundo pass. Duas perguntas
DIFERENTES, escopos DIFERENTES:

**Pergunta 1 — "o movimento real de fundos aconteceu?"** (`txReleaseId`
ainda nulo). Só MULTISIG tem uma primitiva de verdade-autoritativa
construída (`multisig.provider.ts`'s `reconcilePendingSettlement()`,
verdade on-chain do Bitcoin). Para `MOCK`/`WDK_USDT_EVM` (caminho de
chamada direta, sem transação independentemente reconstruível
persistida) e `LIGHTNING_HODL`/`SAFE_GUARD_EVM` (rails de assinatura-
colaborativa estruturalmente iguais ao MULTISIG, mas sem uma primitiva
equivalente construída ainda), o mecanismo sinaliza
`requiresManualReview` — nunca tenta recuperação automática, por design
(fail-closed é explicitamente preferível a um replay inseguro).
**Ainda fora de escopo — sem mudança na Fase 9.7.**

**Pergunta 2 — "os efeitos downstream de um settlement já confirmado
rodaram?" (C5, `txReleaseId` já setado).** Esta pergunta **não precisa**
de nenhuma primitiva de verdade específica de rail (o movimento de
fundos já é um fato confirmado — só falta saber se a obrigação de taxa/
Trade.status/reputação/volume/evento já foram aplicados). Fechado para
**todas as rails** na Fase 9.7 (`reconcileMissingCompletionEffects()`,
guardado pela própria idempotência atômica de `emitEscrowTransition()`
— ver `docs/PROTOCOL_INVARIANTS.md`'s `INV-OP-11`, extensão C5). Uma
limitação genuína e divulgada permanece: um SPLIT de rail de chamada
direta sem `EscrowPendingTransaction` sobrevivente não consegue
recuperar seu `buyerBps` (nunca persistido em lugar nenhum nesse
caminho) — a obrigação de taxa é explicitamente PULADA e sinalizada
para revisão manual nesse caso específico, nunca adivinhada.

**Fix restante:** construir uma primitiva de verdade-autoritativa
análoga à do MULTISIG para cada rail (Pergunta 1) antes de qualquer
ativação de produção real nesses tipos de escrow — para EVM, consultar
o próprio chain por hash/nonce esperado; para Lightning HODL/VTXOs, um
mecanismo próprio ainda não desenhado. Fora do escopo desta fase (que
era MULTISIG-only para a Pergunta 1, per instrução explícita do CTO —
"não toque em Lightning/EVM architecture").

### 33. `INV-12` (Attributed Authority Integrity, Missão 12) — execução de ruling de árbitro/QVAC não é verificável independentemente da própria assinatura do servidor

**Corrigido/Implementado 2026-08-29 (Missão 13 Fase 2), rail MULTISIG.**
Ambos os POSSIBLE VIOLATION abaixo foram fechados: `dispute.service.ts`'s
`resolveDispute()` agora EXIGE uma decisão de autoridade assinada
(`arbitration-authority.ts`'s `AuthorityDecisionPayload`, Ed25519,
reutilizando a identidade já registrada do árbitro em `User.publicKey` —
nenhum tipo de chave novo) e verifica essa assinatura, independentemente
do servidor, antes de invocar qualquer ação de settlement — um chamador
que apenas afirma ser o árbitro (`arbiterId` batendo no banco) sem uma
assinatura válida é recusado (`ForbiddenError`), nunca cai de volta para
confiar no corpo da requisição. `sweepExpiredAutoResolutions()` (a
automação QVAC) foi rebaixada para apenas advisory: uma recomendação
expirada e não contestada agora reverte a disputa para
`EVIDENCE_SUBMITTED` (exigindo uma decisão humana real assinada), em vez
de executar sozinha usando a chave server-derived do árbitro — fecha o
segundo POSSIBLE VIOLATION pela mesma causa raiz, sem exigir nenhuma
mudança de threshold/contest-window/policy-gating. Alvo de segurança
explicitamente perseguido foi TARGET 1 (Atribuição Verificável), não
TARGET 2 (Impossibilidade Criptográfica) — `INV-12`'s próprio texto e
NON-REQUIREMENTS não exigem mais que isso (Missão 13 Fase 1/1B
confirmaram essa leitura antes da implementação, incluindo uma pesquisa
real sobre Bisq/Hodl Hodl/DLC/Taproot/MuSig2/adaptor signatures que
concluiu por manter o desenho atual em vez de adotar qualquer um deles
por inteiro). Testado: `tests/arbitrationAuthority.test.ts` (26 testes,
incluindo substituição de outcome/SPLIT, replay cross-dispute/escrow/
appeal-round, forja de assinatura), `tests/arbitrationAuthoritySdkParity.test.ts`
(paridade byte-a-byte servidor↔SDK + interoperabilidade criptográfica
real), mais os testes de integração em `dispute.service.ts` já
existentes atualizados. SDK: `resolveDisputeWithWallet()` (novo,
`packages/sails-sdk/src/modules/settlement.ts`) constrói e assina a
decisão automaticamente via `wallet.signMessage()` — a chave privada do
chamador nunca sai da própria wallet. **Gap residual, disclosed, não
escondido:** o console de árbitro do `sails-ui` (`Disputes.tsx`) ainda
não tem infraestrutura de wallet/assinatura nenhuma — as ações de
resolver disputa falham com um erro claro em vez de silenciosamente,
mas não funcionam de fato até uma sessão dedicada de UI decidir onde a
chave de assinatura do árbitro deve viver nesse console de referência
(tarefa já sinalizada separadamente). Rails além de MULTISIG
(LIGHTNING_HODL/SAFE_GUARD_EVM) não foram tocados nesta passada — fora
de escopo explícito do mandato da Fase 2.

Achado pela Missão 12 (Testes de Constituição/Red Team, Fases 6.1–7T),
fechado normativamente com a adição de `INV-12` em
`docs/PROTOCOL_INVARIANTS.md` — este item registra o **débito de
implementação** que `INV-12` agora torna explicitamente não-conformante,
sem redesenhar nada.

**`multisig.provider.ts`'s `deriveArbiterKey()`** deriva a chave privada
do árbitro sob demanda, a partir de `MULTISIG_SEED` (uma seed única do
servidor) mais o `arbiterId`, e o próprio servidor assina diretamente
toda liberação/reembolso/split em status `DISPUTED`
(`multisig.provider.ts` — os três branches `DISPUTED` de
`buildUnsignedRelease`/`Refund`/`Split`). Não existe nenhum registro,
checável por um terceiro que não o próprio servidor, de que a
assinatura produzida corresponde à decisão real do árbitro nomeado —
`INV-12`'s EXAMPLE FAIL descreve exatamente este caso. **Classificação:
POSSIBLE VIOLATION** de `INV-12` (o caminho feliz MULTISIG, buyer+seller,
permanece plenamente conformante — a não-conformidade é específica ao
caminho disputado).

**`dispute.service.ts`'s `proposeAutoResolution()`/
`sweepExpiredAutoResolutions()`** (automação QVAC de disputa, opt-in,
off por padrão, confidence-gated, contestável) executa um REFUND
automatizado usando a mesma chave server-derived do árbitro já
designado, sem nenhum vínculo criptográfico verificável entre a
recomendação do modelo e a execução resultante além do registro interno
do próprio servidor. **Classificação: POSSIBLE VIOLATION**, mesma causa
raiz do item acima — nenhuma mudança seria necessária no design de
threshold/contest-window/policy-gating já existente, apenas na camada
de execução.

**Fix restante:** dar ao árbitro (humano ou o slot que a automação
QVAC herda) uma capacidade de assinatura verificável e distinta da do
servidor — ex.: uma credencial de delegação assinada e escopada com a
própria identidade Ed25519 já registrada do árbitro, que um terceiro
possa checar contra a execução real — sem exigir que o árbitro detenha
diretamente a chave secp256k1 do script (`INV-12`'s NON-REQUIREMENTS
já permite isso explicitamente). Fora do escopo da Missão 12 (que era
constitucional, não de remediação de implementação).

### 34. Ausência de mecanismo formal de identidade de versão publicada (Constitutional Closure, Missão 12)

Achado pela Missão 12 (Fase 6.2, reconfirmado nas Fases 7/7T) e agora
normativamente reconhecido na extensão da Structural Invariant 5
("Constitutional Closure") em `docs/PROTOCOL_INVARIANTS.md`. Hoje não
existe um conjunto declarado e fechado de artefatos que constitua "Sails
vX" — `PROTOCOL_SPECIFICATION.md` tem seu próprio número de versão
(v7.1) na capa, mas isso não amarra a nenhuma versão de
`PROTOCOL_INVARIANTS.md`, nenhum conjunto de RFCs, nenhum commit
específico do SDK. Isso não refuta a propriedade de Closure (o mesmo
princípio que já se aplica à violação de custódia do WDK — a
Constituição julga a implementação, a implementação não define a
Constituição) — é uma dependência de remediação em camada inferior
(Especificação/Governança), disclosed aqui, não escondida.

**Fix restante:** definir, em `PROTOCOL_SPECIFICATION.md` ou
`GOVERNANCE.md`, o conjunto exato de artefatos (e sua forma de
incorporação/resolução de conflito) que constitui uma versão lançada do
Sails — deliberadamente fora do escopo da Missão 12, que estabeleceu
apenas o princípio constitucional (nenhuma hierarquia normativa
universal foi codificada; ver `INV-12`'s vizinho na Structural
Invariant 5 e a rejeição explícita de `Constitution > Specification >
RFC > Schema` como ordenação fixa).

### 35. Classificação do Arbiter como ator não está ancorada em nenhuma taxonomia formal (Semantic Kernel, 2026-08-29)

Achado durante o processo de Semantic Kernel Discovery/Red Team/Final
Validation que produziu `docs/SEMANTIC_KERNEL.md`. `PROTOCOL_SPECIFICATION.md`
§1.9 descreve o Arbiter como "a genuinely new actor" e o
`ArbitrationProvider` como "registered per application (not a
protocol-native role)" — nunca classificando formalmente o Arbiter como
`Participant` (RFC-001), `Agent`, ou qualquer outra categoria de ator
definida. **K2** (`SEMANTIC_KERNEL.md` §6, "Attributed Discretion") exige
que uma decisão discricionária seja atribuível a "um ator específico,"
mas a Especificação nunca ancora essa expressão a uma taxonomia concreta
de ator para o Arbiter especificamente.

**Classificação:** ambiguidade de especificação (não é uma contradição
normativa — nada no texto atual viola K2/INV-12; apenas nunca resolve a
pergunta "que TIPO de ator é o Arbiter" de forma explícita).

**Fix restante:** decidir, em `PROTOCOL_SPECIFICATION.md` ou um RFC
dedicado, se o Arbiter é uma subcategoria de `Participant`, uma categoria
própria e nomeada, ou permanece deliberadamente não tipado — uma decisão
normativa real, fora do escopo do processo de Semantic Kernel (que é
descritivo, não normativo) e não inventada nesta auditoria.

### 36. Cobertura adversarial de K2 (Attributed Discretion) além de MULTISIG não está demonstrada (Semantic Kernel, 2026-08-29)

O mesmo processo confirmou, via leitura direta de código, que o portão de
verificação em `dispute.service.ts`'s `resolveDispute()` — a
implementação real de **K2**/`INV-12` — executa de forma incondicional
para toda resolução de disputa, independente do `EscrowType` do escrow
(o branch em `applyRuling()` que escolhe entre execução direta e
`initiateRelease`/`initiateRefund`/`initiateSplit` acontece DEPOIS do
portão de verificação, não antes). Ou seja, o código em si já não é
MULTISIG-específico neste ponto.

O que permanece genuinamente limitado a MULTISIG é a **cobertura de teste
adversarial dedicada** (`tests/arbitrationAuthority.test.ts`'s cenários
de substituição/replay/forja) e a disciplina de STOP GATE da Missão 13
Fase 2, que restringiu escopo de revisão detalhada a essa rail
especificamente.

**Classificação:** débito de cobertura de teste, não de implementação.

**Fix restante:** estender `tests/arbitrationAuthority.test.ts` (ou um
arquivo irmão) com os mesmos cenários adversariais já cobertos para
MULTISIG, exercitando explicitamente LIGHTNING_HODL e SAFE_GUARD_EVM via
`resolveDispute()`, para fechar a lacuna entre "o código já é
rail-agnóstico" e "isso foi verificado adversarialmente para cada rail."

### 37. Sails Core Architecture congelada em `docs/CORE_ARCHITECTURE.md`, mas sem nenhuma implementação (2026-08-29)

Achado ao final do processo de Sails Core Architecture (Fases 1 → 3.1)
que produziu `docs/CORE_ARCHITECTURE.md`. A arquitetura de software
(Pure Core / Runtime / Modules / Providers, os quatro estados de
`ConditionResult`, o modelo de Transition Record/Outcome, as nove regras
finais) está congelada, mas nenhum código foi escrito — `@sails/core`
continua não autorizado. O gap register do próprio documento (§44,
G1-G15) já lista os itens concretos; este item existe apenas para que
`TECHNICAL_DEBT_AUDIT.md` (que outros times consultam primeiro) não
fique silenciosamente desatualizado em relação a esse novo documento.

**Itens de maior prioridade do gap register** (ver `docs/CORE_ARCHITECTURE.md`
§44 para a lista completa): ausência de mecanismo de identidade/versão de
ruleset (G1); ausência do "Canonical Semantic Profile" necessário para
conformidade cross-language (G2); ausência de um artefato de Transition
Record/Decision (G3) — hoje o State machine só produz atualizações de
status brutas; ausência de mecanismo de commitment para referências de
State/ruleset/Assertion (G4).

**Classificação:** débito de arquitetura reconhecido e disclosed, não
escondido — a própria `docs/CORE_ARCHITECTURE.md` §43 já documenta o
mapeamento honesto ALIGNED/PARTIAL/MISSING contra o código real.

**Fix restante:** um programa futuro e separado, "Sails Core
Implementation Architecture" (representação concreta, boundary
Core/Runtime, migração do código atual) — deliberadamente não iniciado
por esta auditoria nem pela missão que congelou a arquitetura.

### 38. Sails Core Implementation Architecture congelada em `docs/CORE_IMPLEMENTATION_ARCHITECTURE.md`, ferramental ainda não existe (2026-08-29)

O item 37 acima já está fechado: o programa "Sails Core Implementation
Architecture" (Fases 1 → 3.1) que ele previa foi concluído e produziu
`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md`. A arquitetura de
representação/boundary/migração está congelada, mas nenhuma das três
peças de ferramental que ela exige ainda existe no repositório:

- ~~**Boundary mecânico do Pure Core** (§17 do documento)~~ — **FECHADO
  2026-08-29** (Core Implementation Program, Fase 1 — M0). `packages/sails-core`
  existe como workspace interno não publicado (`"private": true`),
  zero dependências de runtime. `scripts/check-core-boundary.ts`
  (nenhuma dependência nova instalada — usa o `typescript` já existente
  via sua própria Compiler API) rejeita mecanicamente qualquer import
  não-relativo, `require(...)`, `import()` dinâmico, e qualquer
  referência a globals ambiente (`process`, `fetch`, `Date.now()`/`new
  Date()` sem argumento, timers, `Math.random`) — validado com uma
  violação real e temporária (`@prisma/client` + `Date.now()` +
  `process.env`) confirmando rejeição em ambas as camadas antes de ser
  removida. `tsconfig.json` do pacote (`"types": []`, sem `"DOM"`) dá
  uma segunda camada independente: o `tsc --noEmit` do próprio pacote já
  falha ao referenciar `process`, sem depender do checker. Cobertura de
  teste: `tests/coreBoundaryCheck.test.ts` (fixtures `.ts.fixture`,
  nunca compiladas de verdade) + verificação direta de
  `packages/sails-core/src` real, todas passando. Ver
  `packages/sails-core/README.md` para os comandos.
- ~~**Publicação da Canonical Evaluator Identity** (§5-6)~~ — **PARCIALMENTE
  FECHADO 2026-08-29** (Core Implementation Program, Fase 2 — M2). O
  mecanismo repositório-local agora existe e está demonstrado para um
  evaluator real: `conformance/evaluators/*.json` (definição semântica
  pública, machine-addressable, versionada, nunca dependente de source
  TypeScript) + `conformance/profiles/*.json` (Canonical Semantic
  Profile mínimo) + `conformance/vectors/*.vectors.json` (vetores JSON
  puro, sem valores TypeScript-only) + `scripts/run-conformance-harness.ts`
  (fora do boundary do Pure Core — faz I/O de arquivo). Testado
  adversarialmente: um evaluator com a identidade correta mas
  comportamento incorreto (`>` em vez de `>=`, e um "identity spoofing"
  puro) é corretamente reconhecido-mas-não-conformante. **O que
  permanece genuinamente aberto**: isto é publicação *repositório-local*
  (git), não um processo de publicação/governança externo — evitando
  virar um ponto de interpretação privada exige que esse processo
  externo exista, o mesmo risco já documentado no item 35 sobre o
  Arbiter. Ver `conformance/README.md`.
- **Ferramental de Ruleset Admission** (§23) — ainda **ABERTO**. M2
  deliberadamente não implementou a camada de reconhecimento de
  governança (decidir se uma combinação Ruleset/Evaluator/Profile é
  *confiável*) — apenas a verificação estrutural pura do Core
  (`checkRulesetBinding`, já existente desde M1) e o mecanismo de
  *resolução* (`recognized`, via `checkEvaluatorConformance`) existem.
  "Resolvível" e "confiável para uso" continuam sendo fatos distintos,
  intencionalmente não colapsados.

**Classificação:** débito de arquitetura reconhecido e disclosed, não
escondido — nenhum destes bloqueia o início da migração em M0 (o
boundary mecânico é justamente o primeiro passo do próprio
`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §29).

**Fix restante:** parte do futuro "SAILS CORE IMPLEMENTATION PROGRAM —
PHASE 1 — MECHANICAL BOUNDARY & SEMANTIC MODEL FOUNDATION" —
deliberadamente não iniciado por esta auditoria nem pela missão que
congelou a arquitetura de implementação.

### 39. Destination Authority arquiteturalmente resolvida, remediação ainda não implementada (Mission M8.5, 2026-08-30)

Achado pela Missão M8 (Provider Dispatch Gate) e resolvido no nível de
arquitetura pela Missão M8.5: `dispute.service.ts`'s `resolveDispute()`
aceita `releaseToAddress`/`refundToAddress` do próprio pedido do
**árbitro**, e `escrow-lifecycle.ts`'s `resolvePayoutAddress()` deixa
esse valor sobrescrever incondicionalmente o `PayoutAddress` já
registrado do beneficiário, sem nenhum traço à autorização verificada do
próprio beneficiário — uma instância real, não hipotética, de
`INV-01` (ver a anotação adicionada a esse invariante,
`docs/PROTOCOL_INVARIANTS.md`). `docs/DESTINATION_AUTHORITY_ARCHITECTURE.md`
define o modelo que fecha isso (Economic Disposition Authority ≠
Destination Authority, reaproveitando o primitivo de Attribution já
construído em M5 — zero mudança de Kernel ou Core).

**Classificação:** débito de implementação, não de arquitetura — a
arquitetura já está congelada e validada; o código de `resolveDispute()`/
`applyRuling()` ainda não foi alterado.

**Fix restante:** implementar o remendo descrito em
`docs/DESTINATION_AUTHORITY_ARCHITECTURE.md` §16 (parar de aceitar o
parâmetro de destino do árbitro; resolver e capturar o `PayoutAddress`
do beneficiário no momento do commit do Outcome) — bloqueado apenas por
uma decisão de produto ainda pendente sobre disputas legadas em voo
(mesmo documento, §14) — e só então retomar a Missão M8-R.

**Corrigido/Parcialmente remediado — escopo por rail 2026-09-04
(Independent Master Backlog Audit, verificado diretamente contra
`dispute.service.ts` na baseline `c9812a8`).** O achado acima estava
correto na sua baseline original (Missão M8.5, 2026-08-30) e permanece
preservado sem alteração — a Missão M8-R, executada depois, de fato
retomou o trabalho e fechou este débito **apenas para o rail MULTISIG**.
Verificação direta, rail por rail:

- **MULTISIG — remediação implementada.** `resolveDispute()` bifurca
  para `applyRulingCoreAuthoritative()` (`dispute.service.ts:415-421`)
  quando `escrowForBranch.type === 'MULTISIG'`. O parâmetro legado
  `releaseToAddress`/`refundToAddress` ainda pode entrar em
  `resolveDispute()` (a assinatura pública não foi alterada, por
  decisão deliberada — ver o comentário `@deprecated for MULTISIG` no
  próprio `resolveDispute()`), mas está **estruturalmente ausente** dos
  parâmetros de `applyRulingCoreAuthoritative()` — não pode alcançar a
  execução econômica deste rail de forma alguma. A autoridade de
  Outcome + DestinationBinding é Core-autoritativa para este caminho: o
  commit durável (Outcome + snapshot do destino, `commitAuthoritativeDisputeRuling()`)
  "STRICTLY PRECEDES dispatch-eligibility evaluation, which STRICTLY
  PRECEDES calling any settlement action" (comentário do próprio
  método). Comprovado por `tests/disputeOutcomeMultisig.test.ts`'s
  casos "wrong legacy parameter is ignored". **Isto não demonstra
  verificabilidade independente do destino** — apenas que o árbitro não
  tem mais poder de override; ver a distinção com o property gap
  separado citado abaixo.
- **LIGHTNING_HODL / SAFE_GUARD_EVM — achado original permanece
  integralmente válido, não remediado.** Ambos continuam no caminho
  legado `applyRuling()`, byte-for-byte inalterado desde a baseline
  original. O destino fornecido pelo árbitro/chamador **ainda afeta a
  execução econômica real** — o próprio código documenta isso como
  "fully authoritative by this file's own documented boundary"
  (`dispute.service.ts:335`). A remediação de Destination Authority
  **não** é Core-autoritativa para nenhum dos dois.
- **WDK_USDT_EVM — assimetria real entre RELEASE e REFUND, preservada
  sem achatamento.** RELEASE: o destino fornecido pelo árbitro/chamador
  permanece economicamente efetivo (`escrowService.releaseFunds()`,
  mesmo caminho legado). REFUND: o destino **não** é escolhido pelo
  chamador pelo mesmo mecanismo — `refundFunds()` não aceita parâmetro
  de endereço algum, sempre envia para `treasuryAccount()`
  (`wdk-settlement.provider.ts:167-177`, verificado diretamente) — a
  semântica é fixa/tesouraria, não um destino arbitrário do árbitro.
- **MOCK — mesmo comportamento legado de RELEASE que WDK_USDT_EVM**,
  mesmo branch de código (`needsSignatureCollection === false`); não
  reivindicado além do que a evidência sustenta.

**Distinto de, e não equivalente a**, o property gap separado
`Independent Verifiability of Authority → Outcome → Destination
Binding` (`docs/DURABLE_PROTOCOL_TRUTH_EVIDENCE.md`, `docs/BACKLOG.md`
"Known Debt" — permanece **OPEN PROPERTY GAP**, não afetado por esta
atualização). Aquele item pergunta se um terceiro pode *provar*, de
forma independente e sem confiar no banco de dados do operador, qual
destino foi autorizado — mesmo para MULTISIG, onde este item 39 já foi
resolvido, nada assina ou hasheia o `DestinationBinding`, então aquele
gap permanece aberto **mesmo depois desta remediação**. Destination
Authority (quem decide) ≠ Verificabilidade Independente de Destino
(quem consegue provar depois) — resolver um não resolve o outro; o
MULTISIG é a prova formal disso.

---

### 40. Identidade de execução multi-tentativa (T1/T2) não é representável no schema atual (Mission 9, Missão M9-TC, 2026-08-31)

`Escrow.txReleaseId` é um escalar único, permanentemente não-nulo uma
vez definido — nenhuma rotina do sistema (nem `escrow-repository.ts`'s
`findTerminalWithoutTxReleaseId()`/`findTerminalWithTxReleaseId()`, nem
o sweep de reorg do release leg, `multisig-release-reorg-sweep.ts`)
jamais o revisita depois de gravado. Isso significa que, quando uma
transação de liquidação já confirmada (T1) é posteriormente reorganizada
para fora da chain canônica (World C — outpoint de funding ainda não
gasto), o schema atual não tem como representar uma segunda tentativa
de execução (T2) como irmã de T1 sob o mesmo `Outcome` autorizado — só
pode sobrescrever o fato histórico de T1 (violando `INV-05`) ou não
representar T2 de forma alguma.

**Achado experimentalmente, não hipotético:** um T2 construído sob o
mesmo `Outcome`/`DestinationBinding` durável, com uma taxa de mineração
diferente (e portanto um txid diferente), passa mecanicamente pelo mesmo
guard real (`assertTranslationMatchesOutcome()`,
`dispatch-translation-guard.ts`) que uma dispatch ao vivo já precisa
passar — ou seja, a AUTORIZAÇÃO de T2 já está resolvida. O que falta é
a capacidade de MODELAR T1 e T2 coexistindo.

**Classificação:** débito arquitetural registrado, não crítico para o
boundary de segurança fail-closed atual — `reconcileMissingDispatch()`'s
própria query de candidatos (`dispute-dispatch-recovery.ts`) já exclui
estruturalmente qualquer escrow terminal, então nenhum redispatch
automático é sequer tentado hoje. **Necessário investigar antes de**
reivindicar convergência automática pós-completion para World C — não
antes disso.

**Fix restante:** nenhum proposto por esta missão (fora de escopo:
exigiria uma nova relação `EscrowExecutionAttempt` um-para-muitos e uma
decisão de produto sobre reabrir dispatch-eligibility para um escrow
terminal — uma missão própria, maior).

### 41. Settlement Consistency Read Surface — nenhuma leitura pública expõe reorg detectado (Mission 9, Missão M9-TC, 2026-08-31)

Um escrow pode estar internamente em `Escrow.status = COMPLETED` com um
`EscrowReleaseEvidence(REORGED_INVALIDATED)` já registrado
(`multisig-release-reorg-sweep.ts`), e nenhuma leitura pública
(`GET /v1/settlement/escrows/:id`, `escrow-repository.ts`'s
`findByIdWithDetails()`) expõe esse fato — um consumidor só vê
`COMPLETED`, indistinguível de uma liquidação saudável.

**Classificação:** débito de superfície de leitura, não de arquitetura
— a distinção em si (Historical Completion ≠ Current Settlement
Satisfaction) já é sustentada por evidência durável append-only
(`EscrowReleaseEvidence`); falta apenas um consumidor.

**Fix restante:** nenhum implementado por esta missão — decisão
explícita do freeze de não fixar nomes de campo/enum agora. Formato
conceitual candidato (não congelado): `workflowStatus` + um valor de
consistência de liquidação DERIVADO de `EscrowReleaseEvidence`, nunca
um novo estado mutável persistido (`SettlementConsistencyStatus`
permanece explicitamente não autorizado). Pertence a uma fase futura de
M10/SDK/DX/Protocol UX, após o freeze do Core.

### 42. Semântica de volume após invalidação de settlement não está definida (Mission 9, Missão M9-TC, 2026-08-31)

`User.totalTrades`/`totalVolumeBtc` são incrementados quando uma
liquidação é OBSERVADA como confirmada (`common/events/handlers.ts`'s
`recordTradeCompletion()`). Se essa liquidação for depois invalidada por
reorg (World C) e permanecer sem resolução, o sistema atual não
distingue "volume historicamente observado" de "volume atualmente
liquidado" — ao contrário da reputação (cujo racional de "comportamento
adjudicado, não localização atual de fundos" foi articulado por
M9-TC), o volume não tem nenhum racional equivalente hoje.

**Classificação:** débito semântico real, explicitamente não
corrigido nem escondido por esta missão.

**Fix restante:** nenhum proposto — requer uma decisão de produto sobre
o que "volume" deve significar antes de qualquer mudança de código.

### 43. Re-verificabilidade independente de Correspondence não está garantida (Mission 9, Missão M9-EI/M9-TC, 2026-08-31)

`CorrespondenceEvaluation` (`schema.prisma`) armazena o veredito
(`results: Json`, `MATCH`/`DIVERGENT`/`PENDING`/`UNKNOWN`) mas não os
valores decodificados da transação real que produziram esse veredito.
Se a transação subjacente se tornar indisponível na chain (podada, ou
justamente evictada por um reorg que este mesmo Mission 9 detecta), uma
implementação independente não consegue recomputar um `MATCH` histórico
a partir apenas dos artefatos duráveis do próprio Sails — só pode
confiar no veredito já registrado.

**Classificação:** débito não-bloqueante para o freeze do Mission 9
(nenhuma propriedade de recovery/consistência terminal depende de
resolver isso); relacionado a Credible Exit / Conformance de forma mais
ampla.

**Fix restante:** nenhum proposto — se algum dia priorizado, o menor
fix seria registrar os valores decodificados ao lado do veredito, não
persistir bytes de transação brutos.

### 44. `CI`/`CI Tests` (GitHub Actions) estão estruturalmente quebrados, não apenas instáveis (Mission 9.9 Completion Delta, 2026-09-01)

Achado ao investigar quais status checks eram reais/confiáveis o
suficiente para exigir em branch protection (`docs/GITHUB_PROJECT.md`
§8). `gh run list --branch main` mostrou `CI` e `CI Tests` falhando em
praticamente todo push recente, incluindo M9-F, M8-RF e o próprio M9
freeze — não uma flakiness ocasional, uma quebra estrutural.

**`CI` (`.github/workflows/ci.yml`)** — diagnóstico original (M9.9)
confirmado correto: o job `build` falhava em `npm ci` porque
`defaults.run.working-directory: ./sails-push-ready` só existia no
layout de pasta local aninhado deste ambiente, nunca dentro de um
checkout real do CI.

**`CI Tests` (`.github/workflows/ci-tests.yml`)** — **diagnóstico
original (M9.9) estava ERRADO, corrigido nesta missão (M9.10) por
instrução explícita de não confiar nele e reproduzir o log real.** A
causa real, confirmada baixando o artefato `jest-output.txt` da run
33352899462: 80 de 147 suites falhavam em `TS2305: Module
"@prisma/client" has no exported member 'Prisma'/'PrismaClient'/
'AssetType'` — nenhum dos dois workflows executava `prisma generate`
antes dos testes (só `prisma migrate deploy`, que não gera o client).
O ruído `FATAL: role "root" does not exist` que motivou o diagnóstico
original era o próprio health-check `pg_isready` (sem `-U postgres`)
falhando em segundo plano — confirmado inofensivo: o step "Apply
database migrations" (que usa a conexão real da aplicação) sempre
teve sucesso na mesma run.

**`CodeQL` (`Analyze (javascript-typescript)`)** permanece o único
check real e confiável — verificado verde em toda execução recente
checada; 61 alertas abertos no total, 60 confinados a
`.github/skills/impeccable/` (ferramenta de terceiros vendorizada, não
código próprio do Sails, fora de escopo desta auditoria), 1 real
(`load-tests/artillery/pregenerate-users.js`, `js/http-to-file-access`,
medium) — revisado e classificado como não explorável (script de
load-test rodado manualmente contra `localhost`, nenhum ator externo
envolvido em nenhuma ponta do fluxo rede→arquivo).

**Status: CLOSED.** Ambos os workflows corrigidos nesta missão —
`ci.yml` (working-directory removido, `prisma generate` adicionado,
`pg_isready -U postgres`) e `ci-tests.yml` (`prisma generate`
adicionado, `pg_isready -U postgres`). Evidência: ver
`docs/GITHUB_PROJECT.md` §16-19 (M9.10) para as execuções reais no
GitHub Actions pós-fix.

---

### 45. `@fastify/rate-limit` — CVE real, não corrigível sem regressão conhecida (Mission 9.10, 2026-09-01)

`@fastify/rate-limit@11.2.0` é uma "⚠️ Security Release" real e
confirmada (release notes do próprio mantenedor,
`GHSA-grpc-p53c-r64v`/`CVE-2026-15144`, severity HIGH/CVSS 7.3): a
chave de rate-limit por IP não normaliza endereços IPv6, permitindo
bypass do limite via rotação/reescrita textual do mesmo endereço
IPv6 quando `trustProxy` está habilitado atrás de um proxy que
expõe IPv6 ao origin.

**Reachability, verificado diretamente:** `trustProxy` nunca é setado
em nenhum lugar deste código (`grep -rn "trustProxy" src/` só encontra
o comentário que MENCIONA a opção, nunca a define) — não explorável
na configuração padrão deste repositório hoje. **Mas** torna-se
explorável no momento em que um deployment real atrás de um CDN/load
balancer (exatamente o cenário que qualquer deployment de produção
real precisaria) habilitar `trustProxy`, derrotando silenciosamente a
proteção de rate-limit que `/challenge`/`/authenticate` (RT-002) foram
desenhados para fornecer.

**Por que não foi corrigido nesta missão, confirmado empiricamente, não
apenas por comentário herdado:** `app.ts`'s própria pin em `11.1.0`
(não um range) já documentava, com evidência, que `11.2.0`'s
`normalizeIP()` lança `TypeError: Cannot read properties of undefined
(reading 'toLowerCase')` sempre que `request.ip` é `undefined` — o que
acontece em todo WebSocket upgrade real sob `app.injectWS()`. **Esta
missão reproduziu o exato mesmo crash de forma independente** (bumped
para 11.2.0 primeiro, sem ler este comentário; 6 testes de "Pears
relay" em `tests/routes.test.ts` falharam com o mesmo stack trace
`normalizeIP → defaultKeyGenerator → applyRateLimit`; revertido para
11.1.0, 134/134 passaram) — confirmação direta e independente de que o
pin continua necessário, não apenas herdado.

**Classificação:** NEEDS INVESTIGATION, não DEFER — diferente de um
major de tooling qualquer, esta é uma vulnerabilidade real, já
publicada, sem patch aplicável hoje sem quebrar WebSocket. **Fix
restante (não tentado nesta missão — é trabalho de código de
segurança de aplicação, fora do escopo de "repository hygiene"):**
ou aguardar uma versão upstream que corrija ambos os problemas juntos,
ou escrever um `keyGenerator` customizado que normalize IPv6
manualmente enquanto permanece em `11.1.0` (o próprio advisory
documenta esse workaround, mas o helper exportado `normalizeIP()` só
existe a partir de `11.2.0` — um `keyGenerator` customizado precisaria
reimplementar a normalização, não reusar o helper).

### 46. Majors deliberadamente adiados por esta missão (Mission 9.10, 2026-09-01)

Registrados, não implementados — nenhum critério do
`docs/GITHUB_PROJECT.md`-equivalente "major upgrade" gate (segurança
real / dependência de outra transição justificada / bloqueio de CI-
segurança-confiabilidade / risco de migração baixo E redução material
de débito) foi satisfeito para nenhum destes:

- `@noble/curves`/`@noble/hashes` (root: 1.x→2.x; `packages/sails-ui`:
  1.9.0→2.3.0) e `@bitcoinerlab/secp256k1` (1.x→2.x, `packages/sails-sdk`
  + `examples/wallet-integration`) — Classe B (cripto). Achado real que
  reduz o risco de uma futura investigação isolada: `packages/sails-sdk`
  já roda em produção contra `@noble/curves@2.2.0` hoje (resolução real
  do workspace, `npm ls` verificado) — o bump do root/UI para 2.3.0
  convergiria versões já parcialmente em uso, não introduziria uma v2
  inteiramente nova ao ecossistema. `multisig.provider.ts`/
  `arbitration-authority.ts` (o caminho de assinatura real Mission13/M8/
  M9) não importam nenhum destes pacotes diretamente — mas
  `@bitcoinerlab/secp256k1` é importado diretamente pelos próprios
  testes de integração reais desta suite (`m9fReleaseReorg.test.ts` e
  irmãos), via hoisting da declaração do SDK — uma investigação futura
  precisa rodar exatamente esses testes contra a v2 antes de aplicar.
- `@scure/btc-signer` (`packages/sails-sdk`, 2.0.1→2.3.0) — adiado
  junto com os nobles acima por acoplamento real (btc-signer v2.x
  alveja noble-curves v2.x internamente); aplicar um sem o outro é o
  próprio risco de inconsistência parcial que este item existe para
  evitar.
- `ioredis` (5.x→6.x) — Classe D, major real, não investigado a fundo
  nesta missão (fora do orçamento).
- `typescript` (5.9.3→7.0.2, pula a v6 inteira) — Classe E, mas com
  blast radius total do repositório; exemplo nomeado explicitamente
  pela própria missão como "não faça isso só porque existe."
- Família Storybook (`@chromatic-com/storybook`, `@storybook/*`,
  `@testing-library/jest-dom`, `@vitejs/plugin-react` em
  `packages/sdk-react`, `jsdom`, `storybook`) — **achado real, não
  apenas adiado por cautela:** o PR #39, como construído, bumpava
  `@storybook/addon-a11y`/`addon-themes`/`react`/`react-vite` para v10
  enquanto deixava `@storybook/addon-essentials`/`addon-interactions`/
  `test` em v8 — Storybook exige versões major idênticas entre seus
  próprios pacotes; mergeado como estava, isso quebraria o Storybook,
  não apenas arriscaria quebrá-lo. Uma futura migração precisa mover
  TODOS os pacotes `@storybook/*` juntos, na mesma major, nunca parcial.
- `@qvac/sdk` (0.15.0→0.18.2) — pre-1.0, bump minor pode ser breaking;
  ver item 47.
- `next.js`/demais deps de `examples/sails-integration-starter` e
  `examples/wallet-integration` (exceto o bitcoinerlab já listado acima)
  — apps standalone isolados, deliberadamente fora do escopo desta
  passada para manter o diff pequeno e diagnosticável.

### 47. QVAC SDK — investigado, não aplicado (Mission 9.10, 2026-09-01)

`@qvac/sdk` `0.15.0→0.18.2` (PR #39) não foi aplicado. Semver pre-1.0
— um bump "minor" pode ser breaking pela própria convenção do
ecossistema. `qvac-agent.provider.ts` mantém QVAC estritamente
advisory-only onde autoridade de protocolo é exigida
(`SEMANTIC_KERNEL.md` §16) — esta fronteira é imposta pelo código do
próprio Sails (QVAC nunca é chamado em um caminho que trata sua
resposta como autoridade), não por uma garantia do SDK, então um
upgrade de versão não pode silenciosamente movê-la sozinho. Ainda
assim, uma mudança de superfície de API entre 0.15→0.18 não foi
auditada função a função nesta missão — registrado como trabalho
futuro antes de aplicar, não como "seguro por design."

### 48. `deepmerge-ts` — vulnerabilidade real, sem fix disponível, não explorável (Mission 9.10, 2026-09-01)

`npm audit --omit=dev` aponta `deepmerge-ts@7.1.5 < 8.0.0`
(GHSA-ggr8-5vv4-36mx, high, stack exhaustion em merge de grafos de
objeto recursivos), puxado transitivamente por `prisma@7.10.0` →
`@prisma/config@7.10.0`. `npm audit fix --force`'s própria sugestão é
fazer DOWNGRADE do prisma inteiro para `6.12.0` — rejeitado
explicitamente (regressão de major inteira, exatamente o tipo de
"fix" automático que esta missão existe para não aceitar cegamente).
Corresponde ao alerta Dependabot #73, historicamente
`auto_dismissed` pelo GitHub, reintroduzido pela própria resolução do
lockfile desta missão. **Classificação: não explorável** — `prisma`
é uma ferramenta de CLI/dev, nunca processa grafo de objeto vindo de
rede não confiável; `deepmerge-ts` aqui só processa os próprios
arquivos de config/schema locais do desenvolvedor. Nenhum fix
disponível upstream ainda; registrado, não corrigido.

### 49. Nenhum workflow de CI buildava os pacotes do workspace antes dos testes (Mission 9.10, 2026-09-01)

**Achado real, de terceira camada** — descoberto só depois que os dois
fixes do item 44 deixaram os workflows reais avançarem o suficiente
para alcançá-lo pela primeira vez, confirmando exatamente por que a
missão instruiu "reproduza, não confie no diagnóstico anterior."

Uma PR real (#40) rodando no GitHub Actions falhou com `TS2307: Cannot
find module '@satsails/p2p-trading-sdk'` em ~29 suites, tanto em
`ci.yml` (Node 20) quanto em `ci-tests.yml` (Node 24) — descartando
uma causa específica de versão do Node. `packages/sails-sdk/package.json`
aponta `"types": "dist/index.d.ts"` (`dist/` no `.gitignore`, nunca
commitado). `jest.config.js`'s próprio `moduleNameMapper` (comentário
já existente: "tests must not depend on packages/*/dist having been
built first") só cobre a resolução em TEMPO DE EXECUÇÃO do Jest — a
passada de diagnóstico do TypeScript dentro do `ts-jest` resolve
módulos de forma independente, via `node_modules` → o symlink do
workspace → o próprio campo `"types"` do pacote, exatamente como um
consumidor real faria. Nenhum dos dois workflows nunca rodou
`npm run build` antes dos testes.

**Reproduzido localmente byte a byte, não assumido:** removido
`packages/sails-sdk/dist` com cache do Jest limpo → erro idêntico;
restaurado → passa. **Fix:** um step `Build workspace packages`
(`npm run build -w @sails/core -w @satsails/p2p-schemas -w
@satsails/p2p-trading-sdk`) adicionado a ambos os workflows, entre
`Install dependencies` e `Generate Prisma Client`. Confirmado
localmente com build genuinamente do zero (dist/ removido, cache do
Jest limpo, suite completa rodada) antes de commitar. **Resultado
real, verificado em PR #40:** de ~29 suites falhando para exatamente
1 suite / 6 testes — ver item 50.

### 50. `tests/settlementReadAccess.test.ts`'s bloco `/disputes/:id` — 6 testes falhavam de forma determinística no GitHub Actions real, não reproduzia localmente (Mission 9.10 → **FECHADO na Mission 9.10-R**, 2026-09-01)

Achado durante a validação real do PR #40 (Mission 9.10), depois que os
itens 44/49 já haviam fechado toda a quebra estrutural anterior. Não
reproduzia localmente sob nenhuma condição testada naquele momento —
único débito real, disclosed, deixado ABERTO ao final da Mission 9.10
em vez de um fix às cegas.

**Root cause real, isolado na Mission 9.10-R via diagnóstico temporário
rodado em CI real** (não em teoria — `console.log` disclosed, pushado,
lido do log real do GitHub Actions, removido antes do fix final):
`TRUSTED_ARBITRATORS` nunca era setado em nenhum workflow. `config/
index.ts` lê `process.env.TRUSTED_ARBITRATORS` uma única vez, no
import do módulo; `dispute.service.ts`'s `getDisputeService()` é um
singleton lazy que, na primeira tentativa de construção, lança
`ValidationError('No trusted arbitrators configured')` se esse array
estiver vazio — e continua lançando para toda chamada seguinte no
mesmo worker, já que o singleton nunca constrói com sucesso. Isso
explica por que os 6 testes falhavam identicamente (400) independente
da identidade do chamador: nenhum chegava a alcançar a checagem de
autorização. Localmente sempre foi mascarado por um `.env` gitignored
(`TRUSTED_ARBITRATORS=k6-test-arbiter`) — daí não reproduzir.

**Esta investigação revelou, em sequência, DUAS camadas adicionais do
mesmo root cause — só visíveis depois que a camada anterior foi
corrigida e o CI real avançou mais longe do que nunca antes ("cada
falha corrigida pode revelar a falha que estava impedida de
executar"):**
1. `tests/settlementReadAccess.test.ts` — não setava a var (fix:
   `process.env.TRUSTED_ARBITRATORS` explícito em `beforeAll`, antes
   do `require('../src/app')` dinâmico, mesmo padrão já estabelecido
   por `tests/cors.test.ts`). Commit `f399aaa`.
2. Nem `ci.yml` nem `ci-tests.yml` jamais setavam
   `TRUSTED_ARBITRATORS` como env de workflow — ~10 arquivos
   `tests/integration/*.test.ts` assumiam o valor ambiente que todo
   checkout local já provê via `.env`. Fix: `TRUSTED_ARBITRATORS:
   k6-test-arbiter` adicionado a ambos os workflows, mesmo escopo de
   `DATABASE_URL`.
3. Esse fix (2) imediatamente expôs um TERCEIRO problema adjacente:
   `tests/integration/escrowFundingConcurrency.test.ts` tinha sua
   própria linha de default (`process.env.TRUSTED_ARBITRATORS =
   process.env.TRUSTED_ARBITRATORS || 'funding-concurrency-test-
   arbiter'`), que só disparava quando a var estava vazia — e uma
   constante `ARBITER_ID` separada, hardcoded, com o MESMO literal,
   que parou de bater assim que (2) passou a fornecer um valor
   ambiente real. Fix: `ARBITER_ID` agora deriva de
   `process.env.TRUSTED_ARBITRATORS` diretamente, eliminando a
   segunda fonte de verdade. Commit `a92f812`.

**Verificação real, não teórica:** cada uma das 3 camadas foi
reproduzida localmente (falha causada deliberadamente, confirmada,
depois corrigida e reconfirmada) antes do push. Regressão completa
local limpa (unit: 147/147 suites, 1848/1848 testes; Postgres real:
27/27 suites, 218/218 testes, contra containers Postgres genuinamente
novos, nunca reaproveitados). PR #40 real no GitHub Actions: **CI** e
**CI Tests** verdes **duas vezes consecutivas** no mesmo commit
(`a92f812`, via `gh run rerun` independente) — não apenas uma
execução isolada.

**Classificação: débito FECHADO com causa raiz completa, não um
"CI ficou verde" sem explicação.** Nenhum teste foi pulado, nenhum
status code foi trocado para forçar passagem, nenhuma
autorização foi enfraquecida, nenhum retry foi usado para mascarar
falha determinística — ver Sacrifice Check da Mission 9.10-R.

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
