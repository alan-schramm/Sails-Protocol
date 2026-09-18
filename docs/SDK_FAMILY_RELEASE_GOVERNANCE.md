# SDK Family Packaging & Release Governance

## 1. Purpose

This document defines the reusable packaging and release-governance model for the Sails SDK family.

It exists so a future maintainer can decide what publishable npm artifacts a new Sails module needs, prepare those artifacts consistently, and release them without relying on oral context from the `0.2.0` release.

This document governs **developer-product packaging and release operations**. It does not redefine protocol semantics, module semantics, or the protocol-level `Package` term defined by RFC-006.

## 2. Terminology boundary

RFC-006 defines **Package** as a protocol composition of Modules that delivers one business-facing capability.

That meaning is distinct from an **npm package**.

Use these terms precisely:

| Term | Meaning |
|---|---|
| Protocol Package | RFC-006 composition of Sails Modules. |
| npm package | Publishable registry artifact such as `@satsails/p2p-trading-sdk`. |
| Schema package | npm package that carries shared contracts/types across implementations. |
| SDK package | npm package that carries public developer behavior/API. |
| Framework binding package | npm package that adapts an SDK to a framework such as React. |
| Package family | The related npm packages that together expose one developer product. |

Do not use bare `Package` in release-governance prose when the meaning could be confused with RFC-006.

## 3. Packaging decision matrix

A new Sails module does **not** automatically require three npm packages.

Create a publishable artifact only when it owns a real external integration boundary.

| Question | If yes | Artifact |
|---|---|---|
| Are contracts/types shared across independently versioned implementations or consumers? | Extract a contract surface. | Schema package |
| Does an integrator need public behavior/API beyond raw contracts? | Expose a developer client/runtime surface. | SDK package |
| Does a framework need framework-specific lifecycle/state bindings? | Add a thin framework adapter over the SDK. | Framework binding package |
| Is the functionality internal to one implementation only? | Keep it internal. | No new npm package |
| Is this only a Protocol Package composition under RFC-006? | Keep protocol composition separate from npm packaging. | No automatic npm artifact |

Framework bindings must not become independent sources of protocol truth. They wrap public SDK behavior.

## 4. Naming and version identity

The current family establishes the naming shape:

- `@satsails/p2p-schemas`
- `@satsails/p2p-trading-sdk`
- `@satsails/sdk-react`

Future names should be explicit about the developer-facing responsibility and should avoid implying protocol authority that the artifact does not own.

Examples may include:

- `@satsails/reputation-schemas`
- `@satsails/reputation-sdk`
- `@satsails/identity-schemas`
- `@satsails/identity-sdk`
- `@satsails/liquidity-sdk`

These examples are not reserved or frozen names.

Each npm package owns its own SemVer identity. Therefore:

> npm package version ≠ repository version ≠ protocol version ≠ API-stability declaration.

The root repository version does not control npm package versions.

A version identifies one immutable published artifact. A published `name@version` must never be reinterpreted as a different artifact.

## 5. Package-family dependency rule

Published compatibility must be proven against the registry, not inferred from workspace success.

For a dependency chain:

```text
schema package
→ SDK package
→ framework binding package
```

the release order is:

1. publish the schema package;
2. verify registry version, integrity, dist-tag and consumer smoke;
3. publish the SDK package;
4. verify registry version, integrity, dist-tag and consumer smoke;
5. publish the framework binding package;
6. verify registry version, integrity, dist-tag and consumer smoke.

A workspace can resolve unpublished local packages. The public registry cannot.

Therefore:

> workspace compatibility ≠ published compatibility.

Source-state smoke proves the prepared local artifact chain. Registry dependency smoke proves the published dependency chain.

## 6. Release identity invariant

Every release must bind this chain:

```text
package name + version
→ exact source SHA
→ verified packed artifact
→ artifact-specific Git tag
→ npm registry artifact
→ authorized npm dist-tag
→ registry-installed smoke
→ GitHub Release
→ changelog/release record
```

