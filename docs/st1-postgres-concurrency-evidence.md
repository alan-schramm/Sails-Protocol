# ST-1 PostgreSQL concurrency experiment — evidence ledger

Branch: `gatekeeper/st1-postgres-concurrency-experiment`
Base: `07224a0c47d240805b83b6bad5a6a53847e05663`
Scope: experiment only. No production modifications in this branch.

## Execution status

**NOT EXECUTED.** No PostgreSQL server or ST1_TEST_DATABASE_URL is available in the present execution environment. There is no exact-head CI run and no passing application-level concurrency proof.

## Experimental lock probe

```sh
ST1_TEST_DATABASE_URL='postgresql://user:pass@localhost:5432/st1_disposable' node scripts/st1-postgres-lock-probe.cjs
```

The probe covers (1) D->E ordering across independent connections, (2) an intentional E->D / D->E deadlock yielding SQLSTATE 40P01, and (3) bounded retry after transaction abort. The probe does not write production tables. It must run only against a disposable DB.

## Mandatory application-level real-Postgres matrix (UNIMPLEMENTED / NOT EXECUTED)

| Scenario | Barrier / scheduling | Required assertion |
|---|---|---|
| N->N+1 before cleanup | pause cleanup before D; commit appeal; release | no delete, pending unchanged |
| cleanup N before appeal | pause appeal before D; commit authorized cleanup; release | exactly one authorized delete |
| signature before cleanup | pause cleanup before E; commit signature; release | signature and pending remain |
| cleanup before signature | pause signer before E; commit cleanup; release | signer rejected; no recreation |
| reversal after ruling | force provider failure; race revert D->E and cleanup | no invalid generation deletion |
| concurrent reconcilers | hold D while two reconcilers contend | <=1 deletion, no duplicate effects |
| missing Outcome | persisted pending with absent durable Outcome | no delete, reported fail-closed |
| ambiguous provenance | null/mismatched fields or cooperative round | no delete, no assumption of authority |
| committed economic authorization | persist durable authorization before appeal | preserve committed authority and effects |
| restart/replay | kill worker at deterministic barrier and restart | converges without extra delete/effect |
| deadlock 40P01 | reverse lock order in disposable test only | rollback and bounded retry, never silent |
| row-lock dependency | D/R, D/E, E/R, FK and update locks | no unexamined cycle or unbounded wait |

Each application-level test must log PID, SQLSTATE, event sequence, `pg_locks`, final pending/signature/dispute/outcome/authorization state and economic-effect counts. Require `lock_timeout` and `statement_timeout` and deterministic barriers. A test using mocks only is not acceptance evidence.

## Open material findings

1. The provisional cleanup holds E but not D. It cannot serialize appeal N->N+1.
2. The provisional `DELETED_NO_OUTCOME` path must fail closed under the CTO's new predicate.
3. D->E global cycle absence remains unproved for implicit row/FK locks and indirect calls.
4. No app-level N/N+1, signer, reversal, cooperative, restart or multiworker test exists in this experiment.
5. No exact-head CI, mutation proof, independent Opus review, merge or FREEZE.

**Gate: BLOCKED. STOP for CTO decision / execution environment.**
