# Sails P2P Trading SDK — Due Diligence Técnica (Visão de CTO de Wallet)

> **Persona**: CTO/Arquiteto Sênior de uma wallet tier-1 (Trust Wallet, Bitget, OKX, Tether, MetaMask) avaliando integração do `@sails/sdk`.
> **Pergunta central**: "O que impediria minha empresa de aprovar essa integração?"
> **Veredito esperado**: Itens BLOCKER precisam ser fechados antes de qualquer decisão. ALTO antes de produção. MÉDIO antes de escalar. BAIXO podem ser endereçados no roadmap.
> **Versão avaliada**: `0.1.1` (Apache-2.0)

---

## 1. SUMÁRIO EXECUTIVO — DECISÃO

**Recomendação original**: NÃO APROVAR para produção no estado atual. Há 7 BLOCKERs que precisam ser fechados.

**Correção 2026-08-08 (verificado contra o código real antes de editar, não assumido):** 3 dos 7 BLOCKERs já não procediam (B-STA-01 migração, B-SEC-02 RedisStreamsEventStore, B-SEC-03 já mitigado por um guard mais forte que o sugerido). Dos 4 restantes, **3 foram fechados no mesmo dia** (B-SEC-01 CORS, B-SEC-04 Helmet, B-OPS-01 observabilidade — ver as seções específicas abaixo, cada uma com a evidência exata). **BLOCKER real restante: 1** (B-STA-02 testes de carga).

| Categoria | BLOCKER (original) | BLOCKER (real, 2026-08-08 fim de dia) | ALTO | MÉDIO | BAIXO |
|-----------|---------|---------|------|-------|-------|
| Segurança | 4 | 0 (CORS ✅, Helmet ✅) | 5 | 4 | 2 |
| Estabilidade | 2 | 1 (testes de carga) | 3 | 2 | 1 |
| Operação/Manutenção | 1 | 0 (observabilidade ✅) | 4 | 3 | 2 |
| Onboarding/Integração | 0 | 0 | 5 | 4 | 3 |
| Performance/Escala | 0 | 0 | 2 | 3 | 1 |
| Compliance/Legal | 0 | 0 | 2 | 1 | 0 |
| **TOTAL** | **7** | **1** | **21** | **19** | **9** |

---

## 2. SEGURANÇA — O Mais Crítico

### 🔴 BLOCKERS

#### B-SEC-01: CORS permite qualquer origem ✅ RESOLVIDO 2026-08-08
**Localização**: `src/app.ts:42-45`
```typescript
await app.register(cors, { origin: true, ... })
```
**Por que é blocker**: Qualquer site malicioso pode chamar a API do usuário logado. Para uma wallet que move dinheiro real, isso é vetor de ataque. Mitigações clássicas (CSRF, cookies httpOnly) não se aplicam a APIs REST/JSON.
**Ação necessária**: ~~Whitelist de origens permitidas, configurável via env. Default deny.~~
**Correção:** `CORS_ALLOWED_ORIGINS` (comma-separated), enforçado apenas em produção — `origin: config.isProduction ? config.cors.allowedOrigins : true`. Produção sem a variável setada nega toda origem cross-origin por padrão (fail-closed, não fail-open — o mesmo padrão que o guard do RT-001 já usa para `MOCK_ESCROW`), com um `app.log.warn` alto avisando o operador. Testado via `app.inject()` real nos 4 cenários (dev permissivo, produção com allowlist, produção com origem fora da lista, produção sem allowlist) em `tests/cors.test.ts`.

