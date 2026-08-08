# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- `docs/PRODUCTION_READINESS_FIXES.md` — Documento completo com 22 fixes organizados
  por prioridade (P0/P1/P2), cada um com arquivo, linha exata, e código antes/depois.
- `docs/CLAUDE_CODE_P0_CHEATSHEET.md` — Referência rápida dos 8 fixes críticos.
- `docs/TECHNICAL_DEBT_AUDIT.md` — Auditoria de dívida técnica invisível com 45 itens
  organizados por impacto (Crítico/Alto/Médio/Baixo) e área (manutenção, escalabilidade,
  onboarding, SDK, testes, modularização).
- `docs/PROMPT_PARA_CLAUDE_CODE.md` — Prompt completo para Claude Code com todo o
  contexto: o que foi feito (24 fixes + 8 arquivos criados + limpeza), o que precisa
  ser feito (7 BLOCKERs + P0/P1/P2/P3), 11 documentos de referência, e regras de
  execução.
- `.github/workflows/ci.yml` — CI/CD com typecheck, testes, e build (Node 22).
- `SECURITY.md` — Política de segurança e reporte de vulnerabilidades.
- `CODE_OF_CONDUCT.md` — Código de conduta da comunidade.
- `SUPPORT.md` — Guia de suporte e canais de comunicação.
- `.gitignore` atualizado — Adicionado `graphify-out/`, `GITHUB_ORGANIZATION.md`, `*.txt`.
- `CLAUDE.md` atualizado com status da auditoria Production Readiness.
- `SailsClient.proof` module (`SailsProofModule`) with `assertClaim()`,
  `submitProof()`, `issueVerificationNonce()`, `verifyProof()`, and
  `getEvidenceBundle()` — now wired onto `SailsClient` as `client.proof`
  and exported from the public API.
- `Proof` and `Verification` types exported from `@sails/sdk`'s public API.
- `useSailsProof()` React hook in `@sails/sdk-react` — TanStack Query-backed
  wrapper for all `SailsProofModule` methods (10 tests incl. error paths).
- `useSailsIdentity`, `useSailsLiquidity`, `useSailsReputation`,
  `useSailsCapabilities` React hooks.
- `useSailsLiquidityDiscover` React hook with customizable filter params.
- Expanded `useSailsLiquidity` hook — `book` and `match` now accept custom
  parameters via `UseSailsLiquidityOptions`.
- Settlement RFC-021 gap closures: `approveRelease()`, `getReleaseApprovals()`,
  `registerArbiter()`, `getArbiterProfile()` with `ArbiterProfile`,
  `ReleaseApproval`, `ReleaseApprovalsResult` types.
- `openp2p.reconcileTrade()` — RFC-011 client-side reconciliation.
- `reputation.getScoreByPeerId()` — RFC-021 peer-based score lookup.
- Prisma migrations: `20260807_init` (schema completo) e `20260807_add_indices`
  (Dispute.arbiterId+status, User.reputationScore).
- Testes React hooks: `useSailsTrade` (3 testes) e `useSailsTrades` (4 testes).
- Paginação em `GET /v1/reputation/leaderboard` (limit/offset).
- Paginação em `GET /v1/openp2p/chat/:tradeId/messages` (limit/offset).
- `CLAUDE.md` - Documento definindo Claude Code como Engenheiro Chefe.
- `config/index.ts`: `requiredInt()` helper para validação de env vars numéricas
  (lança erro em vez de retornar NaN silenciosamente).
- `config/index.ts`: production guard para `mockSettlement` (avisa quando
  `mockEscrow=false` mas `mockSettlement=true`).

### Changed
- `liquidity.discover()` and backend `getAggregatedOffers()` now return
  `{ offers, sources, total, hasMore }` with proper global pagination applied
  after aggregating and sorting across all providers.
- `docs/SDK_GUIDE.md` section 2 updated with all new method signatures.
- `package.json` scripts: `db:migrate` agora usa `prisma migrate deploy`,
  adicionado `db:migrate:dev` para desenvolvimento.
- `docker-compose.yml`: migrate service usa `prisma migrate deploy`.
- Resposta de `GET /v1/reputation/leaderboard`: agora retorna
  `{ items, total, hasMore, nextOffset }` em vez de array direto.
- Resposta de `GET /v1/openp2p/chat/:tradeId/messages`: agora retorna
  `{ items, total, hasMore, nextOffset }` em vez de array direto.
- `identity.routes.ts`: `publicKey` agora valida hex de 64 caracteres via regex.
- `trade.routes.ts`: `listTradesSchema` agora tem limites `limit` (1-100) e `offset` (>=0).
- `chat.routes.ts`: `sendMessageSchema` agora tem `content.max(10000)` e `msgType` como enum.
- `settlement.routes.ts`: `createEscrowSchema.asset` agora usa `z.enum(...)` em vez de `z.string()`.
- `settlement.routes.ts`: `disputeSchema.evidence` agora valida com schema tipado.
- `liquidity.service.ts`: removidos 3 `as any` desnecessários (input já tipado).
- `config/index.ts`: `mockEscrow`/`mockSettlement` agora case-insensitive.
- `config/index.ts`: removido `config.server` duplicado (idêntico ao `config.app`).
- `proof.service.ts`: removido `as any` redundante em `verdict` (já tipado como `'ACCEPTED' | 'REJECTED'`).
- `proof.service.ts`: substituído `as any` por `as unknown as Prisma.InputJsonValue` para campos JSON.
- `liquidity.routes.ts`: substituído `as any` por `as AssetType` em 3 ocorrências.
- `dispute.service.ts`: substituído `dispute.status as any` por `as DisputeStatus`.
- `settlement.routes.ts`: removido `as any` redundante em `body.paymentMethod` (já tipado pelo Zod schema).
- `routes.test.ts`: corrigidos 14 testes de reputação pré-existentes (publicKeys agora são hex válido, limites de paginação respeitados, assets usam enum válido).
- `escrow.service.ts`: extraído `initiateSignatureCollection()` — elimina ~180 linhas de duplicação entre `initiateRelease/Refund/Split`.
- `auth.ts`: adicionado `AuthenticatedRequest` interface — eliminate 25 `(request as any).participantId` casts em 9 arquivos de rotas.
- `client.ts` (SDK): extraído `requireWallet()` — elimina boilerplate repetido em 5 métodos.

