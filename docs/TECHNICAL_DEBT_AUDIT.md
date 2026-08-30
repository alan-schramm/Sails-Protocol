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

- **Boundary mecânico do Pure Core** (§17 do documento) — nenhuma
  verificação estática de import (`eslint-plugin-import`'s
  `no-extraneous-dependencies`, `dependency-cruiser`, ou equivalente)
  está configurada hoje; confirmado por inspeção direta que não existe
  `.eslintrc*`/`eslint.config.*` na raiz do repositório, e que a
  hoisting padrão do npm workspaces tornaria uma checagem baseada
  apenas em `package.json` insuficiente (verificado diretamente:
  `@prisma/client` já está hoisted para o `node_modules` raiz).
- **Publicação da Canonical Evaluator Identity** (§5-6) — o mecanismo
  pelo qual uma identidade de evaluator se torna publicamente resolvível
  (evitando virar um ponto de interpretação privada, o mesmo risco já
  documentado no item 35 sobre o Arbiter) ainda não foi desenhado nem
  implementado.
- **Ferramental de Ruleset Admission** (§23) — a separação entre
  reconhecimento de governança e verificação estrutural pura do Core
  está definida arquiteturalmente, mas nenhuma das duas camadas tem
  implementação real ainda.

**Classificação:** débito de arquitetura reconhecido e disclosed, não
escondido — nenhum destes bloqueia o início da migração em M0 (o
boundary mecânico é justamente o primeiro passo do próprio
`docs/CORE_IMPLEMENTATION_ARCHITECTURE.md` §29).

**Fix restante:** parte do futuro "SAILS CORE IMPLEMENTATION PROGRAM —
PHASE 1 — MECHANICAL BOUNDARY & SEMANTIC MODEL FOUNDATION" —
deliberadamente não iniciado por esta auditoria nem pela missão que
congelou a arquitetura de implementação.

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