#### B-SEC-02: Sem auditoria forense persistente ✅ RESOLVIDO 2026-08-08
**Localização**: `src/common/events/event-store.ts` — `InMemoryEventStore`
**Por que é blocker**: `recordOutcome()`, `resolveDispute()`, e `releaseFunds()` não têm audit log imutável. Investigação de incidentes é impossível após restart. Para uma wallet que responde regulatoriamente, isso é obrigatório.
**Ação necessária**: ~~Implementar `RedisStreamsEventStore` (já documentada como "Not started") antes de qualquer produção.~~
**Correção (verificada contra o código real antes de editar esta linha):** `RedisStreamsEventStore` está implementado e verificado contra um Redis real — `XADD`/`XGROUP`/`XREADGROUP`/`XACK`/`XPENDING`/`XCLAIM` reais, dual-write (stream por evento + stream por correlationId), recuperação real de consumidor travado, 5 testes de integração contra o Redis real deste repositório (`tests/integration/redisStreamsEventStore.test.ts`). Ver `docs/BACKLOG.md`. **Gap real que continua existindo**: ainda não é o store *ativo* por padrão (`event-bus.ts` continua usando `InMemoryEventStore`) — trocar isso exige antes fechar um problema de idempotência real em `reputation.service.ts`'s `recordOutcome()` (também documentado em `BACKLOG.md`).

#### B-SEC-03: Custódia `MOCK` é default; código de produção usa `MOCK_ESCROW=true` por padrão ✅ JÁ MITIGADO (verificado 2026-08-08)
**Localização**: `src/config/index.ts:73-74`
```typescript
mockEscrow: process.env.MOCK_ESCROW !== 'false',  // default TRUE
mockSettlement: process.env.MOCK_SETTLEMENT !== 'false',  // default TRUE
```
**Por que é blocker**: Quem esquecer de setar `MOCK_ESCROW=false` em produção roda cofre mock. Bug de configuração catastrófico.
**Ação necessária**: ~~Em produção, `isProduction` deve forçar `mockEscrow: false` e logar warning se detectado.~~
**Correção:** já existe um guard mais forte que o sugerido — `src/config/index.ts:304` (RT-001): se `NODE_ENV=production` e `MOCK_ESCROW` não for explicitamente `'false'`, o processo **recusa subir** (`throw`, FATAL), não apenas loga um warning. Reclassificado de BLOCKER pra risco residual: o guard cobre `mockEscrow`, mas a combinação `mockEscrow=false` + `mockSettlement=true` (fundos travados, nunca liberados) só gera um `console.warn`, não um FATAL — vale considerar endurecer isso também.

#### B-SEC-04: Sem headers de segurança HTTP ✅ RESOLVIDO 2026-08-08
**Localização**: `src/app.ts` — nenhum `@fastify/helmet` ou equivalente.
**Por que é blocker**: Ausência de CSP, HSTS, X-Frame-Options, X-Content-Type-Options. Wallets que expõem dados financeiros em browser estão sujeitos a clickjacking, MIME sniffing, etc.
**Ação necessária**: ~~Adicionar `@fastify/helmet` com CSP restritiva.~~
**Correção:** `@fastify/helmet` registrado; CSP restritiva (`default-src 'none'`) apenas em produção — `/docs` (swagger-ui, só registrado fora de produção) precisa de scripts/estilos inline que uma CSP estrita bloquearia, e nunca é alcançável em produção de qualquer forma (mesmo gate). Headers de baseline (X-Frame-Options, X-Content-Type-Options, HSTS) presentes em todo ambiente. Testado via `app.inject()` real em `tests/securityHeaders.test.ts`.

### 🟡 ALTO

#### A-SEC-01: Ed25519 challenge-response é seguro mas frgilmente documentado
**Localização**: `packages/sails-sdk/src/modules/identity.ts:43-46`
```typescript
function sign(challenge: string, secretKey: Uint8Array): string {
  const signature = nacl.sign.detached(utf8ToBytes(challenge), secretKey)
  ...
}
```
- O servidor assina UTF-8 encoding do challenge string (não os bytes do challenge). Bem documentado no código, mas edge cases:
  - O que acontece se `challenge` contém caracteres não-ASCII?
  - Replay protection: TTL é 120s — razoável mas precisa de teste explícito.
**Ação**: Adicionar testes de edge cases (empty challenge, unicode, oversized).

#### A-SEC-02: Token de sessão tem TTL de 1h sem refresh flow
**Localização**: `src/config/index.ts:46` (`AUTH_SESSION_TTL = 3600`)
- Após 1h o token expira e o usuário precisa re-autenticar (Ed25519 challenge de novo).
- Para uma wallet que precisa ficar conectada durante horas, isso é UX ruim.
**Ação**: Implementar refresh token ou sessão longa com rotação.

