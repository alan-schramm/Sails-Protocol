# Sails P2P Trading SDK — Relatório de Código Morto

> **Escopo**: Remoção de código morto verificado via `tsc --noUnusedLocals --noUnusedParameters` e busca de usos em toda a base de código.
> **Instrução**: Apenas remoções seguras foram feitas. Testes existentes continuaram passando após as mudanças.

---

## 1. Remoções Realizadas

### 1.1 Imports não utilizados

| Arquivo | Linha | Import removido | Verificado por |
|---------|-------|-----------------|---------------|
| `src/config/index.ts` | 7 | `import { validateConfig } from "./validation"` | `tsc --noUnusedLocals` |
| `src/modules/open-settlement/escrow.service.ts` | 5 | `EscrowStatus` (manteve `EscrowType`) | `tsc --noUnusedLocals` |

### 1.2 Parâmetros não utilizados

| Arquivo | Função | Parâmetro |
|---------|--------|-----------|
| `packages/sails-sdk/src/custody/evm-4337.ts` | `buildRefund` | `escrowAccount` → `_escrowAccount` |
| `packages/sails-sdk/src/wallet-adapter-mock.ts` | `broadcastTransaction` | `signedTx` → `_signedTx` |
| `packages/sdk-react/src/hooks/useSailsProof.ts` | `useSailsProof` | `proofId` → `_proofId` |

### 1.3 Funções nunca chamadas (testes)

| Arquivo | Função removida | Verificado por |
|---------|-----------------|---------------|
| `packages/sdk-react/tests/useSailsLiquidity.test.tsx` | `errorClient()` | grep — nenhuma chamada |
| `packages/sdk-react/tests/hooks/useSailsEscrow.test.tsx` | parâmetro `url` em 2 callbacks `handleRequest` | `tsc --noUnusedLocals` |

### 1.4 Arquivos removidos

| Arquivo | Motivo |
|---------|--------|
| `src/config/validation.ts` | Stub de 5 linhas (`validateConfig` retornava `config` sem validar). Nenhum importador após remoção do `validateConfig` em `config/index.ts`. |

---

## 2. Validação

### 2.1 Backend (`src/`)
```
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
→ 0 erros (antes: 2)
```

### 2.2 SDK (`packages/sails-sdk/src/`)
```
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
→ 0 erros (antes: 2)
```

### 2.3 React SDK (`packages/sdk-react/src/`)
```
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
→ 0 erros relacionados a unused (apenas erros de tipo pré-existentes não relacionados)
```

### 2.4 Testes
```
npx jest --testPathPatterns='routes|chat-encryption|escrowRelease|paymentAccountHash'
→ 4 suites, 129 testes, todos passando (13.43s)
```

---

## 3. Código Morto Identificado MAS NÃO Removido

### 3.1 `src/core/policy-engine.ts` — STUB rotulado

**Motivo da não remoção**: O arquivo é claramente rotulado como STUB para `FeePolicy`/`TrustPolicy`/`RoutingPolicy`/`policyEngine` — implementações governadas multi-stakeholder planejadas para PROTOCOL_ECONOMY.md §7 (Months 10-12). Comentário explícito:

```typescript
/**
 * STUB — get/propose/activate below (the GOVERNED, versioned
 * policy-storage system...) are still deliberately unimplemented
 */
```

**Recomendação**: Manter — stub explicitamente documentado como trabalho futuro.

### 3.2 `EventStore` implementations — `InMemoryEventStore`/`RedisStreamsEventStore`

**Motivo da não remoção**: `event-store.ts` define duas implementações da interface `EventStore`. Apenas `InMemoryEventStore` é instanciada por padrão em `event-bus.ts`. `RedisStreamsEventStore` é mantida como alternativa documentada.

**Recomendação**: Manter — `RedisStreamsEventStore` é parte do design planejado.

### 3.3 `src/demo/*` — Arquivos não importados

**Análise**: `multisig-demo.ts` e `pix-to-usdt-flow.ts` em `src/demo/` não são importados por nenhum arquivo. Esses são scripts de demonstração standalone (executáveis via `tsx src/demo/...`).

**Recomendação**: Manter — são documentação executável, não código morto. Documentados em `docs/EXAMPLES.md`.

### 3.4 `feeDistribution` em `prisma schema` — Nunca consultado

**Análise**: `FeeDistribution` é criada em `escrow.service.ts:373` via `prisma.feeDistribution.create()` mas nunca é lida (`find*` ou `findUnique`).

**Motivo da não remoção**: Documentado como "bookkeeping real" para RFC-021 D1/D4 queries futuras. Não é dead code ainda — é persistência intencional para auditoria.

---

## 4. Resumo Estatístico

| Tipo | Itens Removidos |
|------|-----------------|
| Imports não usados | 2 |
| Parâmetros renomeados para `_` | 3 |
| Funções nunca chamadas | 1 |
| Parâmetros de callback não usados | 2 |
| Arquivos stub removidos | 1 |
| **Total de remoções** | **9 itens** |

---

## 5. Notas Operacionais

- **Erros de tipo pré-existentes** no React SDK (`tests/useSailsLiquidity.test.tsx:112`, `tests/useSailsReputation.test.tsx:104,116`) **não foram modificados** — são erros de tipo em dados de teste que precisam ser corrigidos separadamente (mudança na forma do input, não em imports).
- **Problema ESM/CJS pré-existente** em `packages/sails-sdk` (`wallet-adapter-mock.test.ts`) **não foi tocado** — `npx jest` direto baixa versão incorreta do jest. `npm test` (já documentado no contexto) é o método correto.