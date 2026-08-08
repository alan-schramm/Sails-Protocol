# Sails P2P Trading SDK — Relatório de Auditoria de Banco de Dados

> **Escopo**: Análise do esquema Prisma (`prisma/schema.prisma`), consultas, joins, paginação, migrações e normalização.
> **Instrução**: Identificação de problemas — nenhuma implementação foi feita.
>
> **⚠️ PARCIALMENTE SUPERSEDIDO — verificado 2026-08-08**: os índices em `Dispute.[arbiterId,status]` e `User.reputationScore` já existem no schema real (linhas 121 e 346, de uma pass P2 anterior); a paginação do leaderboard/chat-messages já está implementada (`reputation.service.ts`, `chat.routes.ts`); a estratégia de migração `db push` já foi trocada para `prisma migrate deploy` (`prisma/migrations/` existe em disco). **Ainda real e aberto**: falta índice em `Escrow.[status,expiresAt]` (o sweeper varre a tabela inteira) e em `IntentEvent.[intentId,createdAt]` (hot path sem índice composto) — ver `docs/BACKLOG.md` para o item ativo.

---

## 1. Índices

### Índices declarados no schema.prisma (767 linhas)

| Model | Índices declarados | Observação |
|-------|-------------------|------------|
| `Offer` | `@@index([asset, side, status])`, `@@index([userId])` | ✅ Índice composto para filtragem de offers por asset+side. Índice separado para userId. |
| `Trade` | `@@index([buyerId])`, `@@index([sellerId])`, `@@index([status])` | ✅ Índices para lookup por comprador/vendedor/status. |
| `Dispute` | `@@unique([tradeId])`, `@@index([escrowId])`, `@@index([status])` | ⚠️ `@@unique([tradeId])` dupla como índice de lookup — eficiente, mas não há índice composto para `[arbiterId, status]`. |
| `PaymentAccount` | `@@index([ownerId])` | ✅ |
| `Vouch` | `@@unique([voucherId, voucheeId])`, `@@index([voucheeId])` | ✅ |
| `Intent` | `@@index([participantId])`, `@@index([status])` | ✅ |
| `IntentEvent` | `@@index([intentId])` | ✅ |
| `Message` | `@@index([tradeId])` | ✅ |
| `CapabilityGrant` | `@@index([grantedTo])`, `@@index([capabilityName])` | ✅ |
| `EscrowPendingTransaction` | (implicito via `@@unique([escrowId])`) | ✅ |
| `EscrowTransactionSignature` | `@@unique([pendingTxId, participantId])`, `@@index([pendingTxId])` | ✅ |

### Índices ausentes — **MEDIUM**

| Consulta | Índice faltando | Impacto |
|----------|-----------------|---------|
| `dispute.service.ts:179` — `prisma.dispute.findFirst({ where: { tradeId, arbiterId } })` | `@@index([arbiterId, tradeId])` | O lookup por `arbiterId` + `tradeId` não tem índice composto. |
| `dispute.service.ts:252` — mesma query acima | idem | |
| `reputation.service.ts:170` — `prisma.user.findUnique({ where: { peerId } })` | `peerId` é `@unique` — OK, mas sem índice separado se usado em `findMany` | `peerId` tem `@unique`, então `findUnique` usa o unique constraint |
| `liquidity.service.ts:97` — `prisma.offer.findMany({ where: { asset, side, status } })` | `@@index([asset, side, status])` ✅ Já existe | OK |
| `escrow.service.ts:501` — `prisma.escrow.updateMany({ where: { id, status } })` | Sem índice em `[status]` | `id` é PK, mas `status` não está indexado |

### Índice em `Dispute.arbiterId` — **MEDIUM**

O campo `arbiterId` em `Dispute` não tem índice declarado. Queries como:
- `dispute.service.ts:179` — `findFirst({ where: { tradeId, arbiterId } })`
- `dispute.service.ts:252` — mesma query

Se houver muitos disputes, a busca por `arbiterId` pode fazer scan de tabela.

---

## 2. Foreign Keys

### FK para `Trade → Offer` — **Correto**

```prisma
offer       Offer       @relation(fields: [offerId], references: [id])
```

