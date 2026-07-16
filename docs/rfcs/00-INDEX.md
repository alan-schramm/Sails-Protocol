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