#### A-SEC-03: AWS KMS depende de credenciais locais
**Localização**: `src/config/index.ts:277-278`
- `AWS_KMS_KEY_ID`, `AWS_REGION` configurados via env var.
- Em produção, deveria usar IAM Role, não access keys.
**Ação**: Documentar que deploy deve usar IAM Role e validar via `aws sts get-caller-identity` no boot.

#### A-SEC-04: Seed phrase WDK no env var (`WDK_SEED_PHRASE`)
**Localização**: `src/config/index.ts:214`
- `process.env.WDK_SEED_PHRASE ?? ''` — uma seed phrase de Ethereum em env var é vetor de comprometimento.
- Aparece em logs de erro? `console.log` de configuração no startup é comum.
**Ação**: Fail fast se `WDK_SEED_PHRASE` aparecer em logs. Usar AWS Secrets Manager / HashiCorp Vault.

#### A-SEC-05: Falta de rate limit em rotas de mutação críticas ✅ RESOLVIDO 2026-08-08
**Localização**: `src/app.ts:60-64`
- Rate limit global: 100 req/min por IP.
- Identidade tem override (10/min).
- Mas settlement.dispute, settlement.resolve, capabilities.revoke **não têm limite específico**.
- Vetor para spam de disputes (que custa arbiters reais).
**Correção:** novo tier `RATE_LIMIT_CRITICAL_MAX` (default 20/min), aplicado às quatro rotas citadas (`escrow/:id/dispute`, `disputes/:id/resolve`, `disputes/:id/appeal`, `capabilities/:grantId/revoke`), cada uma com seu próprio contador independente (mesmo padrão de `tests/rateLimit.test.ts`). Testado via `app.inject()` real em `tests/criticalRateLimit.test.ts`.

### 🟠 MÉDIO

- **M-SEC-01**: WDK Seed usado como fallback (default Sepolia testnet RPC) — `src/config/index.ts:215` `https://sepolia.drpc.org` é hardcoded.
- **M-SEC-02**: `pearNodeRegistry` aceita `secretKey` via body — `pear.routes.ts:17`. Deveria ser via Wallet Adapter, nunca HTTP body.
- **M-SEC-03**: `payment-account` route GET não valida ownership — `settlement.routes.ts:382-389` — qualquer um com accountHash pode ler.
- **M-SEC-04**: Trust proxy não configurado — `src/app.ts:58` — em deploy atrás de LB/CloudFront, IPs reais ficam mascarados, quebrando rate limit.

### ⚪ BAIXO

- **L-SEC-01**: Sem CSP nonce por request.
- **L-SEC-02**: Logs podem conter dados sensíveis (amounts, addresses).

---

## 3. ESTABILIDADE / CONFIABILIDADE

### 🔴 BLOCKERS

#### B-STA-01: Sem estratégia de migração de banco (`prisma db push`) ✅ RESOLVIDO (verificado 2026-08-08)
**Localização**: `prisma/` (sem `migrations/`)
- ~~`db:migrate` script usa `db push` (sobrescreve schema sem histórico).~~
- ~~Para wallet em produção com dados de clientes, isso significa **migration = data loss risk**.~~
- ~~Rollback impossível.~~
**Ação**: ~~Migrar para `prisma migrate dev/deploy` antes de produção. Bloqueador total.~~
**Correção:** `prisma/migrations/` já existe (`20260807_init`, `20260807_add_indices`, `migration_lock.toml`), e `package.json`'s `db:migrate` já roda `npx prisma migrate deploy`, não `db push`. Já resolvido antes deste relatório ser escrito.

#### B-STA-02: Sem testes de carga/stress
**Localização**: `tests/` — sem `load-tests/artillery/intent-api.yml` (movido de `loadtest/`, PRODUCTION_READINESS_FIXES.md item 19, 2026-08-08) não roda em CI.
- A wallet precisa garantir latência <500ms em p99.
- Não há SLI/SLO definidos nem medidos.