### FK para `Escrow → Trade` — **Correto**

```prisma
tradeId      String       @unique
trade        Trade        @relation(fields: [tradeId], references: [id])
```

✅ `@unique` em `tradeId` no `Escrow` — um trade tem exatamente um escrow.

### FK para `Dispute → Trade` + `Escrow` — **Correto**

```prisma
tradeId    String
trade      Trade          @relation(fields: [tradeId], references: [id])
escrowId   String
escrow     Escrow         @relation(fields: [escrowId], references: [id])
```

✅ Ambos os FKs são NOT NULL.

### FK para `Trade → Intent` (RFC-018) — **Correto**

```prisma
intentId    String?
intent      Intent?       @relation(fields: [intentId], references: [id])
```

✅ Opcional, nullable — oferece compatibilidade com ofertas/trades criados antes do RFC-018.

### FK para `EscrowParticipantKey → Escrow` — **Correto**

```prisma
escrowId      String
```

Não há relação Prisma declarada (apenas o campo). A verificação de integridade é feita em aplicação (`escrow.service.ts`).

### FK para `EscrowPendingTransaction → Escrow` — **Correto**

```prisma
escrowId           String   @unique
```

### FK para `EscrowTransactionSignature → EscrowPendingTransaction` — **Correto com cascade**

```prisma
pendingTxId      String
pendingTx        EscrowPendingTransaction @relation(
    fields: [pendingTxId], 
    references: [id], 
    onDelete: Cascade
)
```

✅ `onDelete: Cascade` — assinaturas são removidas quando a transação pendente é limpa.

### FK para `PaymentAccount → User` — **Correto**

```prisma
ownerId         String
owner           User          @relation(fields: [ownerId], references: [id])
```

### FK para `Vouch → User` (voucher/vouchee) — **Correto**

```prisma
voucherId   String
voucher     User      @relation("VouchesGiven", fields: [voucherId], references: [id])
voucheeId   String
vouchee     User      @relation("VouchesReceived", fields: [voucheeId], references: [id])
```

---

## 3. Unique Constraints

### Constraints definidos

| Model | Constraint | Observação |
|-------|------------|------------|
| `User` | `@unique` em `publicKey`, `peerId` | ✅ |
| `User` | `@unique` implícito em `id` (PK) | ✅ |
| `Escrow` | `@unique` em `tradeId` | ✅ Um trade → um escrow |
| `FeeDistribution` | `@unique` em `escrowId` | ✅ Um escrow → uma fee distribution |
| `Dispute` | `@@unique([tradeId])` | ✅ Um trade → um dispute (conforme comentado no schema) |
| `ArbiterProfile` | `@unique` em `participantId` | ✅ Um participante → um perfil de arbitro |
| `PaymentAccount` | `@unique` em `accountHash` | ✅ |
| `Vouch` | `@@unique([voucherId, voucheeId])` | ✅ Um vouch por par (voucher, vouchee) |
| `ReputationEvent` | `@@unique([tradeId, raterId])` | ✅ Um rating por (trade, rater) |
| `EscrowReleaseApproval` | `@@unique([escrowId, approverId])` | ✅ Um approval por (escrow, approver) |
| `EscrowParticipantKey` | `@@unique([escrowId, role])` | ✅ Uma key por (escrow, role) |
| `EscrowPendingTransaction` | `@unique` em `escrowId` | ✅ |
| `EscrowTransactionSignature` | `@@unique([pendingTxId, participantId])` | ✅ Uma assinatura por (pendingTx, participant) |

### Constraints ausentes — **LOW**

| Model | Constraint que poderia existir | Justificativa |
|-------|-------------------------------|---------------|
| `Offer` | `@unique([userId, asset, side])` | Evita ofertas duplicadas do mesmo usuário para o mesmo ativo/lado |
| `Intent` | `@unique([tradeId])` (via Trade.intentId) | Não aplicável — Intent é 1 para N (um intent pode gerar múltiplas ofertas/trades) |
| `Message` | (nenhum @unique além de ID) | OK — mensagens são eventos únicos |

---

## 4. Consultas

### 4.1 Queries analisadas