Only when the complete chain is verified is a release completed.

`published`, `tagged`, `documented`, and `release completed` are distinct states.

## 7. Mandatory release gates

Every publishable npm artifact must have a package-specific workflow or an audited shared workflow that preserves the same gates.

### Gate A: explicit authorization

A release must require an explicit operator invocation.

Merging to `main` is not release authorization.

The release input must include:

- exact 40-character source SHA;
- expected package version;
- authorized npm dist-tag;
- explicit `dry-run` or `release` mode.

### Gate B: immutable source proof

The workflow must:

- check out the exact requested SHA;
- verify that SHA is in `main` history;
- derive package identity from that source;
- verify the prepared changelog/release record;
- build from a clean source state.

### Gate C: artifact proof

Before mutation, the workflow must:

- build/typecheck/test as appropriate;
- create the actual npm tarball;
- inspect package contents;
- reject secret/source/test leakage not intended for publication;
- record artifact integrity;
- install the packed artifact into an isolated consumer;
- prove the promised CJS/ESM/types/public surface.

### Gate D: published-dependency proof

Where the artifact depends on another Sails npm package, a dispatched dry-run/release must prove that the dependency range resolves from the public registry.

This gate is separate from local packed-artifact smoke.

### Gate E: external-state reconciliation

Before mutation, inspect:

- expected Git tag;
- npm `name@version`;
- npm artifact integrity;
- GitHub Release state.

Conflicting immutable identity is a STOP condition.

### Gate F: release boundary

A real release must use a protected GitHub Environment dedicated to the artifact class and npm Trusted Publishing/OIDC.

Current environments:

- `schemas-release`
- `sdk-release`
- `sdk-react-release`

No long-lived npm publish token is required for the current Trusted Publishing path.

### Gate G: post-publish verification

After npm accepts publication, verify:

- exact version;
- exact integrity;
- authorized dist-tag;
- registry-installed consumer behavior.

Registry publication is eventually consistent. Current workflows use a bounded propagation window rather than treating the first immediate `npm view` miss as publication failure.

The verification remains fail-closed if the registry does not converge inside the bounded window.

### Gate H: durable completion record

Only after npm verification:

- create or verify the GitHub Release;
- verify the immutable tag still points to the frozen source SHA;
- verify the complete release chain;
- preserve release evidence sufficient for recovery.

## 8. Tag and GitHub Release rules

Tags are artifact-specific and immutable.

Current namespaces:

- schemas: `schemas/p2p/v<semver>`
- P2P Trading SDK: `sdk/p2p-trading/v<semver>`
- React SDK binding: `sdk/react/v<semver>`

A future artifact must define an equally explicit namespace before its first release.

A tag may not be moved to make a mismatched artifact appear correct.

The GitHub Release name should identify the npm artifact and version, and its release notes should record the exact source SHA and changelog/release-record location.

## 9. Recovery and idempotency

Release automation must be safely re-runnable.

A retry must preserve already-correct immutable state rather than recreate or mutate it.

Examples:

- correct tag already exists at the same source SHA → preserve it;
- exact npm version already exists with matching integrity → do not republish;
- npm publication succeeded but GitHub Release creation failed → resume from verification/recording;
- npm registry is still propagating → retry bounded verification;
- same version exists with different integrity → STOP;
- tag exists at a different source SHA → STOP;
- GitHub Release exists while npm identity is absent or contradictory → STOP and reconcile.

Recovery must distinguish an unknown or partial outcome from a failed economic/immutable action. Never assume a mutation did not happen merely because a later verification step failed.

## 10. Trusted Publishing contract

For each new npm artifact using GitHub Actions Trusted Publishing:

1. create the npm package identity;
2. configure its Trusted Publisher for the correct GitHub owner/repository;
3. bind the exact workflow filename;
4. bind the dedicated GitHub Environment;
5. allow npm publication for that trusted publisher;
6. grant the release job `id-token: write`;
7. retain `contents: write` only where tag/GitHub Release mutation requires it;
8. validate with dry-run before the first real release.

The workflow filename and environment are part of the trust boundary. Renaming either requires corresponding npm Trusted Publisher reconciliation before release.

## 11. Workflow design standard

The current package-specific workflows are:

- `.github/workflows/schemas-release.yml`
- `.github/workflows/sdk-release.yml`
- `.github/workflows/sdk-react-release.yml`

They are the proven operational implementations for the `0.2.0` family.

Do not generalize them into shared machinery merely to reduce YAML duplication.

A shared workflow is justified only when it makes the trust boundary, artifact identity, recovery states and evidence easier to inspect, not merely when it reduces line count.

Package-specific behavior may legitimately differ, especially consumer smoke and dependency-chain validation.

## 12. New-artifact onboarding checklist

Before the first release of a new npm artifact:

1. prove that an external publishable boundary actually exists;
2. classify it as schema, SDK, framework binding, or another explicit artifact class;
3. choose an unambiguous npm name;
4. define its independent SemVer policy;
5. define its dependency ranges on other published Sails artifacts;
6. create a package changelog/release record;
7. define artifact-specific tag namespace;
8. add build/typecheck/tests;
9. add isolated packed-artifact consumer smoke;
10. add registry dependency compatibility smoke when applicable;
11. add release workflow with exact-SHA dry-run/release inputs;
12. create dedicated GitHub Environment;
13. configure npm Trusted Publisher;
14. verify CI on the workflow PR;
15. perform dry-run;
16. perform controlled first release;
17. verify npm, dist-tag, registry install, tag and GitHub Release;
18. record the artifact in repository navigation/governance docs.

## 13. Release operator checklist

For a prepared version:

1. confirm package manifest and changelog agree;
2. record the exact source SHA in `main`;
3. run the artifact workflow in `dry-run`;
4. do not proceed if any registry dependency gate fails;
5. run the same workflow in `release`;
6. verify both workflow jobs complete successfully;
7. verify registry-installed consumer smoke;
8. verify GitHub Release and artifact tag;
9. verify source SHA recorded by the release matches the frozen SHA;
10. only then mark the artifact `PUBLISHED / VERIFIED / FROZEN`;
11. advance to downstream artifacts only after the upstream registry gate is complete.

## 14. Relationship to package-specific contracts

This document owns the **family-level packaging and release-governance standard**.

Package-specific contracts may impose stronger requirements:

- `SCHEMAS_RELEASE.md` owns P2P schema artifact specifics.
- `SDK_RELEASE.md` owns P2P Trading SDK artifact specifics.
- `sdk-react-release.yml` currently owns the executable React binding release mechanics; framework-binding rules are governed here unless a dedicated React release contract becomes necessary.

If a package-specific contract conflicts with this family-level standard, treat that as documentation debt and reconcile explicitly. Do not silently choose one.

## 15. Proven baseline

The controlled `0.2.0` release established the first fully verified family baseline:

- `@satsails/p2p-schemas@0.2.0`
- `@satsails/p2p-trading-sdk@0.2.0`
- `@satsails/sdk-react@0.2.0`

All three are bound to source commit:

`98915fd81afa2f4adea316c54080d6b07e77d546`

The release chain demonstrated:

- exact-source preparation;
- ordered registry dependency publication;
- package-specific dry-run;
- npm Trusted Publishing/OIDC;
- provenance publication;
- immutable artifact tags;
- registry integrity/dist-tag verification;
- bounded registry-propagation recovery;
- registry-installed smoke;
- GitHub Release creation;
- idempotent partial-release recovery.

This baseline proves the release-governance mechanism. It does not imply API stability beyond what the package-specific API stability documents state.