### 🟡 ALTO

#### A-STA-01: `escrow.service.ts` 1.257 linhas — single point of failure
- Concentra 6 responsabilidades. Qualquer mudança tem alto risco de regressão.
- Cobertura de testes: ~70% (não medido oficialmente).
- Para wallet, isso significa: cada release precisa de QA extensivo nesse módulo.

#### A-STA-02: Sem circuit breakers para dependências externas
- `pear.service.ts` usa HyperDHT — se a rede DHT cair, o que acontece? Sem fallback de timeout.
- WDK chama EVM RPC — sem retry exponencial real (só 2 retries no SDK).
- QVAC inference — se modelo não responde, request trava.

#### A-STA-03: WebSocket não tem heartbeat/ping ✅ RESOLVIDO 2026-08-08
**Localização**: `packages/sails-sdk/src/modules/openp2p.ts`
- Reconecta mas não detecta "zombie connections" (socket aberto mas sem tráfego).
- Padrão de mercado: ping a cada 30s, timeout em 60s.
**Correção:** `WebSocketChannel` agora envia `PING` a cada `heartbeatIntervalMs` (default 30s) e força o fechamento do socket se nenhum `PONG` chegar dentro de `heartbeatTimeoutMs` (default 60s) — os mesmos números que este item já pedia. O force-close roda pelo mesmo listener `'close'` que uma queda de rede real já usa, então reaproveita o reconnect-com-backoff existente em vez de duplicar a lógica. O servidor (`chat.routes.ts`) já respondia `PING` com `PONG`; só faltava o lado cliente enviar de verdade. 5 testes novos em `packages/sails-sdk/tests/modules.test.ts` (`describe('WebSocketChannel — heartbeat (A-STA-03)')`), incluindo um que simula uma zombie connection de verdade (nunca responde `PONG`) e confirma que o reconnect dispara.

### 🟠 MÉDIO

- **M-STA-01**: Sem testes de chaos/fault injection.
- **M-STA-02**: Sem graceful degradation quando DB está lento.

---

## 4. OPERAÇÃO / MANUTENÇÃO

### 🔴 BLOCKERS

#### B-OPS-01: Sem observabilidade (métricas, tracing, logs estruturados)
**Localização**: `src/app.ts:31-39`
- Pino está configurado, mas:
  - Sem OpenTelemetry / Prometheus / DataDog
  - Sem distributed tracing (cada request não tem trace ID)
  - Sem métricas de negócio (trades/segundo, escrows ativos, etc.)
- Para uma wallet, **impossível operar SLO-driven sem isso**.
**Ação**: Adicionar `@opentelemetry/sdk-node` + exporter. Métricas no Prometheus.

**✅ RESOLVIDO (parcialmente, por decisão deliberada) 2026-08-08**: adicionado
um endpoint `GET /metrics` real (`src/common/metrics.ts`, `prom-client`),
com contadores HTTP genéricos (`sails_http_requests_total`,
`sails_http_request_duration_seconds`, por method/route-pattern/status —
nunca a URL crua, para não estourar cardinalidade por trade/escrow id) e
contadores de negócio reais (`sails_escrows_created_total`,
`sails_escrows_released_total`, `sails_escrows_refunded_total`,
`sails_disputes_opened_total`), estes últimos ligados aos mesmos eventos
`settlement.escrow.*`/`dispute.opened` que já dirigem toda reação
cross-módulo em `handlers.ts`. Testes reais via `app.inject()`
(`tests/metrics.test.ts`) e via o event bus real disparando as reações
reais de `handlers.ts` (`tests/metricsBusinessCounters.test.ts`, o único
arquivo de teste deste repo que não mocka `event-bus` — deliberado, é
exatamente o que precisa rodar de verdade aqui).

