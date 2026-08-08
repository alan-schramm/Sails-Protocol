# Production Readiness Fixes — Handoff para Claude Code

> **Gerado em:** 2026-08-07
> **Objetivo:** Tornar o repositório pronto para apresentação a parceiros (Tether, Cake Wallet, Breez, etc.)
> **Regra:** NÃO alterar comportamento, APIs públicas, ou arquitetura. Apenas acabamento profissional.

---

## P0 — Fix imediato (antes de qualquer apresentação)

### 1. Fixar prefixo de versão inconsistente

**Arquivo:** `src/routes/intentRoutes.ts`

**Problema:** Única rota do código usando `/api/v1/` em vez de `/v1/`.

**Fix:** Substituir `/api/v1/intents` por `/v1/intents` nas linhas 69 e 99.

```
Linha 69:  app.post('/api/v1/intents',    →  app.post('/v1/intents',
Linha 99:  app.delete('/api/v1/intents/:id',  →  app.delete('/v1/intents/:id',
```

---

### 2. Remover `status` redundante do response body

**Arquivo:** `src/modules/open-settlement/settlement.routes.ts`

**Problema:** Helper `success()` adiciona campo `status` no body (redundante com HTTP status code). Nenhum outro arquivo faz isso.

**Fix:** Remover o parâmetro `status` da função e todas as suas chamadas.

```typescript
// Linhas 120-122 — ANTES:
function success<T>(data: T, status: 200 | 201 = 200) {
  return { success: true as const, data, status }
}

// DEPOIS:
function success<T>(data: T) {
  return { success: true as const, data }
}
```

Também remover `status` de todas as chamadas `success(data, 201)` → `success(data)` (~25 ocorrências no mesmo arquivo).

---

### 3. Adicionar `repository` e `keywords` em todos os package.json

**Arquivos afetados:**
- `package.json` (root)
- `packages/sails-sdk/package.json`
- `packages/sdk-react/package.json`
- `packages/sails-p2p-schemas/package.json`