#### `trade.service.ts` — `getTrades()` (paginada)
```typescript
prisma.trade.findMany({
  where: { OR: [{ buyerId: participantId }, { sellerId: participantId }] },
  orderBy: { createdAt: 'desc' },
  take: limit,
  skip: offset,
  include: { escrow: true },
})
```
✅ Usa índices em `buyerId`/`sellerId` e `createdAt` (ordenado). Paginada com `take`/`skip`.

#### `trade.service.ts` — `getTrade()` (com includes)
```typescript
prisma.trade.findUnique({
  where: { id: tradeId },
  include: { escrow: true, messages: { orderBy: { createdAt: 'asc' } }, offer: true },
})
```
⚠️ **Inclui todos os messages** — se uma trade tiver milhares de mensagens, isso carrega todos em memória. Deveria ter paginação opcional.

#### `liquidity.service.ts` — `getOffers()` (filtrada + paginada)
```typescript
prisma.offer.findMany({
  where: { asset, side, status: 'ACTIVE' },
  orderBy: { priceUsd: side === 'SELL' ? 'asc' : 'desc' },
  take: limit,
  skip: offset,
  include: { user: { select: { reputationScore: true } } },
})
```
✅ Usa índice composto `[asset, side, status]`. Paginação correta.

#### `liquidity.service.ts` — `getAggregatedOffers()`
```typescript
// Ordena na memória após unir de múltiplos providers
const sorted = all.sort((a, b) =>
  side === 'BUY' ? Number(b.priceUsd) - Number(a.priceUsd) : Number(a.priceUsd) - Number(b.priceUsd)
)
```
⚠️ Ordenação na memória após paginação — funciona hoje (único provider real), mas não escala corretamente com múltiplos providers.

#### `escrow.service.ts` — `createEscrow()` + `lockFunds()`
```typescript
// lockFunds usa updateMany com optimistic concurrency:
prisma.escrow.updateMany({
  where: { id: escrowId, status: escrow.status },
  data: { status: 'FUNDS_LOCKED' },
})
```
✅ Padrão de "claim + verify count" para concorrência otimista — bom.

#### `dispute.service.ts` — `raiseDispute()`
```typescript
prisma.dispute.create({ 
  data: { tradeId, escrowId, ... } 
})
// catch P2002 → "A dispute has already been raised"
```
✅ `@@unique([tradeId])` captura race conditions.

#### `capability-registry.ts` — `listGrants()`
```typescript
prisma.capabilityGrant.findMany({
  where: { grantedTo, revokedAt: null },
  orderBy: { createdAt: 'desc' },
})
```
✅ Filtra por `revokedAt: null`. Mas **não há índice** em `[grantedTo, revokedAt]` — apenas em `[grantedTo]`.

#### `reputation.service.ts` — `getLeaderboard()`
```typescript
prisma.user.findMany({
  orderBy: { reputationScore: 'desc' },
  take: limit,
  select: { id: true, displayName: true, reputationScore: true, totalTrades: true },
})
```
⚠️ Sem índice em `reputationScore` — ordenação por pontuação faz scan de tabela em datasets grandes.

---

## 5. Joins / Includes

### Joins documentados no código

| Arquivo | Linha | Query | Tipo de join |
|---------|-------|-------|--------------|
| `trade.service.ts` | 134 | `include: { escrow: true, offer: true }` | 1:1 + 1:1 (N+1 se não otimizado) |
| `trade.service.ts` | 145 | `include: { messages: { orderBy: { createdAt: 'asc' } } }` | 1:N |
| `trade.service.ts` | 182 | `include: { escrow: true }` | 1:1 |
| `liquidity.service.ts` | 232 | `include: { user: { select: {...} } }` | N:1 (select específico) |
| `escrow.service.ts` | 1142 | `include: { signatures: true }` | 1:N |
| `proof.service.ts` | 196 | `include: { proofs: { include: { verifications: true } } }` | 1:2 (nested) |
| `handlers.ts` | 371 | `include: { offer: true }` | 1:1 |

### Joins problemáticos — **MEDIUM**

