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

Todas as 5 RFCs nasceram do mesmo processo: achados da Protocol Quality
Review, revisados e, em alguns casos, corrigidos antes de virarem decisão
final — cada RFC documenta explicitamente o que foi considerado e
rejeitado, não só o que foi aceito.
