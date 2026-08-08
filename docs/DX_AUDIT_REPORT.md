# Sails P2P Trading SDK — Auditoria de Developer Experience (DX)

> **Persona**: Um integrador frontend/fintech/wallet que está olhando o `@sails/sdk` pela primeira vez e tem 30 minutos para entender se integra.
> **Escopo**: SDK em `packages/sails-sdk/src/` + documentação em `docs/SDK_GUIDE.md` + exemplo em `examples/simple-wallet/`.
> **Instrução**: Identificação de problemas — nenhuma implementação foi feita.

---

## 1. APIs Confusas

### 1.1 Sobrecarga de aliases confunde iniciantes — **HIGH**

**Localização**: `packages/sails-sdk/src/client.ts:62-110`

O `SailsClient` expõe **15 propriedades**, sendo 5 aliases que apontam para o mesmo módulo:

```typescript
readonly identity: SailsIdentityModule       // alias: auth
readonly liquidity: SailsLiquidityModule      // alias: offers
readonly openp2p: SailsOpenP2PModule          // alias: trades
readonly settlement: SailsSettlementModule    // alias: escrow
readonly reputation: SailsReputationModule    // alias: trustScore
```

**Problema**: Ao ler a documentação ou autocomplete da IDE, o usuário vê dois caminhos para chegar no mesmo lugar. Não há um "preferred" — documentação diz "ambos são estáveis". Mas:
- Tutorial A usa `sdk.identity` (técnico/correto)
- Tutorial B usa `sdk.auth` (intuitivo)
- Ambos são corretos, mas quem está começando fica paralisado na escolha

**Recomendação**:
- Documentar 1 caminho canônico (ex: `sdk.identity`) e marcar aliases como "deprecated/alias"
- OU remover os aliases e unificar a nomenclatura

### 1.2 API `negotiate()` lança erro mas não indica alternativa óbvia — **HIGH**

**Localização**: `packages/sails-sdk/src/intent-facade.ts:96-100`

```typescript
async negotiate(_intentId: string, _event: NegotiationEvent): Promise<void> {
  throw new SailsNotImplementedError(
    'negotiate(intentId, event) — the canonical signature is a single fire-and-forget call, but the real negotiation channel is a persistent WebSocketChannel (openp2p.chat(tradeId)), not something a single Promise<void> can represent. Use openp2p.chat(tradeId) directly for the real, working negotiation channel.'
  )
}
```

**Problema**:
- O usuário lê `negotiate()` na documentação (SDK_GUIDE.md:98), tenta usar, recebe erro.
- A mensagem de erro é técnica e longa — menciona "shape mismatch", "stateful WebSocketChannel".
- Para um iniciante, é difícil entender **o que fazer em seguida**.

**Recomendação**: Mensagem mais direta e linkada:
```
negotiate() is not implemented — the real negotiation channel is a persistent WebSocket.
Use sdk.openp2p.chat(tradeId) instead. See docs/SDK_GUIDE.md#websocket-chat
```

### 1.3 API de Intent é inconsistente — **MEDIUM**

**Localização**: `packages/sails-sdk/src/intent-facade.ts`

A facade tem 6 métodos que "parecem" simétricos mas têm comportamentos diferentes:

| Método | Implementação | Lança erro? |
|--------|---------------|-------------|
| `createIntent()` | Real | Não |
| `cancelIntent()` | Real | Não |
| `negotiate()` | **Stub** | **Sim** (SailsNotImplementedError) |
| `submitProof()` | Real | Não |
| `releaseAsset()` | Real mas exige `toAddress` | Não |
| `dispute()` | Real | Não |

**Problema**: Todos os 6 aparecem igualmente no `SailsClient`, mas um falha. Iniciante vai descobrir só ao usar.

**Recomendação**: 
- Marcar `negotiate` como `/** @deprecated Use openp2p.chat() */` na documentação
- OU remover `negotiate` da facade até ter implementação real
- Adicionar nota explícita no TSDoc

### 1.4 `rate()` no módulo reputation retorna `Promise<unknown>` — **MEDIUM**

**Localização**: `packages/sails-sdk/src/modules/reputation.ts:42`

```typescript
async rate(input: RateInput): Promise<unknown> {
  return this.transport.post('/v1/reputation/rate', input, true)
}
```

**Problema**:
- Tipo de retorno é `unknown` — perde type safety
- Usuário não sabe o que o servidor retorna (provavelmente `ReputationEvent`)
- A documentação `SDK_GUIDE.md:163` diz `Promise<unknown>` literalmente

