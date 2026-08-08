# Sails P2P Trading SDK — Relatório de Auditoria Docker

> **Escopo**: Análise de infraestrutura Docker (`Dockerfile`, `docker-compose.yml`, `.dockerignore`, `scripts/docker-test.sh`, integração CI)
> **Instrução**: Identificação de problemas — nenhuma implementação foi feita.
>
> **⚠️ SUPERSEDIDO — verificado 2026-08-08**: as descobertas "críticas" deste relatório (ordem de COPY no Dockerfile, healthcheck do serviço `app` ausente, portas expostas do Postgres/Redis, sem `restart` policy, `prisma db push` em vez de `migrate`) descrevem um estado anterior a 2026-08-07 e já não procedem — verificado diretamente contra `Dockerfile`/`docker-compose.yml`/`package.json` reais, não assumido. Ver `docs/DOCKER_IMPROVEMENTS.md` (que documenta os fixes reais já aplicados) e `prisma/migrations/` (a migração real já existe em disco). Mantido aqui como registro histórico — não usar como lista de pendências.

---

## 1. Imagens Pesadas

### Base: `node:20-bookworm-slim` — **Justificado** (não um problema)

| Aspecto | Status |
|--------|--------|
| **Distribuição** | Bookworm (glibc) — escolha deliberada e documentada |
| **Tag sem versão fixa** | `node:20-bookworm-slim` — usa tag `20` (major), não `20.x.y` (patch) |
| **Tamanho base** | ~150MB (slim) vs ~900MB (full) — adequado |

**Observação**: A escolha de `bookworm-slim` sobre `alpine` é **correta e documentada** no próprio header do Dockerfile — as dependências nativas (`sodium-native`, `tiny-secp256k1`) não têm binários pré-compilados confiáveis para musl.

### Build tools no stage `builder` — **Justificado**

Python3, make, g++ são instalados apenas no stage `builder` e pruned no stage `runtime` via `npm prune --omit=dev`. Configuração correta.

### PostgreSQL e Redis — **Leve otimização possível**

| Serviço | Imagem | Observação |
|---------|--------|------------|
| postgres | `postgres:16-alpine` | Alpine é leve (~50MB). Adequado. |
| redis | `redis:7-alpine` | Alpine é leve (~30MB). Adequado. |

---

## 2. Build Lento

### Cache de dependências invalidado — **CRITICAL**

**Localização**: `Dockerfile`, linhas 35-49

```dockerfile
COPY . .                          # ← Copia TODO o código fonte ANTES do npm ci
RUN npm ci --ignore-scripts
RUN npx prisma generate
RUN npm run build
```

**Problema**: O `COPY . .` vem **antes** do `npm ci`, copiando o código-fonte completo antes de instalar dependências. Qualquer mudança em qualquer arquivo `.ts` invalida o cache do `npm ci`, forçando reinstalação completa de dependências a cada build.

**Impacto**: Builds incrementais sempre reinstalam todas as dependências mesmo quando `package-lock.json` não mudou.

### Solução sugerida (sem implementação):

Reordenar para:
```dockerfile
COPY package*.json ./             # ← Copia apenas lockfile primeiro
RUN npm ci --ignore-scripts
RUN npx prisma generate
COPY . .                          # ← Agora copia o código fonte
RUN npm run build
WORKDIR /app                    # ← Workdir antes do COPY
```

---

## 3. Cache Desperdiçado

### `.dockerignore` não exclui `packages/` build artifacts

**Localização**: `.dockerignore`, linhas 1-28

O `.dockerignore` exclui `dist` e `**/dist` no topo, mas **não exclui especificamente**:
- `packages/*/node_modules` (apenas `**/**/node_modules` genérico, que pode não alcançar nested workspaces)
- `packages/*/dist` (mesmo problema)
- `packages/*/coverage`
- `.turbo`, `.next` (next apenas)

**Problema**: O contexto de build inclui arquivos de build de packages, aumentando o tamanho do contexto enviado ao daemon Docker.

### Multi-stage com `builder` e `pruned` e `runtime` — **Correto**

Três estágios distintos:
1. `builder` — instala dependências, gera Prisma, compila TypeScript
2. `pruned` — deriva de `builder`, remove devDependencies
3. `runtime` — copia apenas production artifacts do `pruned`

---

## 4. docker-compose.yml

### 4.1 Portas expostas desnecessariamente — **MEDIUM**

| Serviço | Portas |
|---------|--------|
| postgres | `"5432:5432"` |
| redis | `"6379:6379"` |

**Problema**: Em desenvolvimento local, essas portas não precisam ser expostas para o host. Apenas o app (`"3000:3000"`) precisa ser acessível.

### 4.2 `app` usa `target: builder` — **Documentado, mas custo**

O serviço `app` builda direcionado ao estágio `builder` (com devDependencies) para incluir `pino-pretty` nos logs de desenvolvimento. Isso é **correto para desenvolvimento local**, mas:

- O mesmo `builder` estágio é usado pelo serviço `migrate`, que também precisa do `prisma` CLI.
- Em produção (App Runner), o `Dockerfile` usa `runtime` (slim, sem devDependencies) — configuração separada e correta.

### 4.3 Ordem de startup — **Correto**

```yaml
app:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    migrate:
      condition: service_completed_successfully
```

✅ Depende de PostgreSQL e Redis saudáveis.
✅ Depende do migrate completar com sucesso.

### 4.4 Ausência de `restart_policy` — **MEDIUM**

