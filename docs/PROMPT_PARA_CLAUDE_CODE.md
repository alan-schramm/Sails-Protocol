# Prompt para Claude Code — Handoff Completo

> **Cole este prompt no Claude Code para iniciar o trabalho.**

---

## PROMPT:

```
Olá Claude Code. Você é o Engenheiro Chefe do Sails Protocol.

Eu (o CTO) e o Arquiteto realizamos uma sessão completa de auditoria, análise e implementação. Agora é sua vez de assumir. Antes de começar a codar, LEIA os documentos na ordem abaixo para entender tudo que foi feito e o que precisa ser implementado.

---

## PASSO 1: LEIA ESTES DOCUMENTOS (na ordem)

### Documentos Principais (obrigatórios):
1. `docs/PRODUCTION_READINESS_FIXES.md` — 22 fixes com linhas exatas e código antes/depois
2. `docs/TECHNICAL_DEBT_AUDIT.md` — 45 itens de dívida técnica invisível organizados por impacto
3. `docs/CTO_DUE_DILIGENCE_REPORT.md` — Due diligence com 7 BLOCKERs, 21 ALTO, 19 MÉDIO, 9 BAIXO
4. `docs/CLAUDE_CODE_P0_CHEATSHEET.md` — Referência rápida dos fixes críticos
5. `CLAUDE.md` — Seu papel e responsabilidades

### Documentos de Referência (leia depois):
6. `docs/TECHNICAL_GUIDELINES.md` — Diretrizes técnicas com 90+ achados detalhados
7. `docs/DX_AUDIT_REPORT.md` — Auditoria de Developer Experience
8. `docs/TEST_AUDIT_REPORT.md` — Auditoria de testes com cenários não cobertos
9. `docs/CHANGELOG_2026_08_07_IMPLEMENTATION.md` — Detalhes das implementações P1-P4
10. `docs/DEAD_CODE_REMOVAL_REPORT.md` — Código morto já removido (feito)
11. `docs/CLEANUP_2026_08_07.md` — Limpeza do repositório já feita (feito)

---

## PASSO 2: ENTENDA O QUE JÁ FOI FEITO

### FASE 0 — Implementações anteriores (já feitas):
- Migração Prisma (db push → migrate)
- Índices para performance (Dispute.arbiterId+status, User.reputationScore)
- Testes React hooks (useSailsTrade, useSailsTrades)
- Paginação de endpoints (leaderboard, chat messages)
- Documentação (CHANGELOG, CLAUDE.md, SDK_GUIDE)

### FASE 1 — Fixes de Arquitetura (24 fixes JÁ implementados e verificados):
- 57 suites, 689 testes passando, 0 falhas
- 0 erros TypeScript

Os 24 fixes foram:
1. event-bus.ts — Removido `| string` da union de eventos tipados
2. identity.routes.ts — Validação hex 64 chars para publicKey
3. trade.routes.ts — Limites `limit` (1-100) e `offset` (>=0)
4. chat.routes.ts — `content.max(10000)` e `msgType` como enum
5. config/index.ts — Production guard para mockSettlement
6. escrow.service.ts — Null check antes de finalizeSplit
7. liquidity.service.ts — Removidos 3 `as any` desnecessários
8. settlement.routes.ts — `asset` agora usa `z.enum(...)`
9. settlement.routes.ts — `evidence` agora valida com schema tipado
10. config/index.ts — Removido `config.server` duplicado
11. config/index.ts — `mockEscrow`/`mockSettlement` case-insensitive
12. config/index.ts — `requiredInt()` helper para env vars
13. proof.service.ts — Removido `as any` redundante em verdict
14. proof.service.ts — `Prisma.InputJsonValue` para campos JSON
15. liquidity.routes.ts — `as AssetType` substituindo `as any`
16. dispute.service.ts — `as DisputeStatus` substituindo cast
17. settlement.routes.ts — Removido `as any` redundante em paymentMethod
18. escrow.service.ts — Extraído `initiateSignatureCollection()`
19. auth.ts — Adicionado `AuthenticatedRequest` interface
20. client.ts (SDK) — Extraído `requireWallet()`
21. routes.test.ts — Corrigidos 14 testes pré-existentes
22-24. Múltiplos — Casts `as any` → tipos específicos

### FASE 2 — Arquivos Criados (já existem no repositório):
- `.github/workflows/ci.yml` — CI com typecheck, testes, build (Node 22)
- `SECURITY.md` — Política de segurança
- `CODE_OF_CONDUCT.md` — Código de conduta
- `SUPPORT.md` — Guia de suporte
- `.gitignore` — Atualizado com graphify-out/, GITHUB_ORGANIZATION.md, *.txt
- `CHANGELOG.md` — Atualizado com todas as entradas
- `CLAUDE.md` — Atualizado com status da auditoria

### FASE 3 — Limpeza Já Realizada:
- 10 arquivos de teste dump removidos
- 1 teste duplicado removido (useSailsProof.test.tsx)
- 1 dump.rdb removido
- Dead code removido (imports, parâmetros, funções não utilizados)
- Verificado com `tsc --noUnusedLocals --noUnusedParameters` — 0 erros

---

## PASSO 3: O QUE VOCÊ PRECISA IMPLEMENTAR

### P0 — BLOCKERs (antes de qualquer apresentação) — 1-2 dias:

Estes são os 7 BLOCKERs do CTO_DUE_DILIGENCE_REPORT.md que impedem aprovação:

1. **CORS permite qualquer origem** — `src/app.ts:42-45` — Whitelist de origens, default deny
2. **Sem auditoria forense persistente** — `event-store.ts` — Implementar RedisStreamsEventStore
3. **MOCK é default** — `config/index.ts:73-74` — Em produção, forçar `mockEscrow: false`
4. **Sem headers de segurança** — `src/app.ts` — Adicionar `@fastify/helmet`
5. **Sem estratégia de migração** — JÁ FEITO (Prisma migrate)
6. **Sem testes de carga** — Criar baseline de performance
7. **Sem observabilidade** — Adicionar métricas básicas

Além dos BLOCKERs, implementar os fixes do PRODUCTION_READINESS_FIXES.md:
8. Fixar prefixo `/api/v1/` → `/v1/` em intentRoutes.ts (linhas 69 e 99)
9. Remover `status` redundante do response body (settlement.routes.ts)
10. Adicionar `repository`/`keywords` em package.json
11. Adicionar `prepublishOnly` nos packages
12. Adicionar `exports` map em @sails/p2p-schemas
13. Fixar README (badges, frase órfã)
14. Remover graphify-out/ e GITHUB_ORGANIZATION.md do git
15. Migrar 25 `console.*` para `app.log`
16. Silent error swallowing `.catch(() => {})` — 8 locais
17. Versão da API duplicada → constante
18. Pagination defaults → constantes

### P1 — ALTO (antes de beta público) — 1 semana:

Do CTO_DUE_DILIGENCE_REPORT.md:
- Token sessão TTL 1h sem refresh → Implementar refresh token
- Rate limit em rotas de mutação críticas → Adicionar limits específicos
- Circuit breakers para dependências externas → Implementar
- WebSocket sem heartbeat/ping → Adicionar ping a cada 30s
- CORS, Helmet, observabilidade → Refinar

Do TECHNICAL_DEBT_AUDIT.md:
- Logging → pino padronizado
- `as any` → eliminação completa
- Config accessor → padronizar
- `participantId()` → extrair para shared util
- Regex pré-compilada

Do DX_AUDIT_REPORT.md:
- Aliases confusos (sdk.auth vs sdk.identity) → Documentar 1 canônico
- negotiate() lança erro sem alternativa óbvia → Melhorar mensagem
- API de Intent inconsistente → Padronizar

### P2 — MÉDIO (antes de GA) — 1 mês:

Do CTO_DUE_DILIGENCE_REPORT.md:
- Seed phrase WDK em env var → Usar Secrets Manager
- Trust proxy não configurado → Configurar
- Sem graceful degradation → Implementar
- payment-account route não valida ownership → Adicionar validação

Do TECHNICAL_DEBT_AUDIT.md:
- Config → injetável
- Prisma/Redis → injetáveis
- Event names → constantes
- Status strings → enums
- SDK → interfaces abstratas

Do TEST_AUDIT_REPORT.md:
- Escrow SPLIT ruling não testado → Criar testes
- Escrow TIMED OUT sweeper não testado → Criar testes
- Dispute auto-resolution contest → Melhorar cobertura
- Escrow dual-approval não testado → Criar testes

### P3 — BAIXO (roadmap) — trimestre:

Do TECHNICAL_DEBT_AUDIT.md:
- handlers.ts → split per module
- escrow.service.ts → extrair sub-módulos
- Singletons → DI container
- RedisStreamsEventStore → implementar

Do CTO_DUE_DILIGENCE_REPORT.md:
- Sem CSP nonce por request
- Logs podem conter dados sensíveis → Redact

---

## PASSO 4: REGRAS DE EXECUÇÃO

1. **NÃO altere comportamento** — fixes são cosméticas, segurança ou observabilidade
2. **NÃO mova arquivos** — apenas edits inline (exceto P3)
3. **Execute um fix por vez** — commits separados
4. **Valide CADA fix** — rode `npx tsc --noEmit` e `npm test` após cada grupo
5. **Commit separado** para cada fix — mensagens descritivas
6. **Atualize o CHANGELOG** com cada fix
7. **Se encontrar algo que não bate** — me pergunte antes de mudar

---

## PASSO 5: EXECUÇÃO

Comece pelo P0 (BLOCKERs). Para cada fix:
1. Leia o documento de referência
2. Localize o arquivo e a linha exata
3. Implemente o fix
4. Valide com `npx tsc --noEmit` e `npm test`
5. Faça commit com mensagem descritiva
6. Passe para o próximo fix

Quando terminar o P0, me avise. Then discutiremos P1.

---

## REFERÊNCIA RÁPIDA

| Prioridade | Documento Principal | Itens | Esforço |
|------------|-------------------|-------|---------|
| P0 (BLOCKERs) | `CTO_DUE_DILIGENCE_REPORT.md` | 7 BLOCKERs + 11 fixes | 1-2 dias |
| P1 (ALTO) | `TECHNICAL_DEBT_AUDIT.md` + `DX_AUDIT_REPORT.md` | ~15 itens | 1 semana |
| P2 (MÉDIO) | `TEST_AUDIT_REPORT.md` + `TECHNICAL_DEBT_AUDIT.md` | ~15 itens | 1 mês |
| P3 (BAIXO) | `TECHNICAL_DEBT_AUDIT.md` | ~5 itens | Trimestre |

---

## VALIDAÇÃO FINAL

Após cada fix, rode:
- `npx tsc --noEmit` — deve ser 0 erros
- `npm test` — deve ser 689/689 passando

Se algum teste quebrar, corrija antes de passar para o próximo fix.

---

Estou aqui para esclarecimentos. Comece pelo PASSO 1 (leitura dos documentos) e depois siga para PASSO 5 (execução).
```
---

## Como usar:

1. Copie tudo entre as crases (`) acima
2. Cole no Claude Code
3. Aguarde ele ler os 11 documentos
4. Ele começa pelos BLOCKERs (P0)

## Dica:

Se Claude Code tentar pular a leitura dos documentos, reforce:
"Leia primeiro os 5 documentos obrigatórios listados no PASSO 1 antes de escrever qualquer código."