**Recomendação**: Tipar o retorno como `ReputationEvent` (verificar a forma real).

### 1.5 `settlement.submitTransactionSignature` retorna `{ complete: boolean }` mas o método `initiateRelease` retorna tipo opaco — **MEDIUM**

**Localização**: `packages/sails-sdk/src/modules/settlement.ts:280-310`

```typescript
async initiateRelease(escrowId: string, toAddress: string): Promise<EscrowPendingTransaction>
async submitTransactionSignature(escrowId: string, signedPsbtBase64: string): Promise<{ complete: boolean }>
```

**Problema**:
- O usuário chama `initiateRelease()`, recebe `EscrowPendingTransaction` com `requiredSigners: string[]`
- Mas como sabe que tipo de "unsigned payload" assinar? O tipo `unsignedPsbtBase64` é string, mas pode ser:
  - Base64 PSBT (MULTISIG)
  - JSON bundle (LIGHTNING_HODL)
  - JSON bundle (SAFE_GUARD_EVM)
- A documentação explica isso, mas o tipo TypeScript não captura

**Recomendação**: Helper method ou union type explícito para os tipos de bundle.

### 1.6 Confusão entre `arbiter` e `arbitrator` — **LOW**

**Localização**: `packages/sails-sdk/src/modules/arbitration.ts`, `market-arbitration.provider.ts`

O módulo se chama `arbitration` (substantivo) e o usuário é `arbiter` (substantivo, alguém que arbitra).
Documentação usa ambos: "arbiter", "arbitrator".

**Recomendação**: Padronizar — escolher um (preferência: `arbiter`, é o termo técnico usado na documentação).

---

## 2. Nomes Pouco Intuitivos

### 2.1 `dispute()` na facade de Intent vs `settlement.dispute()` — **HIGH**

**Localização**: `intent-facade.ts:149` e `settlement.ts:242`

```typescript
// intent-facade.ts
client.dispute(intentId, reason)  // recebe intentId

// settlement.ts
client.settlement.dispute(escrowId, reason, evidence?)  // recebe escrowId
```

**Problema**: Dois métodos `dispute()` com parâmetros diferentes (intentId vs escrowId). 
- Um iniciante não sabe qual chamar.
- A documentação SDK_GUIDE diz "Use intent facade primeiro" mas a diferença operacional não é óbvia.

**Recomendação**: 
- Renomear `intent-facade.ts:dispute` para algo mais explícito, ex: `disputeFromIntent(intentId, reason)`.
- OU adicionar nota na TSDoc explicando a diferença.

### 2.2 `me()` em identity — **MEDIUM**

**Localização**: `packages/sails-sdk/src/modules/identity.ts:83`

```typescript
async me(): Promise<Participant>
```

**Problema**: 
- `me()` é vago — retorna `Participant`, mas o usuário não sabe se é "minha identidade", "meu perfil", etc.
- Outros métodos usam `get(participantId)` para buscar outros. `me()` é implícito.
- Comparação: GitHub API usa `/user` (sem id), que é mais explícito.

**Recomendação**: Renomear para `getCurrent()` ou adicionar `getMe()` como alias.

### 2.3 `getTrades()` vs `getTrade()` vs `getTradeByIntent()` — **MEDIUM**

**Localização**: `packages/sails-sdk/src/modules/openp2p.ts:230-251`

Três métodos similares com nomes parecidos:
- `getTrades(pagination)` — lista paginada
- `getTrade(tradeId)` — um trade
- `getTradeByIntent(intentId)` — trade por intentId

**Problema**: Convenção singular/plural está correta, mas o iniciante precisa lembrar qual dos três usar.

**Recomendação**: Aceitável como está. Apenas melhorar TSDoc explicando a diferença.

### 2.4 `registerFromWallet()` em capabilities — **LOW**

**Localização**: `packages/sails-sdk/src/modules/capabilities.ts:44`

```typescript
async registerFromWallet(wallet: WalletAdapter): Promise<CapabilityGrant>
```

**Problema**: "FromWallet" implica que existe um "register() plain" também. Mas `register()` é genérico.

**Recomendação**: Renomear para algo mais claro, ex: `registerFromWalletCapabilities()` ou `autoRegister()`.

### 2.5 `discover()` retorna `DiscoverResult` (não array) — **LOW**

**Localização**: `packages/sails-sdk/src/modules/liquidity.ts:56-61, 90-92`

```typescript
async discover(filter): Promise<DiscoverResult>
// DiscoverResult = { offers: [], sources: [], total: number, hasMore: boolean }
```