**Gap real que permanece, por decisão consciente de escopo**: distributed
tracing (trace ID por request) e a escolha de backend gerenciado
(Prometheus/DataDog/vendor, quem opera scraping/retenção, custo) NÃO foram
resolvidos — isso é uma decisão de infraestrutura real que precisa do
project owner, não algo para decidir unilateralmente no escopo Tier 2
desta pass. `GET /metrics` não tem autenticação (convenção padrão de
exporter Prometheus — Prometheus não fala Bearer token sem scrape-config
extra); a mitigação esperada é restringir acesso na camada de rede
(security group / allowlist do reverse-proxy) em produção, a mesma
expectativa que `DEPLOYMENT.md` já define para as portas do
Postgres/Redis. Expõe apenas contadores agregados, nunca dado por
usuário — compatível com o princípio de não-visibilidade de operador
deste protocolo.

### 🟡 ALTO

#### A-OPS-01: Sem runbook de incidente
**Localização**: `docs/` (sem `RUNBOOK.md`)
- O que fazer se `escrow.service.ts` crasha? Como reabilitar?
- Como reverter uma má dispute resolution?
- Procedimento de pause de emergências?

#### A-OPS-02: Sem health checks além de `/health` ✅ PARCIALMENTE RESOLVIDO (verificado 2026-08-08)
- ~~Sem `/ready` (readiness) vs `/live` (liveness).~~ `GET /health/live` e `GET /health/ready` já existem em `src/app.ts`.
- **Gap real restante**: `docker-compose.yml`'s `app` service ainda não tem um healthcheck próprio (só `postgres`/`redis` têm) — o container app sobe sem o compose verificar `/health/ready`.
- Kubernetes deploy precisa de ambos — já tem os dois endpoints, falta só o manifesto usar.

#### A-OPS-03: Sem feature flags centralizados
- Config tem 15+ feature flags, mas sem painel.
- Para rollout gradual, precisa de sistema (LaunchDarkly, Unleash, etc.).

#### A-OPS-04: Sem disaster recovery documentado
- RPO/RTO indefinidos.
- Sem plano de backup/restore do Postgres.

### 🟠 MÉDIO

- **M-OPS-01**: Sem CI/CD pipeline definido (apenas `.github/workflows/ci.yml` com testes, sem deploy).
- **M-OPS-02**: Sem estratégia de versioning/feature flags para breaking changes (apenas `API_STABLE.md`).
- **M-OPS-03**: Sem documentação de SLA/SLO.

---

## 5. ONBOARDING / INTEGRAÇÃO

### 🟡 ALTO

#### A-ONB-01: SDK sem `README.md`
- npmjs/GitHub mostram package.json vazio.
- Primeira impressão ruim para uma wallet que avalia o pacote.

#### A-ONB-02: Documentação de error handling ausente
- Como capturar SailsAuthError? Fazer retry? Refresh token?
- Sem guia, cada integrador reinventa.

#### A-ONB-03: 15 propriedades em `SailsClient` com aliases confusos
- `identity`/`auth`, `liquidity`/`offers`, `openp2p`/`trades`, `settlement`/`escrow`, `reputation`/`trustScore`.
- 5 caminhos para o mesmo lugar — iniciante fica perdido.

#### A-ONB-04: Apenas 1 exemplo (`examples/simple-wallet/`)
- Sem exemplo de arbiter, marketplace, agent, dispute resolution.
- Sem exemplo de error handling.
- Sem exemplo de Wallet Adapter customizado.

#### A-ONB-05: `negotiate()` lança erro com mensagem confusa
- "shape mismatch against a stateful WebSocketChannel" — jargão técnico.
- Iniciante não sabe o que fazer.

### 🟠 MÉDIO

- **M-ONB-01**: Sem "Conceptual Model" no SDK_GUIDE.
- **M-ONB-02**: Sem diagrama de arquitetura do SDK.
- **M-ONB-03**: Conceitos central sem intro (Intent, Escrow, Dispute).
- **M-ONB-04**: Sem changelog detalhado por release.

---

## 6. PERFORMANCE / ESCALABILIDADE

### 🟡 ALTO

#### A-PERF-01: Sem CDN/edge cache para ofertas (liquidity)
- `discover()` faz query ao DB toda vez. 1000 RPS = 1000 queries.
- Para wallet com 10M+ usuários, isso não escala.
**Ação**: Adicionar cache Redis para `discover()` com TTL.