### Fixed
- `trade.mock.ts` `ReputationScore` missing `total`/`tradeScore`/`volumeScore`/
  `settlementScore`/`disputeRate`/`cumulativeFeesObserved` fields caused
  TypeScript errors in dependent tests.
- `StatusBadge.tsx` missing `SPLIT` escrow status.
- `liquidity.service.ts`'s `getAggregatedOffers()` had the sort comparator
  reversed for both BUY and SELL sides — BUY offers were sorted ascending
  (lowest bid first) instead of descending (highest bid first); SELL offers
  were sorted descending (highest ask first) instead of ascending (lowest
  ask first). Corrected to standard order-book convention.
- `routes.test.ts` dispute config-error tests expected 400 (ValidationError
  from `getDisputeService()` with empty `TRUSTED_ARBITRATORS`) but got 404
  due to `.env`'s `TRUSTED_ARBITRATORS=k6-test-arbiter` setting. Fixed by
  clearing `process.env.TRUSTED_ARBITRATORS` before config import — dotenv
  does not override existing env vars.
- **CRITICAL**: `event-bus.ts` `SocialEngineeringRiskDetectedEvent.pattern`
  union tinha `| string` que colapsava todo o mapa de eventos tipados para
  `string` genérico — removido.
- `escrow.service.ts`: adicionado null check antes de chamar `provider.finalizeSplit!`.

### Security
- **`escrow.service.ts`'s `createEscrow()` had no membership check at
  all** — any authenticated participant could create an escrow against
  ANY trade, with attacker-chosen `type`/`lockedAmount`/`asset`. Since
  `Trade.escrowId` is set on the first successful call and a trade can
  only ever have one escrow, this let a stranger permanently block the
  real parties from ever settling a trade they could merely
  guess/observe the id of. Fixed: requires `participantId`, checked
  against `trade.buyerId`/`trade.sellerId`.
- **`GET /v1/openp2p/trades/:id` and `.../trades/by-intent/:intentId`
  had no auth at all** — both include the trade's full message history
  and the seller's real payment details (`Offer.paymentDetails`).
  Anyone who merely guessed or leaked a trade UUID could read a
  stranger's negotiation and payment instructions. Fixed: `requireAuth`
  + buyer/seller check, same as every other trade-detail route.

### Fixed (2026-08-08, verify-then-fix sweep of accumulated uncommitted work)
- `packages/sails-sdk/src/client.ts` had literal dead code: an orphaned
  `if (!this.wallet) {...}` block floating in the class body right
  after `signMessage()`'s closing brace, left over from an old
  `getAddresses()` implementation. Never caught because
  `packages/sails-sdk` isn't covered by the root `tsconfig`'s
  `include` — `npx tsc --noEmit -p packages/sails-sdk` is a distinct
  check the root `npm run build` doesn't run. Consolidated into
  `getWalletAddresses()` + a shared `requireWallet()` helper.
- `Dockerfile` and `docker-compose.yml` both had a UTF-8 BOM and every
  apostrophe in every comment doubled (`''` instead of `'`) — an
  encoding-roundtrip artifact. Not cosmetic: the same corruption hit
  the `HEALTHCHECK`'s embedded JS one-liner in both files, turning
  `require('http')` into `require(''http'')` — invalid syntax that
  would have made the container's own health check fail permanently in
  production. Rewrote both files clean.
- `reputation.leaderboard()` and `openp2p.getMessages()` in
  `@sails/sdk` still typed their return as a bare array
  (`ReputationScore[]`/`Message[]`) after their backend routes had
  already moved to `{items, total, hasMore, nextOffset}` pagination —
  would have shipped broken against the real response shape. Fixed
  both, added `LeaderboardEntry`/`LeaderboardResult`/`PaginatedMessages`
  types.
- `tests/useSailsCapabilities.test.tsx` and
  `tests/useSailsLiquidity.test.tsx` (sdk-react) were written against
  an imagined API shape that doesn't match the real types
  (`granteeId`/string `scope` instead of `CapabilityGrant`'s real
  `grantedTo`/`scope: string[]`/`capabilityName`; `assetSell`/
  `assetBuy`/`amountSell` instead of `Offer`'s real `asset`/`side`/
  `priceUsd`/`minAmount`/`maxAmount`). Neither ever ran under
  `packages/sdk-react`'s own `tsc` for the same "not in root tsconfig"
  reason as `client.ts` above.
- `scripts/sdk-pressure-test.ts` (a real end-to-end SDK-level load
  script) had 5 type errors that would have blocked `ts-node` from
  ever running it. Fixed; wired as `npm run loadtest:sdk`.