**Problema**: 
- A maioria dos iniciantes espera `discover()` retornar array.
- Em vez disso, retorna objeto wrapper com `.offers`.
- Documentação explica, mas a primeira chamada confunde.

**Recomendação**: 
- Aceitável (pagination metadata justifica o wrapper).
- Adicionar exemplo no TSDoc mostrando `const { offers, hasMore } = await sdk.liquidity.discover(...)`.

### 2.6 `reputation.vouchFor(voucheeId)` — **LOW**

**Localização**: `packages/sails-sdk/src/modules/reputation.ts:55`

```typescript
async vouchFor(voucheeId: string): Promise<Vouch>
```

**Problema**: Nome não deixa claro que o usuário está arriscando reputação própria. Documentação explica, mas o nome em si é neutro.

**Recomendação**: Renomear para `vouch()` (sem preposição) ou adicionar nota "**Warning: your reputation is at stake**" no TSDoc.

---

## 3. Mensagens de Erro Ruins

### 3.1 Mensagens técnicas longas em vez de ação direta — **HIGH**

**Localização**: Vários arquivos em `packages/sails-sdk/src/`

#### Exemplos:

```typescript
// transport.ts:131-133
throw new SailsTransportError(
  `${method} ${path} requires authentication — call identity.authenticate() first (or client.setSessionToken()).`
)
```
✅ Bom — diz exatamente o que fazer.

```typescript
// intent-facade.ts:97-99
throw new SailsNotImplementedError(
  'negotiate(intentId, event) — the canonical signature is a single fire-and-forget call, but the real negotiation channel is a persistent WebSocketChannel (openp2p.chat(tradeId)), not something a single Promise<void> can represent. Use openp2p.chat(tradeId) directly for the real, working negotiation channel.'
)
```
⚠️ Mensagem longa, jargão técnico ("shape mismatch", "fire-and-forget"). Para um iniciante: confuso.

```typescript
// client.ts:170-176
throw new Error(
  "getBalance() requires a wallet adapter — pass { wallet: WalletAdapter } to the SailsClient constructor.",
)
```
✅ Bom.

**Recomendação**: Padronizar mensagens de erro no padrão:
1. **O que aconteceu** (curto)
2. **Por que** (1 frase)
3. **Como corrigir** (ação concreta, ex: link para doc)

### 3.2 Mensagens de erro do servidor passam verbatim — **MEDIUM**

**Localização**: `packages/sails-sdk/src/errors.ts:96-124`

```typescript
export function errorFromResponseBody(body: SailsErrorResponseBody): SailsError {
  const ErrorClass = ERROR_CODE_MAP[body.error]
  // ...
  return new SailsError(body.message, body.error, 500, body.details ?? [])
}
```

**Problema**:
- Mensagens do servidor como `"${triggeredBy} is not a party to trade ${id}"` são técnicas.
- Iniciante recebe `SailsForbiddenError("alice is not a party to trade abc123")`.
- Não diz **o que fazer**.

**Recomendação**: Wrap mensagens do servidor com contexto adicional:
```
SailsForbiddenError(
  "alice is not a party to trade abc123 — only the buyer or seller of a trade may dispute it. " +
  "Are you authenticated as the correct participant?"
)
```

### 3.3 Códigos de erro HTTP não padronizados — **LOW**

**Localização**: `packages/sails-sdk/src/errors.ts`

`SailsEscrowError` tem `statusCode: 409`. Mas o servidor pode retornar 409 com mensagem genérica sem ser um erro de escrow.

**Recomendação**: Validar se o erro é genuinamente do tipo `ESCROW_ERROR` antes de mapear.

---

## 4. Documentação Insuficiente

### 4.1 Sem `README.md` no SDK — **HIGH**

**Localização**: `packages/sails-sdk/` (sem README.md)

Um integrador que abre o package no npmjs ou GitHub vê apenas o `package.json` e o `dist/`. Não há:
- Quick start
- "What is this?"
- Link para SDK_GUIDE.md

**Recomendação**: Criar `packages/sails-sdk/README.md` com:
- 5-line elevator pitch
- Quick start (10 linhas)
- Link para `docs/SDK_GUIDE.md`
- Link para `examples/simple-wallet/`

### 4.2 TSDoc ausente em alguns métodos — **MEDIUM**

**Localização**: `packages/sails-sdk/src/modules/`

Métodos sem TSDoc:
- `settlement.ts:create()` — não documenta o `escrowId` retornado
- `settlement.ts:lock()` — não diz quem pode chamar (apenas o seller?)
- `liquidity.ts:publish()` — sem exemplo de chamada
- Todos os métodos em `peers.ts` — sem exemplos de uso real (HyperDHT é complexo)

