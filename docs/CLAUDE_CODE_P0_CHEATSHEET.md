# P0 Cheatsheet — Claude Code

> **Rápido:** 8 fixes críticos antes de apresentação a parceiros.
> **Tempo estimado:** 1-2 dias.
> **Validação:** `npx tsc --noEmit` e `npm test` após cada fix.

---

## Fix 1: Prefixo inconsistente (5 min)

**Arquivo:** `src/routes/intentRoutes.ts`

```
Linha 69:  '/api/v1/intents'  →  '/v1/intents'
Linha 99:  '/api/v1/intents/:id'  →  '/v1/intents/:id'
```

---

## Fix 2: Status redundante (15 min)

**Arquivo:** `src/modules/open-settlement/settlement.routes.ts`

- Linha 120-122: Remover `status` da função `success()`
- ~25 chamadas: `success(data, 201)` → `success(data)`

---

## Fix 3: package.json metadata (10 min)

**Arquivos:**
- `package.json` (root)
- `packages/sails-sdk/package.json`
- `packages/sdk-react/package.json`
- `packages/sails-p2p-schemas/package.json`

Adicionar em cada um:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/alan-schramm/Sails-Protocol.git"
},
"keywords": ["sails", "p2p", "bitcoin", "escrow", "sdk"]
```

---

## Fix 4: prepublishOnly (5 min)

**Arquivos:** Todos os `packages/*/package.json`

Adicionar em `"scripts"`:

```json
"prepublishOnly": "npm run build && npm run typecheck"
```

---

## Fix 5: exports map (10 min)

**Arquivo:** `packages/sails-p2p-schemas/package.json`

Adicionar:

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

Mudar build para `tsup` (criar `tsup.config.ts` idêntico aos outros packages).

---

## Fix 6: README (15 min)

**Arquivo:** `README.md`

1. Adicionar badges após título:

```markdown
[![CI](https://github.com/alan-schramm/Sails-Protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/alan-schramm/Sails-Protocol/actions)
[![npm version](https://img.shields.io/npm/v/@sails/sdk)](https://www.npmjs.com/package/@sails/sdk)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
```

2. Linha 159: Remover frase órfã `## If you're actively editing code`

---

## Fix 7: Limpar git (5 min)

```bash
git rm -r --cached graphify-out/
git rm --cached GITHUB_ORGANIZATION.md
```

Adicionar ao `.gitignore`:

```
graphify-out/
GITHUB_ORGANIZATION.md
*.txt
```

---

## Fix 8: console.* → app.log (30 min)

**25 ocorrências em 6 arquivos:**

| Arquivo | Linhas | Total |
|---------|--------|-------|
| `src/app.ts` | 258, 267, 286, 305, 308, 320, 323 | 7 |
| `src/infrastructure/p2p/pear.service.ts` | 131, 149, 164, 176, 195, 215, 232, 244, 261, 266 | 10 |
| `src/common/events/event-store.ts` | 93, 109 | 2 |
| `src/common/events/handlers.ts` | 454, 525, 543 | 3 |
| `src/common/database/index.ts` | 38 | 1 |
| `src/common/redis/index.ts` | 17, 26 | 2 |

**Padrão:**

```typescript
// ANTES:
console.log(`[Pear] Node started`)

// DEPOIS:
app.log.info({ msg: 'Node started', module: 'Pear' })
```

Para arquivos sem `app.log`, criar logger local com `pino({ name: '...' })`.

---

## Validação Final

```bash
npx tsc --noEmit          # 0 erros
npm test                  # 689/689 passando
```

---

## Referência Completa

`docs/PRODUCTION_READINESS_FIXES.md` — Lista completa com linhas exatas e código antes/depois.