#### `trade.service.ts:145` — Carrega todas as mensagens
```typescript
include: { messages: { orderBy: { createdAt: 'asc' } } }
```
⚠️ **Nenhuma paginação** — uma trade com 10.000 mensagens carrega todas. O endpoint REST `GET /v1/openp2p/trades/:id` não oferece parâmetros de limite/offset para mensagens.

#### `proof.service.ts:196` — Nested include
```typescript
include: { proofs: { include: { verifications: true } } }
```
⚠️ Carrega todas as proofs + verifications de uma claim em um único query. Sem limit, pode ser pesado.

---

## 6. Paginação

### Implementada corretamente — **2 arquivos**

#### `trade.service.ts` — `getTrades()`
```typescript
const limit = Math.min(Math.max(pagination?.limit ?? 10, 1), 50)
const offset = Math.max(pagination?.offset ?? 0, 0)
// [...]
const [trades, total] = await Promise.all([
  prisma.trade.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset, include: { escrow: true } }),
  prisma.trade.count({ where }),
])
return { trades, total, hasMore: offset + trades.length < total }
```
✅ `take`/`skip` + `count` paralelo + `hasMore`. Limit clamp 1-50, default 10.

#### `dispute.service.ts` — `listForArbiter()`
```typescript
const limit = Math.min(Math.max(pagination?.limit ?? 10, 1), 50)
const offset = Math.max(pagination?.offset ?? 0, 0)
const [disputes, total] = await Promise.all([...])
return { disputes, total, hasMore: offset + disputes.length < total }
```
✅ Mesmo padrão.

#### `liquidity.service.ts` — `getOffers()`
```typescript
const limit = Math.min(Math.max(pagination?.limit ?? 10, 1), 50)
const offset = Math.max(pagination?.offset ?? 0, 0)
```
✅ Mesmo padrão.

### Paginação ausente — **MEDIUM**

| Endpoint | Query | Problema |
|----------|-------|----------|
| `GET /v1/openp2p/trades/:id` | `getTrade()` inclui todas as `messages` | Sem paginação de mensagens |
| `GET /v1/openp2p/chat/:tradeId/messages` | `prisma.message.findMany({ where: { tradeId } })` | Sem `take`/`skip` — carrega todas as mensagens |
| `GET /v1/liquidity/offers` | `getAggregatedOffers()` pagina na memória | Funciona com 1 provider, mas não com múltiplos |
| `GET /v1/reputation/leaderboard` | `findMany({ orderBy: { reputationScore: 'desc' } })` | Sem paginação — retorna todos os participantes |

---

## 7. Migrações

### Estratégia: `prisma db push` — **AUSENCIA DE MIGRAÇÕES REGRA**

**Localização**: `prisma/schema.prisma` (não há diretório `prisma/migrations/`)

- **Nenhum arquivo de migração** existe no repositório
- **`package.json`'s `db:migrate`** comandado corrigido de `prisma migrate dev` → `prisma db push` (conforme documento em `docs/DEPLOYMENT.md`)
- **`docker-compose.yml`** usa `npx prisma db push` no service `migrate`
- **Produção** (AWS App Runner): `prisma db push` rodado uma vez manualmente contra RDS

**Problema — ** **CRITICAL**: 
- `db push` **não mantém histórico de migrações**
- Impossível fazer rollback seletivo
- Impossível de ver quais mudanças foram aplicadas quando
- Risco de `db push` alterar colunas de forma inesperada em ambientes compartilhados

### Recomendação (sem implementação)
Migram para `prisma migrate dev` / `prisma migrate deploy`:
1. Gerar migration inicial: `prisma migrate dev --name init`
2. Futuras mudanças: `prisma migrate dev --name <descriptive_name>`
3. Produção: `prisma migrate deploy`

---

## 8. Normalização

### Análise de normalização

#### `User` — ✅ 3NF (bem normalizada)
- Todos os campos são atômicos
- `reputationScore`, `totalTrades`, etc. são campos agregados que duplicam dados calculados, mas isso é uma **intencional denormalization** para evitar recalcular em cada query

#### `Offer` — ✅ 3NF
- `priceUsd` e `priceBrl` como Decimals separados — aceitável (representam preços distintos de compra/venda, não duplicação)
- `paymentMethod` e `paymentDetails` como campos diretos — não há tabela separada de métodos de pagamento

