# Core — Sails Protocol

This folder holds the 6 formal Core components (`ARCHITECTURE.md` section
1B, `MASTER_COORDINATION.md` v7.1). Each file below is currently a stub
interface — the actual logic lives in `common/events/handlers.ts`
(reactive, informal) and needs to be migrated here as part of the
`Meses 1-3` roadmap phase (`TODO.md`).

- `intent-engine.ts`      — routes Intents by type (PROTOCOL_SPECIFICATION.md §2)
- `coordination-engine.ts` — the "brain": Intent + Policy + Capability + Events → decisions
- `state-machine.ts`      — canonical Intent lifecycle (9 states, §2.4)
- `capability-registry.ts` — permission checks (PROTOCOL_SPECIFICATION.md §1.10)
- `policy-engine.ts`      — FeePolicy, TrustPolicy, RoutingPolicy (§1.10)

No module should import another module directly — every module imports
from `core/` instead. See `ARCHITECTURE.md` section 5 for the enforcement
rule and the grep check to run before submitting any change.