**Recomendação**: Adicionar `@example` em métodos críticos:
```typescript
/**
 * Creates an escrow for a trade.
 * @example
 * const escrow = await sdk.settlement.create({
 *   tradeId: 'abc123',
 *   lockedAmount: '100',
 *   asset: 'USDT_ERC20'
 * });
 */
```

### 4.3 Sem documento de "Error Handling" para SDK — **MEDIUM**

**Localização**: `docs/SDK_GUIDE.md` (não tem seção dedicada a error handling)

O usuário precisa saber:
- Quais exceptions o SDK lança
- Como capturar erros de transporte vs erros de validação
- Como fazer retry de operações idempotentes
- Como reagir a `SailsAuthError` (refresh session?)

**Recomendação**: Adicionar seção "Error Handling" em SDK_GUIDE.md com exemplos.

### 4.4 Sem documento explicando o "modelo de Intent" — **MEDIUM**

**Localização**: `docs/SDK_GUIDE.md` menciona Intent, mas não explica conceitualmente

Para um integrador, é confuso entender:
- O que é um `Intent`?
- Por que preciso de Intent se posso usar `liquidity.publish()`?
- Quando uso `createIntent()` vs chamadas diretas?

**Recomendação**: Adicionar seção "Conceptual Model" no início do SDK_GUIDE.md.

### 4.5 `examples/simple-wallet/` é único exemplo — **HIGH**

**Localização**: `examples/simple-wallet/src/index.ts`

Só existe **1 exemplo**. Para diferentes personas, exemplos diferentes ajudariam:
- **Wallet developer**: cria identidade + auth + transação
- **Marketplace UI**: lista offers + cria trade + chat
- **Arbiter**: register + listDisputes + resolve
- **Agent (AI)**: createIntent + submitProof + releaseAsset

**Recomendação**: Criar 2-3 exemplos adicionais:
- `examples/arbiter-console/`
- `examples/marketplace-ui/`
- `examples/agent-orchestrator/`

### 4.6 Diagrama de arquitetura ausente no SDK — **LOW**

**Localização**: `packages/sails-sdk/` (sem diagrama)

O `docs/ARCHITECTURE.md` tem diagramas globais, mas o iniciante que abre o SDK precisa de:
- Quais classes existem
- Como elas se relacionam
- Qual é o fluxo de uma chamada típica

**Recomendação**: Criar diagrama simples (3-5 boxes) no SDK README ou no início de SDK_GUIDE.

---

## 5. Exemplos Faltando

### 5.1 Sem exemplo de tratamento de erro — **HIGH**

**Localização**: `examples/simple-wallet/src/index.ts`

O exemplo atual (`main().catch(...)`) só faz `console.error`. Não demonstra:
- Como capturar `SailsAuthError` e re-autenticar
- Como capturar `SailsNotFoundError` e tentar rota alternativa
- Como capturar erros de validação
- Como fazer retry com backoff

**Recomendação**: Adicionar exemplo `examples/error-handling/` mostrando try/catch para cada tipo.

### 5.2 Sem exemplo de Wallet adapter customizado — **HIGH**

**Localização**: `examples/` (nenhum exemplo com wallet adapter)

O `WalletAdapter` é um conceito central (RFC-013) mas não há exemplo de:
- Como implementar um `WalletAdapter` próprio
- Como usar `MockWalletAdapter` (existe mas não documentado em exemplo)
- Como integrar com WDK

**Recomendação**: Criar `examples/custom-wallet-adapter/`.

### 5.3 Sem exemplo de uso em React/Vue/Svelte — **MEDIUM**

**Localização**: `packages/sails-sdk/` (vanilla JS only)

O React SDK existe (`packages/sdk-react/`) mas não há exemplo end-to-end de uso.

**Recomendação**: Criar `examples/react-basic-wallet/` mostrando integração com hooks.

### 5.4 Sem exemplo de fluxo de dispute — **MEDIUM**

**Localização**: `examples/` (nenhum exemplo de arbiter ou dispute)

O fluxo de dispute é complexo (criar → escalonar → arbitrar → resolver) e tem muitas regras. Um exemplo seria útil.

**Recomendação**: Criar `examples/dispute-resolution/` mostrando o ciclo completo.

### 5.5 Sem exemplo de chat WebSocket com reconnect — **MEDIUM**

**Localização**: `examples/simple-wallet/` (apenas demonstra `send`/`receive` básico)