#### A-PERF-02: WebSocket single-instance
**Localização**: `chat-room-registry.ts`
- `Map<tradeId, Set<RoomMember>>` é in-memory.
- Em deploy multi-instance, clientes conectados a instâncias diferentes não se veem.
**Ação**: Redis Pub/Sub ou sticky sessions.

### 🟠 MÉDIO

- **M-PERF-01**: Bundle de discovery carrega TODAS as mensagens em `getTrade()`.
- **M-PERF-02**: Nenhum índice em `User.reputationScore` — leaderboard faz scan.
- **M-PERF-03**: `getAggregatedOffers()` ordena na memória (não escala com múltiplos providers).

---

## 7. COMPLIANCE / LEGAL / GOVERNANÇA

### 🟡 ALTO

#### A-COMP-01: Licença Apache-2.0 OK, mas falta NOTICE e CONTRIBUTING claro
- Apache-2.0 requer NOTICE em distribuições.
- Sem `CONTRIBUTING.md` na raiz — só em `docs/`.

#### A-COMP-02: Sem política de segurança publicada (`SECURITY.md`)
**Localização**: raiz — ausente
- Onde reportar vulnerabilidade? Email? HackerOne? Bugcrowd?
- Sem disclosure policy, uma wallet não pode integrar.
**Ação**: Criar `SECURITY.md` com email de contato + SLA de resposta.

### 🟠 MÉDIO

- **M-COMP-01**: Sem export controls analysis (criptografia).
  - Ed25519, secp256k1, AES — pode requerer notificação a BIS/OFAC em alguns países.

---

## 8. ACHADOS QUE NÃO SÃO BLOQUEADORES MAS ATRASAM DECISÃO

### Conformidade com Protocolo
- **HD wallets (BIP-32/39/44)** — não há suporte. Para wallet multi-chain, isso é tabela.
- **Multi-account** — `User.id = uuid`. Sem suporte a múltiplas contas por seed.
- **Multi-currency display** — todos os amounts são strings decimais. UI precisa parsear.

### Auditoria / Compliance de Código
- Sem `npm audit` em CI.
- Sem SBOM (Software Bill of Materials) gerado.
- Sem signing de releases.

**`npm audit` rodado manualmente 2026-08-08** (GitHub Dependabot havia sinalizado 47 vulnerabilidades no branch): `npm audit fix` (não-breaking) aplicado, resolvendo os itens realmente corrigíveis sem mudança de versão major — `fast-uri` (usado em runtime por `fast-json-stringify`, dependência real do Fastify), `nanoid`, `brace-expansion`, além de `postcss`/`sharp` (que só existem via `next`, dependência exclusiva de `examples/sails-integration-starter` — nunca roda no backend real). Suíte completa (68 suites, 749 testes) + `tsc --noEmit` + `npm run build` confirmados limpos depois da correção.

**Achado real que permanece, verificado antes de decidir não agir**: `elliptic` (crítico — extração de chave privada ao assinar input malformado, `GHSA-vjh7-7g9h-fjfh`) e uma versão antiga de `ws` (alto — DoS) continuam vulneráveis, sem fix disponível sem um upgrade breaking do Hardhat (`npm audit fix --force` avisa que instalaria `hardhat@3.12.0`). Verificado que a cadeia real é `@safe-global/safe-4337`/`@safe-global/safe-contracts` → `ethers@5.x` → `elliptic`, declarada **apenas** em `contracts/package.json` (toolchain de compilação/deploy do contrato Guard via Hardhat) — grep confirma que nenhum arquivo de produção (`src/`, `packages/sails-sdk/src/`) importa `@safe-global/*` diretamente; `safe-guard-evm.provider.ts`'s único import real é `from 'ethers'`, que resolve para a v6 instalada na raiz (usa `@noble/curves`, não `elliptic` — sem essa vulnerabilidade). **Ou seja: o caminho real de assinatura que move fundos não está exposto** — o risco fica contido à ferramenta de build/deploy de contratos, não ao runtime do backend/SDK. Fazer o upgrade breaking do Hardhat para fechar isso de vez é trabalho real, mas separado (risco de quebrar compilação/ABI do contrato Guard) — não decidido unilateralmente aqui.