**Fix para cada um:**

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/alan-schramm/Sails-Protocol.git",
  "directory": "packages/NOME_DO_PACKAGE"
},
"keywords": ["sails", "p2p", "bitcoin", "escrow", "non-custodial", "sdk"]
```

---

### 4. Adicionar `prepublishOnly` em todos os packages

**Arquivos:** Todos os `packages/*/package.json`

**Fix:** Adicionar em `"scripts"`:

```json
"prepublishOnly": "npm run build && npm run typecheck"
```

---

### 5. Adicionar `exports` map em `@sails/p2p-schemas`

**Arquivo:** `packages/sails-p2p-schemas/package.json`

**Fix:** Adicionar o campo `exports`:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.mjs",
    "require": "./dist/index.js"
  }
},
"module": "./dist/index.mjs",
"sideEffects": false
```

Também mudar o build de `tsc` para `tsup` para gerar dual CJS/ESM (criar `tsup.config.ts` idêntico ao dos outros packages).

---

### 6. Fixar README

**Arquivo:** `README.md`

**Fixes:**
- **Linha 159:** Remover ou completar a frase órfã `## If you're actively editing code`
- **Adicionar badges** no topo (após o título):

```markdown
[![CI](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/alan-schramm/Sails-Protocol/actions)
[![npm version](https://img.shields.io/npm/v/@sails/sdk)](https://www.npmjs.com/package/@sails/sdk)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
```

---

### 7. Limpar arquivos rastreados que não deveriam estar no git

**Arquivos/diretórios para remover do rastreamento:**

```bash
git rm -r --cached graphify-out/
git rm --cached GITHUB_ORGANIZATION.md
```

**Adicionar ao `.gitignore`:**

```
graphify-out/
GITHUB_ORGANIZATION.md
*.txt
```

---

### 8. Migrar `console.*` para `app.log` em código de produção

**Escopo:** Apenas arquivos de produção (NÃO demos).

**Arquivos e linhas afetadas:**

| Arquivo | Linhas | Total |
|---------|--------|-------|
| `src/app.ts` | 258, 267, 286, 305, 308, 320, 323 | 7 |
| `src/infrastructure/p2p/pear.service.ts` | 131, 149, 164, 176, 195, 215, 232, 244, 261, 266 | 10 |
| `src/common/events/event-store.ts` | 93, 109 | 2 |
| `src/common/events/handlers.ts` | 454, 525, 543 | 3 |
| `src/common/database/index.ts` | 38 | 1 |
| `src/common/redis/index.ts` | 17, 26 | 2 |
| **Total** | | **25** |

**Padrão de substituição:**

```typescript
// ANTES:
console.log(`[Pear:...] Node started`)
console.error('[Redis] Connection error:', err.message)
console.warn(`[...] Warning`)

// DEPOIS (em arquivos que têm acesso a app.log):
app.log.info({ msg: 'Node started', module: 'Pear', userId: this.ownerUserId.slice(0,8) })
app.log.error({ err, msg: 'Connection error', module: 'Redis' })
app.log.warn({ msg: 'Warning', module: '...' })

// DEPOIS (em arquivos sem app.log — criar logger local):
import pino from 'pino'
const logger = pino({ name: 'event-store' })
logger.info({ eventName, correlationId })
```

**NOTA:** Para `pear.service.ts`, o logger deve ser injetado ou criar uma instância local com `pino({ name: 'pear' })`.

---

## P1 — Fix antes de beta público

### 9. Adicionar pino `redact` para headers sensíveis

**Arquivo:** `src/app.ts` (linhas 33-41)

**Fix:** Adicionar opção `redact` na configuração do logger:

```typescript
const app = Fastify({
  logger: {
    level: config.app.logLevel,
    transport: config.app.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'token'],
      censor: '[REDACTED]',
    },
  },
})
```

---

### 10. Mover `@tanstack/react-query` para peerDependencies

**Arquivo:** `packages/sdk-react/package.json`

**Fix:**

```json
// ANTES:
"dependencies": {
  "@sails/sdk": "^0.1.0",
  "@tanstack/react-query": "^5.90.5"
}

// DEPOIS:
"dependencies": {
  "@sails/sdk": "^0.1.0"
},
"peerDependencies": {
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "@tanstack/react-query": "^5.0.0"
}
```

---

### 11. Adicionar `WalletAdapter.disconnect()`

**Arquivo:** `packages/sails-sdk/src/wallet-adapter.ts`

**Fix:** Adicionar método opcional à interface:

```typescript
export interface WalletAdapter {
  // ... métodos existentes ...
  /** Optional cleanup — called when SailsClient is destroyed. */
  disconnect?(): Promise<void>
}
```

---

### 12. Corrigir rota `/v1/liquidity/offers/id/:id`

**Arquivo:** `src/modules/open-liquidity/liquidity.routes.ts` (linha 80)

**Fix:**

```typescript
// ANTES:
app.get('/v1/liquidity/offers/id/:id', {

// DEPOIS:
app.get('/v1/liquidity/offers/:id', {
```

**ATENÇÃO:** Verificar se há testes que dependem da rota antiga e atualizá-los também.

---

### 13. Adicionar README para `@sails/p2p-schemas`

**Arquivo:** `packages/sails-p2p-schemas/README.md` (novo)

**Conteúdo mínimo:**

```markdown
# @sails/p2p-schemas

Shared TypeScript types and Zod schemas for the Sails P2P Protocol.

## Installation

npm install @sails/p2p-schemas

## Usage

import type { Offer, Trade, Dispute } from '@sails/p2p-schemas'

## License

Apache-2.0
```

---

### 14. Adicionar correlation IDs nas respostas de erro

**Arquivo:** `src/app.ts` (error handler, ~linha 145-160)

**Fix:** Incluir `requestId` nas respostas de erro:

```typescript
// No error handler, adicionar requestId:
reply.code(statusCode).send({
  success: false,
  error: code,
  message: config.app.env === 'development' ? message : 'Internal server error',
  details,
  requestId: request.id,  // ← ADICIONAR
})
```

---

### 15. Explicitar disconnect de DB/Redis no shutdown

**Arquivo:** `src/app.ts` (linhas 257-264)

**Fix:**

```typescript
import { prisma } from './common/database'
import { redis } from './common/redis'

const shutdown = async (signal: string) => {
  app.log.info({ msg: 'Shutting down gracefully', signal })
  await app.close()
  await prisma.$disconnect()
  await redis.quit()
  process.exit(0)
}
```

---

### 16. Adicionar `details: []` em erro manual

**Arquivo:** `src/modules/open-settlement/settlement.routes.ts` (linha ~384)

**Fix:** Adicionar campo `details` que está faltando:

```typescript
// ANTES:
reply.code(404).send({
  success: false, error: 'NOT_FOUND',
  message: `No ArbiterProfile for ${targetId}`,
})

// DEPOIS:
reply.code(404).send({
  success: false, error: 'NOT_FOUND',
  message: `No ArbiterProfile for ${targetId}`,
  details: [],
})
```

---

### 17. Fixar HTTP 409 com error code NOT_FOUND em pear.routes

**Arquivo:** `src/infrastructure/p2p/pear.routes.ts` (linhas ~82, ~96, ~110)

**Fix:** Mudar para HTTP 409 com error code `CONFLICT` ou HTTP 404 com `NOT_FOUND`:

```typescript
// ANTES:
reply.code(409).send({
  success: false, error: 'NOT_FOUND',
  message: 'No active node -- call POST /v1/peers/start first', details: []
})

// DEPOIS (opção A — 404):
reply.code(404).send({
  success: false, error: 'NOT_FOUND',
  message: 'No active node -- call POST /v1/peers/start first', details: []
})

// DEPOIS (opção B — 409 com código correto):
reply.code(409).send({
  success: false, error: 'CONFLICT',
  message: 'No active node -- call POST /v1/peers/start first', details: []
})
```

---

### 18. Adicionar tags Swagger para `peers` e `open-proof`

**Arquivo:** `src/app.ts` (configuração do Swagger, ~linha 25-30)

**Fix:** Adicionar as tags faltantes:

```typescript
tags: [
  { name: 'intent', description: 'Intent Engine' },
  { name: 'open-identity', description: 'Identity & Authentication' },
  { name: 'open-liquidity', description: 'Offer Book & Order Matching' },
  { name: 'open-settlement', description: 'Escrow & Dispute Resolution' },
  { name: 'open-p2p', description: 'Trade Management & Chat' },
  { name: 'open-reputation', description: 'Trust Scores & Ratings' },
  { name: 'open-agents', description: 'Capability Registry' },
  { name: 'peers', description: 'P2P Node Management' },         // ← ADICIONAR
  { name: 'open-proof', description: 'Proof & Verification' },   // ← ADICIONAR
],
```

---

## P2 — Fix antes de GA

### 19. Consolidar pastas de load test — ✅ FEITO (2026-08-08)

**Ação original:** Mover tudo de `loadtest/` para `load-tests/` e remover
`loadtest/`.

**Nota (2026-08-08):** essa ação literal estava errada — `loadtest/`
(Artillery) e `load-tests/` (k6) não são duplicatas, são duas
ferramentas de load-test genuinamente diferentes cobrindo fluxos
diferentes (o próprio `load-tests/README.md` já documentava isso, e
`docs/CLEANUP_2026_08_07.md` já tinha investigado e decidido manter as
duas separadas um dia antes). "Mover tudo para dentro de load-tests/ e
apagar loadtest/" teria misturado dois toolchains incompatíveis numa
pasta só sem eliminar nenhuma duplicação real (não existe). Feito em vez
disso: `loadtest/` movido para `load-tests/artillery/` (via `git mv`,
preservando histórico) — as duas suítes continuam sendo suítes
separadas, agora só compartilhando um diretório-pai. package.json,
.gitignore, e todas as referências de path em código/docs atualizadas.
Bônus: encontrado e corrigido um bug real nos próprios scripts de load
test — `load-tests/tests/intent-creation.js` e
`load-tests/artillery/intent-api.yml` ainda apontavam para o prefixo
antigo `/api/v1/intents` (renomeado para `/v1/intents` no item 1 deste
mesmo doc) — ambos dariam 404 contra o servidor real se rodados hoje.

---

### 20. Mover `src/demo/` para `examples/` — ✅ FEITO (2026-08-08)

**Ação:** Mover `src/demo/` para `examples/demo/` e atualizar imports/references.

Feito via `git mv` (preserva histórico). Imports relativos corrigidos em
ambos os scripts (`../` → `../../src/` — profundidade mudou já que
`examples/` é irmão de `src/`, não filho). `demo-satsails-qvac.ts` na
raiz (não movido — é um entrypoint separado, não parte de `src/demo/`)
teve seu único import atualizado. `tsconfig.json`'s `include` ganhou
`"examples/**/*.ts"` — sem isso, esses dois arquivos ficariam fora de
`npx tsc --noEmit` silenciosamente, o mesmo ponto-cego já encontrado
este mesmo dia em `packages/sails-sdk`/`packages/sdk-react`. Scripts
`demo:pix-to-usdt`/`demo:multisig` em `package.json`, `.env.example`, e
todas as referências de path em docs (`BACKLOG.md`, `TODO.md`,
`HANDOFF.md`, `PROTOCOL_SPECIFICATION.md`, `TRANSACTION_WALKTHROUGH.md`,
`DEPLOYMENT.md`, `ARCHITECTURE.md`, `DEAD_CODE_REMOVAL_REPORT.md`,
`rfcs/RFC-014-capability-registry-enforcement.md`) atualizados.
`packages/sails-ui/src/lib/qvacAgent.ts` tem uma menção em comentário a
`src/demo/` — não corrigida, é território exclusivo da sessão de UI em
paralelo.

---

### 21. Adicionar OpenAPI schemas nas rotas — ✅ FEITO (2026-08-08, body/params/querystring)

**Esforço original estimado:** 1-2 semanas. Cada rota precisa de
`schema: { body, response, params }` no schema do Fastify.

**Escopo real fechado:** `body`/`params`/`querystring` em todas as 22
rotas HTTP reais que tinham um schema Zod próprio pra reaproveitar
(9 dos 11 arquivos de rota — `intentRoutes.ts` já tinha schema real
pré-existente em 2 rotas, não mexido; `relay.routes.ts` é WebSocket puro,
sem body/params). `schema.response` deliberadamente **não** incluído
neste pass — ver nota abaixo.

**Dois riscos reais encontrados e neutralizados antes de tocar em
qualquer rota** (`src/common/openapi.ts`'s próprio header comment tem o
detalhe completo):

1. Um `schema.body` ingênuo faria o ajv do próprio Fastify validar a
   requisição e rejeitar automaticamente ANTES do handler rodar, com o
   formato de erro genérico do Fastify — quebrando silenciosamente o
   contrato `VALIDATION_ERROR` que `packages/sails-sdk/src/errors.ts` já
   documenta e todo consumidor do SDK depende.
2. `attachValidation: true` evita a rejeição automática, mas o ajv ainda
   RODA e, com `coerceTypes` (padrão do Fastify), **muda o corpo da
   requisição silenciosamente** antes do handler ver (`voucheeId: 123`
   virou `"123"` e passou no `.parse()` do Zod, que deveria ter
   rejeitado) — confirmado com um `app.inject()` real, não assumido.

**Solução**: `validatorCompiler: () => () => true` por rota — o schema
fica só para o `@fastify/swagger` documentar; nenhuma validação real do
Fastify roda, o `.parse()` do próprio handler continua sendo a única
coisa que de fato valida/rejeita, comportamento externo 100% idêntico ao
de antes. Empacotado em `docsOnlySchema()` para não repetir esse detalhe
em cada uma das 22 rotas.

Usa `z.toJSONSchema()` nativo do Zod v4, não o pacote `zod-to-json-schema`
— testado primeiro, mas sua versão 3.25.2 produz um schema **vazio**
contra um objeto Zod v4 real (não introspecta a estrutura interna nova
corretamente), apesar de declarar zod v4 como peer válido. Achado
rodando os dois lado a lado antes de escolher, não assumido de nenhum
dos dois.

**Bug real encontrado e corrigido no processo**: `z.toJSONSchema()`
lança uma exceção em tempo de registro de rota (`buildApp()`, não por
requisição — derrubaria o servidor inteiro no boot) para qualquer campo
sem representação nativa em JSON Schema, como `z.coerce.date()`
(rota `/v1/openp2p/trades/:id/reconcile`) — corrigido com
`unrepresentable: 'any'`.

**Efeito colateral corrigido**: `tests/healthLiveReady.test.ts` (que já
faz `buildApp()` frio por teste) passou a estourar o timeout padrão de
5000ms do Jest com o custo extra, mesmo pequeno, de gerar ~30 schemas a
mais no boot — mesmo ajuste (`jest.setTimeout(30_000)`) que
`tests/cors.test.ts`/`tests/routes.test.ts` já usam pelo mesmo motivo.

**Por que `schema.response` ficou de fora**: diferente de
`body`/`params`/`querystring`, um `schema.response` no Fastify não é só
documentação — ele controla a **serialização real** da resposta via
`fast-json-stringify`, e um schema incompleto **remove campos
silenciosamente** de toda resposta daquela rota. Documentar isso com
segurança exige revisar campo a campo o retorno real de cada rota, não
um wire-up em lote — deixado como o próximo passo real deste item, não
esquecido.

Verificado: `npx tsc --noEmit` limpo; suíte completa 762/762 (isolando
as 6 suítes já conhecidas por instabilidade sob carga paralela); e um
teste descartável confirmando que `app.swagger()` mostra o schema real
(`voucheeId`, `tradeId`, `lockedAmount` etc.) para rotas reais.

---

### 22. Criar example com wallet real

**Esforço:** 1 semana. Criar `examples/wallet-integration/` mostrando integração com uma wallet real (não mock).

---

## Checklist de Validação

Após cada fix, rodar:

```bash
npx tsc --noEmit          # Deve ser 0 erros
npm test                  # Deve ser 689/689 passando
```

---

## Notas para Claude Code

1. **NÃO alterar comportamento** — todas as fixes são cosméticas ou de segurança
2. **NÃO mover arquivos** nas fixes P0/P1 — apenas edits inline
3. **P2 pode mover arquivos** mas deve atualizar todos os imports
4. **Testar cada fix individualmente** — rodar `npx tsc --noEmit` e `npm test` após cada grupo
5. **Manter o CHANGELOG atualizado** com cada fix
6. **Commit separado** para cada categoria (P0, P1, P2)
