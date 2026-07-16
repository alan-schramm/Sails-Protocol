# Sails Protocol — RFCs

Índice de leitura sugerido — cada RFC segue o mesmo formato: Summary,
Motivation, Alternatives Considered (incluindo o que foi rejeitado e por
quê), Decision, Primitives Used or Extended, Principle Alignment,
Specification, Backward Compatibility, Reference Implementation Plan.

| RFC | Título | Resolve |
|---|---|---|
| RFC-001 | Participant Model | Core depende de `Participant` abstrato, não de `Identity` diretamente. Corrige explicitamente por que `Wallet` e `Agent` NÃO são implementações diretas |
| RFC-002 | Transport Provider Abstraction | Pears/HyperDHT vira implementação de `TransportProvider`, não dependência fixa — decisão explícita entre tratar Pears como fundacional (rejeitado) ou criar a interface (aceito) |
| RFC-003 | Proof Primitive | `confirmFiat()` → `submitProof()` genérico. `claimType` fica string aberta, nunca enum fechado |
| RFC-004 | Negotiation State Machine | Chat deixa de ser a primitive; `NegotiationEvent` estruturado passa a ser a abstração, chat vira uma implementação de canal entre outras |
| RFC-005 | Capability Model | Resolve uma colisão de nomenclatura real: "Capability" tinha dois significados nunca diferenciados (categoria funcional de módulo vs. permissão de acesso) — agora são duas interfaces: `Capability` e `CapabilityGrant` |
| RFC-006 | OpenProof Module & Packages | `Proof` ganha módulo dono (8º módulo oficial). `Package` vira a palavra para agrupar vários módulos numa entrega de negócio (ex: "OpenP2P Package") — deliberadamente diferente de `Capability` (RFC-005), que continua 1:1 com um módulo só |
| RFC-007 | Real-World P2P Requirements | Consolida 11 requisitos de operadores P2P (Proof Registry, `EvidenceProvider`, `PendingBankSettlement`, escalonamento de disputa + `ArbitrationProvider`, Timeline, Evidence Bundle, Social Engineering Agent, reputação baseada em Outcome, Operational Profiles) estendendo módulos existentes — sem módulo novo. `EvidenceBundle` e `Timeline` foram avaliados contra o teste de primitive (§1.10-1.11) e rejeitados como primitives |
| RFC-008 | Verifiable Timestamps and a Hash-Chained Timeline | Fecha duas lacunas do modelo inspirado em Nostr que RFC-007 introduziu: `EvidenceReference.timestamp` era auto-declarado (não prova existência-no-tempo, só assinatura), e `TimelineEntry` era uma projeção plana sem vínculo criptográfico entre entradas (editável sem detecção). Adiciona `TimestampAnchor` (novo Adapter, policy-gated, não obrigatório) e encadeia `TimelineEntry` por hash (`entryHash`/`prevHash`, persistido em `EscrowEvent`/`ReputationEvent`) — sem blockchain, sem novo primitive |
| RFC-009 | Decimal Precision for Financial Fields | Auditoria externa (CISO/Chief Architect) apontou `priceUsd`/`amount`/`lockedAmount`/etc. como `Float` (IEEE 754) no schema real — verificado independentemente antes de aceitar a alegação. Muda essas colunas para `Decimal` e propaga a correção como string decimal (nunca `number`) em todo contrato TypeScript cross-module, para que a precisão não se perca de novo ao cruzar um limite JSON. Corrige o tipo do campo `Settlement.amount` (§1.5) — não é uma nova primitive |
| RFC-010 | Durable Event Store and Mandatory correlationId | Mesma auditoria (Event Bus em `EventEmitter` puro, sem durabilidade) refinada por uma segunda revisão externa (CTO) que corrigiu a recomendação original — "eventos precisam ser duráveis" é requisito de protocolo, "use Redis" não é. Introduz `EventStore`, novo Adapter (mesma categoria de `SettlementProvider`), e exige `correlationId` obrigatório em todo evento (`tradeId` hoje, `intentId` quando Intent existir). `InMemoryEventStore` funcional e verificado; `RedisStreamsEventStore` desenhado mas lança erro — não testado contra Redis real, mesmo padrão de `LightningHodlProvider` |
| RFC-011 | P2P Reconciliation on Peer Reconnect | Terceiro e último achado da mesma auditoria: mensagem `HyperDHT`/Pears pode cair enquanto Postgres já registrou o `TradeIntent`. Verificado que a arquitetura já é híbrida (Postgres autoritativo + Pears como canal de notificação em tempo real) — `sendEvent()` já persiste toda mensagem independente de entrega P2P, faltava só o catch-up. `peer.connected` (handshake real, com `localUserId`) agora dispara `ReconciliationService` contra Postgres, sem precisar de replay peer-to-peer. Achado relacionado sinalizado, não corrigido: `NegotiationService`'s status é `Map` em memória, não persistido |

Todas as 6 RFCs de RFC-001 a RFC-006 nasceram do mesmo processo: achados
da Protocol Quality Review, revisados e, em alguns casos, corrigidos antes
de virarem decisão final — cada RFC documenta explicitamente o que foi
considerado e rejeitado, não só o que foi aceito. `RFC-007` nasceu de
entrevistas com operadores de mercado, não da Protocol Quality Review, e
foi aceito por diretiva direta do CTO em vez de passar pela janela de
Discussion aberta (`GOVERNANCE.md` §5) — registrado explicitamente no
próprio RFC, não omitido. `RFC-008` emenda duas construções que o próprio
RFC-007 introduziu (`EvidenceReference`, `TimelineEntry`); nasceu de uma
crítica de design levantada durante a revisão do próprio RFC-007, não de
diretiva do CTO — provenance registrada com precisão no próprio RFC.