### Suporte / Comunidade
- Sem `CODE_OF_CONDUCT.md`.
- Sem `CONTRIBUTING.md` na raiz.
- Sem roadmap público além de `BACKLOG.md`.
- Sem changelog versionado por release.

---

## 9. PERGUNTAS QUE O CTO FARIA ANTES DE APROVAR

Se eu fosse apresentar este SDK ao meu CISO/Compliance/Legal, faria estas perguntas:

1. **Quem auditou a segurança do `escrow.service.ts` 1.257 linhas?**
2. **Qual é o RPO/RTO se o Postgres cair?**
3. **Como vocês garantem que dados de clientes não vazam em logs?**
4. **Qual é o SLA de suporte? Tem contrato?**
5. **Quem paga se um cofre bugar e dinheiro for perdido? Tem seguro?**
6. **Vocês têm SOC 2 / ISO 27001? Quando?**
7. **Roadmap de 12 meses? Quem mantém?**
8. **Quem responde em caso de incidente de segurança? Tempo de resposta?**
9. **Vocês têm um Security.txt publicado?**
10. **Compatibilidade com BIP-32/39/44? Multi-account?**

Se a maioria dessas respostas for "não temos", a decisão é **NÃO INTEGRAR**.

---

## 10. RECOMENDAÇÕES FINAIS

### O que fazer HOJE (Bloqueadores)

1. **Migrar de `prisma db push` para `prisma migrate`** — sem isso, qualquer deploy é data loss
2. **Adicionar CORS whitelist** — origem aberta = blocker de segurança
3. **Implementar audit log persistente** — `RedisStreamsEventStore` antes de produção
4. **Adicionar headers de segurança (Helmet)** — HSTS, CSP, X-Frame-Options
5. **Forçar `MOCK_ESCROW=false` em produção** — fail fast
6. **Adicionar `@fastify/helmet`** + CSP restritiva
7. **Adicionar observabilidade** — OpenTelemetry + Prometheus exporter

### O que fazer em 30 dias (ALTO)

- Corrigir `escrow.service.ts` (decompor em 4 módulos)
- Implementar refresh tokens para auth
- Adicionar circuit breakers em Pear/WDK/QVAC
- Adicionar testes de carga + chaos
- Criar `RUNBOOK.md` e `SECURITY.md`
- Adicionar README ao SDK + 3 exemplos (arbiter, marketplace, error handling)

### O que fazer em 90 dias (MÉDIO)

- Migrar seed do WDK para AWS Secrets Manager
- Adicionar cache Redis para `discover()`
- Sticky sessions ou Redis Pub/Sub para WebSocket
- BIP-32/39/44 support
- Adicionar SBOM e signing de releases

---

## 11. VEREDITO FINAL

**Status**: 🔴 **NÃO APROVAR** para produção no estado atual.

**Razões**:
- 7 BLOCKERs (4 segurança + 2 estabilidade + 1 operação)
- 21 itens ALTO que precisam ser fechados antes de produção
- Observabilidade zero (impossível SLO-driven)
- Sem migração de DB (risco de perda de dados)

**Recomendação de caminho**:
1. Reavaliar em 90 dias após fechamento dos BLOCKERs
2. Solicitar auditoria externa independente antes de produção
3. Pilot com 1% de usuários primeiro (feature flag de rollout)
4. Contratar SLA de suporte (response time, bug fix time)

**O que gostei** (para ser justo):
- Trabalho de Red Team documentado
- RFCs e governance
- 661 testes jest + 98 vitest
- TypeScript strict + enum validation no boundary
- Rate limiting em identity routes
- `MOCK_ESCROW` flag (intencional)

**Mas**: bons princípios não compensam falta de observabilidade + estratégia de migração. Para uma wallet que move dinheiro real, esses são **table stakes**.