O `WebSocketChannel` tem lógica robusta de reconnect com backoff, mas o exemplo não demonstra:
- O que fazer quando reconecta (recuperar mensagens perdidas?)
- Como mostrar status de "reconectando" para o usuário
- Como parar o canal gracefully

**Recomendação**: Adicionar ao `examples/simple-wallet/` uma seção de chat resiliente.

---

## 6. Outros Achados

### 6.1 `WebSocketChannel` requer `factory function` — **MEDIUM**

**Localização**: `packages/sails-sdk/src/modules/openp2p.ts:299-311`

```typescript
chat(tradeId: string, options?: WebSocketChannelOptions): WebSocketChannel {
  // ...
  const openSocket = () => this.transport.openWebSocket(...)
  return new WebSocketChannel(openSocket, tradeId, options)
}
```

**Problema**: Para suportar reconnect, o `WebSocketChannel` requer uma **factory function** `() => WebSocket` ao invés de uma instância. Isso quebra o princípio de menor surpresa — quem constrói `WebSocketChannel` diretamente precisa entender isso.

**Recomendação**: Documentar bem no TSDoc que `openSocket` é uma factory (já documentado, mas pouco visível).

### 6.2 Falta de validação local antes de chamar API — **MEDIUM**

**Localização**: Todos os módulos

O SDK envia requisições ao servidor mesmo com inputs inválidos. Por exemplo:
- `sdk.identity.create()` sem `keypair` (gera um novo — OK)
- Mas `sdk.settlement.release(escrowId, "")` com `toAddress: ""` envia string vazia ao servidor.
- Servidor retorna 400 com mensagem genérica.

**Recomendação**: Validação local (ex: `Zod schemas` ou `light validation`) antes de chamar API. Mas cuidado para não duplicar regras de negócio.

### 6.3 Sem helper para gerar `Authorization: Bearer ...` header — **LOW**

**Localização**: `packages/sails-sdk/src/transport.ts`

O token é gerenciado internamente, mas o usuário não tem como compartilhar a sessão entre clientes (ex: 2 abas do mesmo wallet).

**Recomendação**: Documentar como compartilhar `sessionToken` entre instâncias, ou expor método `setSessionToken()` (já existe em `client.ts:242-244`).

### 6.4 Falta método `logout()` ou `signOut()` — **LOW**

**Localização**: `SailsClient`

Não há método para revogar sessão. Apenas `setSessionToken(null)` remove localmente.

**Recomendação**: Adicionar método `signOut()` que chama `setSessionToken(null)` e opcionalmente chama uma rota `/v1/identity/logout` (se existir).

---

## 7. Resumo por Severidade

| Severidade | Total | Categoria |
|-----------|-------|-----------|
| **HIGH** | 8 | Sobrecarga de aliases (1.1), `negotiate()` (1.2), `dispute()` (2.1), mensagens longas (3.1), sem README SDK (4.1), só 1 exemplo (4.5), sem exemplo de error handling (5.1), sem exemplo de wallet adapter (5.2) |
| **MEDIUM** | 11 | `rate()` retorna unknown (1.4), bundle type opaco (1.5), `me()` vago (2.2), `getTrades` similar (2.3), `registerFromWallet` (2.4), `discover` wrapper (2.5), `vouchFor` (2.6), mensagens do servidor verbatim (3.2), sem error handling doc (4.3), sem conceptual model (4.4), sem exemplos adicionais (5.3, 5.4, 5.5) |
| **LOW** | 8 | `arbiter`/`arbitrator` (1.6), códigos HTTP (3.3), diagrama arquitetura (4.6), `WebSocketChannel` factory (6.1), validação local (6.2), compartilhar sessão (6.3), sem `signOut()` (6.4) |

### Recomendações Priorizadas (sem implementação)

1. **Criar `packages/sails-sdk/README.md`** com quick start + links
2. **Adicionar exemplo de error handling** (`examples/error-handling/`)
3. **Adicionar exemplo de Wallet Adapter customizado** (`examples/custom-wallet-adapter/`)
4. **Simplificar mensagens de erro de `SailsNotImplementedError`** — usar formato padrão "What / Why / How to fix"
5. **Adicionar seção "Conceptual Model" no SDK_GUIDE.md** — explicar Intent, escrow, dispute, etc.
6. **Padronizar nomes** — escolher entre `identity`/`auth`, `openp2p`/`trades`, `settlement`/`escrow`
7. **Adicionar `@example` JSDoc** em métodos críticos
8. **Criar 2-3 exemplos adicionais** (arbiter, marketplace, agent)