#### `Trade` — ✅ 3NF
- Todos os campos são atômicos e específicos do trade

#### `Escrow` — ✅ 3NF
- Campos como `multisigAddr`, `redeemScript`, `txLockId`, `txReleaseId` são todos específicos do estado do cofre

#### `EscrowParticipantKey` — ✅ 3NF
- Modelo separado corretamente para chaves de participantes (1:N com Escrow)

#### `EscrowPendingTransaction` — ✅ 3NF
- Campos `toAddress`, `toAddressSecondary` — aceitável (diferentes destinos para split)

#### `Dispute` — ✅/⚠️ 3NF com campos JSON
```prisma
evidence   Json           @default("[]")
autoResolutionReasoning      String?
```
- `evidence` como JSON — **potencial problema de normalização**. Deveria ser uma tabela separada `DisputeEvidence` com campos (`type`, `uri`, `note`, `submittedBy`, `submittedAt`).
- `autoResolutionReasoning` como String — aceitável (campo único)

#### `Claim`/`Proof`/`Verification` — ✅ 3NF
- `assertion` e `evidence` como JSON — **potencial problema**. Deveriam ser tabelas normalizadas para queries mais eficientes.

#### `CapabilityGrant` — ✅ 3NF
- `scope` como `String[]` — Prisma serializa como texto, funcional mas limitado para queries complexas.

#### `ReputationEvent` — ✅ 3NF
- Campos atômicos apropriados

#### `PaymentAccount` — ✅ 3NF
- `accountHash` como hash (não armazena raw account) — correto por segurança

#### `Vouch` — ✅ 3NF
- Simples e direto

#### `FeeDistribution` — ✅ 3NF
- Campos atômicos para cada participante do split

### Denormalization intencional

| Tabela | Campo | Motivo |
|--------|-------|--------|
| `User` | `reputationScore`, `totalTrades`, `disputeCount` | Evita recalcular em cada query — `recordOutcome()` atualiza atomicamente |
| `User` | `cumulativeFeesObserved` | RFC-021 D4 — floor de custo para fabricar reputação |
| `ArbiterProfile` | `arbiterReputation`, `rulingsTotal`, `rulingsOverturned` | Métricas de track record do arbitro |
| `PaymentAccount` | `completedTrades`, `chargebacks` | Métricas de confiabilidade por conta de pagamento |

---

## Resumo

| Categoria | Crítico | Alto | Médio | Baixo | Total |
|-----------|---------|------|-------|-------|-------|
| Índices | — | — | 1 (Dispute.arbiterId) | 1 (ReputationEvent) | 2 |
| Foreign keys | — | — | — | — | 0 |
| Unique constraints | — | — | — | 2 (Offer duplicado, payment account) | 2 |
| Consultas | — | — | 2 (scan table, N+1 risk) | — | 2 |
| Joins / Includes | — | — | 2 (mensagens sem paginação) | — | 2 |
| Paginação | — | — | 4 (mensagens, leaderboard) | — | 4 |
| Migrações | 1 (db push vs migrate) | — | — | — | 1 |
| Normalização | — | — | 2 (JSON fields) | — | 2 |

### Recomendações Prioritárias (sem implementação)

1. **Migrar de `prisma db push` para `prisma migrate`** — estabelecer histórico de migrações para produção
2. **Adicionar `healthcheck` ao compose para o app** — usar o endpoint `/health` já existente
3. **Adicionar índice em `ReputationEvent`** para `reputationScore` ou usar materialized view para leaderboard
4. **Pagar mensagens no endpoint `GET /v1/openp2p/chat/:tradeId`** — adicionar `limit`/`offset` query params
5. **Normalizar campos JSON** (`Dispute.evidence`, `Claim.assertion`, `Proof.evidence`) — tabelas dedicadas para queries eficientes
6. **Revisar joins N+1** — `getTrade()` inclui todos os messages e ofer, pode gerar consultas excessivas
7. **Considerar materialized view** para `User.reputationScore` — ordenação por score no leaderboard faz scan de tabela