Nenhum serviço define `restart:`, deixando o comportamento padrão (`no`). Em desenvolvimento local, isso é aceitável, mas para staging/production seria um problema.

---

## 5. Volumes

### Volumes nomeados — **Correto**

```yaml
volumes:
  sails-postgres-data:
  sails-redis-data:
```

✅ PostgreSQL e Redis usam volumes nomeados para persistência.
✅ App não usa volume (stateless, correto).

---

## 6. Networking

### Rede padrão — **Correto**

✅ `docker-compose.yml` não define redes customizadas — Docker Compose cria uma rede default para o projeto, isolando os containers.

### Conectividade entre serviços — **Correto**

| Serviço | Conecta a |
|---------|-----------|
| app | `postgres:5432`, `redis:6379` (via nomes de serviço) |
| migrate | `postgres:5432` |

✅ Usa nomes de serviço como hostnames (Docker DNS interno).

---

## 7. Health Checks

### PostgreSQL — **Presente, adequado**

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres -d sails_protocol"]
  interval: 5s
  timeout: 5s
  retries: 10
```

✅ Comando adequado para PostgreSQL 16.

### Redis — **Presente, adequado**

```yaml
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 5s
  timeout: 5s
  retries: 10
```

✅ Comando padrão para Redis.

### App — **AUSENTE** ⚠️

**Problema**: O serviço `app` não tem `healthcheck` definido, apesar de ter o endpoint `GET /health` no `src/app.ts:161`.

**Impacto**: O `docker-test.sh` faz polling manual via curl, mas o compose não pode usar `condition: service_healthy` para o app.

### Scripts de teste Docker — **Latência**

`tests/integration/docker.test.ts` usa `jest.setTimeout(120_000)` (2 minutos) — indica builds lentos.

---

## 8. Startup Order

### Ordem correta, mas ausência de retry — **MEDIUM**

```yaml
app:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    migrate:
      condition: service_completed_successfully
```

✅ Ordem: Postgres → Redis → Migrate → App.

⚠️ **Ausência de `restart: retry`** no `app` — se o app falhar no startup (por exemplo, se o migrate ainda não terminou), o compose não tenta reiniciar.

---

## 9. Versionamento de Imagem

### Tags sem versionamento — **LOW**

| Imagem | Tag |
|--------|-----|
| postgres | `postgres:16-alpine` |
| redis | `redis:7-alpine` |
| node | `node:20-bookworm-slim` |

**Observação**: Usam tags major (`16`, `7`, `20`) sem pinagem de minor/patch. Para ambientes de produção, **digest pinning** (`postgres@sha256:...`) seria ideal para builds determinísticos.

---

## 10. Integração CI

### CI pipeline — `ci.yml`, linha 33-34

```yaml
- name: Run Docker integration test
  run: bash ./scripts/docker-test.sh
```

**Problema**: O CI não define `working-directory` para `./sails-push-ready`, embora a etapa de build local (`npm test`, linha 31) já tenha `working-directory: ./sails-push-ready` (linha 14).

⚠️ Se o checkout do CI muda para raiz do repo, o `bash ./scripts/docker-test.sh` pode não encontrar o script.

### `docker-test.sh` — **Limpeza adequada**

✅ Faz `docker compose up -d --build`
✅ Faz polling do health endpoint
✅ Faz `docker compose down` no final

⚠️ Usa `bash` diretamente (não `#!/bin/bash` shebang explícito no script) — funciona no CI (ubuntu) mas é uma convenção implícita.

---

## 11. `.dockerignore` Review

✅ Exclui `node_modules`, `dist`, `.git`, `*.log`
✅ Mantém `!/.env.example` (intencional — útil para desenvolvimento)
✅ Exclui artifacts de contratos: `contracts/cache`, `contracts/artifacts`

⚠️ **Não exclui explicitamente** `packages/*/node_modules` — confia no padrão `**/node_modules` do topo.

---

## Resumo

| Categoria | Crítico | Alto | Médio | Baixo | Observação |
|-----------|---------|------|-------|-------|------------|
| Imagens pesadas | — | — | — | 1 (docker compose não tem restart) | `node:20-bookworm-slim` justificado |
| Build lento | 1 (COPY . . antes do npm ci) | — | — | — | Cache de dependências invalidado |
| Cache desperdiçado | — | 1 (.dockerignore não otimizado) | — | — | Contexto de build maior que necessário |
| docker-compose | — | 1 (app usa builder stage) | 1 (ports expostas) | — | Configuração correta para dev |
| Volumes | — | — | — | — | Correto |
| Networking | — | — | — | — | Rede default correta |
| Health checks | — | — | — | 1 (app sem healthcheck) | PostgreSQL/Redis OK, app ausente |
| Startup order | — | — | 1 (sem restart retry) | — | Ordem correta, mas sem retry |
| Versionamento | — | — | — | 1 (tags sem pin) | Tags major sem digest pin |
| CI | — | — | 1 (working-directory não definido) | — | Pode quebrar se raiz mudar |

### Recomendações Prioritárias (sem implementação):

1. **Reordenar Dockerfile** — mover `COPY package*.json` antes de `COPY . .` para preservar cache de npm ci.
2. **Adicionar `healthcheck`** ao service `app` (usar o endpoint `/health` já existente).
3. **Adicionar `restart: on-failure` com retry** ao service `app` no compose.
4. **Remover portas expostas** de postgres e redis no compose (não são necessárias para desenvolvimento local).
5. **Definir `working-directory: ./sails-push-ready`** no step de Docker do CI.
6. **Considerar digest pinning** para imagens de base em produção.