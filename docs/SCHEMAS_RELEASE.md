# Sails P2P Schemas — Release Contract

## 1. Purpose and authority

This document is the canonical owner of **release mechanics and institutional release truth** for `@satsails/p2p-schemas`.

It does not own protocol semantics, SDK compatibility, or downstream package release decisions. Protocol and architecture documents remain authoritative for their respective concerns. `docs/SDK_RELEASE.md` remains authoritative for `@satsails/p2p-trading-sdk` releases.

`@satsails/p2p-schemas` is an independently releasable artifact, not merely an internal source folder. It has its own package name and version, public runtime and type exports, downstream consumers, npm publication identity, and the independent ability to make a downstream package unreleasable when its published surface does not match the surface that downstream source expects.

The institutional rule is:

> **Package version denotes one immutable artifact identity, not a moving source state.**

Therefore a public package surface must not continue evolving under a package version that already identifies a historical published artifact.

## 2. Core artifact identity invariant

A future released Schemas artifact must be attributable to one consistent chain:

```text
one declared schemas package version
→ one immutable source commit
→ one artifact-specific Git tag
→ one published npm artifact
→ one release/changelog record
```

The required Git tag namespace for future Schemas releases is:

```text
schemas/p2p/v<semver>
```

Examples:

```text
schemas/p2p/v0.1.1
schemas/p2p/v0.2.0
schemas/p2p/v1.0.0-rc.1
```

This namespace is intentionally distinct from the SDK namespace:

```text
sdk/p2p-trading/v<semver>
```

A Schemas tag identifies only the `@satsails/p2p-schemas` artifact. It does not version the repository, protocol, SDK, or any other package.

No historical tag is created or reinterpreted by this contract.

## 3. Historical `0.1.0` treatment

The historical npm artifact `@satsails/p2p-schemas@0.1.0` is immutable historical truth.

Repository source later continued evolving while `packages/sails-p2p-schemas/package.json` still declared `0.1.0`. In particular, repository history shows that commit `9cf385e4aa9c6e27ba07eae95d90b03a74004654` added a newer public/runtime capability surface including `MULTISIG_CAPABILITY_PROFILE_V1` while the package version remained `0.1.0`.

Therefore:

```text
historical published schemas@0.1.0
≠
current source state still labeled 0.1.0
```

This document does **not** claim that the historical npm `0.1.0` artifact contains `MULTISIG_CAPABILITY_PROFILE_V1`, and it does not attempt to reconstruct or retrofit that artifact.

The historical `0.1.0` publication must not be republished, replaced, reinterpreted, retagged, or cosmetically made to match current source.

There is currently no dedicated Schemas changelog in this repository. This contract deliberately does not invent historical release entries. The next release-preparation mission should create a forward-looking Schemas release record/changelog beginning with the next legitimately prepared package version and may include a concise historical note explaining that `0.1.0` predates the forward release contract without fabricating missing traceability.

## 4. Release states

Release state must be described precisely. The normal forward path is:

1. **Version prepared** — the intended Schemas package version and release record/changelog entry exist in a reviewed release-preparation PR.
2. **Source frozen** — that preparation is merged and one immutable source commit SHA is selected.
3. **Artifact built** — a clean checkout of that exact SHA produces the package artifact and required package-surface validation passes.
4. **Tagged** — `schemas/p2p/v<semver>` exists and points to the frozen source SHA.
5. **Artifact published** — npm accepts the exact prepared Schemas package version.
6. **Registry verified** — registry metadata and the installed registry artifact are verified against the prepared release identity and required public surface.
7. **GitHub Release recorded** — a GitHub Release exists for the exact Schemas tag and records package/version/source/release-note identity.
8. **Release completed** — every required state above is verified as one consistent chain.

Therefore:

> **Published ≠ Tagged ≠ Registry-verified ≠ Documented ≠ Release Completed.**

No publication may precede the commit that prepares the package version and release record.

## 5. Release authority

Release authority is role-based. One person may hold multiple roles, but the responsibilities remain distinct.

| Action | Institutional owner | Rule |
| --- | --- | --- |
| Version decision | **Release Approver** | Approves the intended Schemas SemVer and release channel. |
| Release authorization | **Release Approver** | Explicitly authorizes publication after the frozen source and validation evidence are reviewable. |
| Package version preparation | **Release Preparer** | Updates only the Schemas package version axis in a reviewed preparation PR. |
| Release record/changelog preparation | **Release Preparer** | Records the exact next version and user/developer-visible package-surface changes before publication. |
| npm publication | **Release Operator** | Publishes only the frozen, verified artifact with authorized credentials. |
| Git tag creation | **Release Operator** | Creates `schemas/p2p/v<semver>` at the exact frozen SHA and never moves it. |
| GitHub Release creation | **Release Operator** | Records the verified Schemas release against the exact tag. |
| Registry/package-surface verification | **Release Operator** | Verifies the installed registry artifact, not just workspace source. |
| Completion verification | **Release Operator**, reported to the **Release Approver** | Verifies the full version/source/tag/npm/Release/release-record chain. |
| Partial-failure recovery | **Release Operator** within this contract; **Release Approver** for ambiguity or new-version decisions | Recovery must preserve immutable package and tag history. |

**Merge authority ≠ publish authority.**

There is no Schemas-specific reason to invent a different authority hierarchy from the SDK today. The Schemas-specific difference is evidentiary: release approval must include proof of the packed package surface and independently installed registry artifact because downstream packages consume this artifact directly.

## 6. Required release ordering

### A. Prepare the Schemas identity

1. Release Approver chooses the next Schemas version.
2. A release-preparation PR updates `packages/sails-p2p-schemas/package.json` to that version.
3. The same PR creates or updates the Schemas release record/changelog for that exact version.
4. The lockfile is updated only if normal workspace version preparation requires it.
5. Required repository review and CI gates pass.
6. The preparation PR is merged.

The version and release record therefore exist in Git **before** publication.

### B. Freeze and prove the package surface

7. Record the exact immutable `main` SHA containing the prepared version/release record.
8. Clean-checkout that exact SHA and install dependencies from the locked repository state.
9. Build and typecheck `@satsails/p2p-schemas` from that exact source.
10. Create the actual publishable package with `npm pack` or equivalent non-publishing package inspection.
11. Validate the packed artifact under §7.
12. Install the packed artifact into an isolated consumer outside the monorepo and validate the promised package surface.

Workspace imports or workspace tests alone are insufficient release evidence.

### C. Bind, publish, verify, and record

13. Create `schemas/p2p/v<semver>` at the exact frozen SHA.
14. Publish the exact verified artifact to npm using the dist-tag authorized for that release.
15. Verify the registry package identity and install the registry artifact in a clean isolated consumer.
16. Re-run the package-surface checks against the registry-resolved artifact.
17. Record the GitHub Release against the exact Schemas tag.
18. Verify the complete chain:

```text
schemas package version
→ frozen source SHA
→ schemas/p2p Git tag
→ packed artifact
→ npm package version
→ registry-installed package surface
→ GitHub Release
→ release record/changelog
```

Only then is the Schemas release **completed**.

## 7. Package-surface validation contract

A Schemas release must be validated from the **packed artifact**, not inferred from `src/` or workspace linking.

At minimum, release evidence must prove:

1. package name is exactly `@satsails/p2p-schemas`;
2. packed package version equals the prepared version;
3. package contents are the intended publishable files and do not accidentally contain source/test/secrets/workspace-only material;
4. CommonJS loading works if the package metadata promises a CommonJS entry;
5. ESM loading works if the package metadata promises an ESM entry;
6. TypeScript declaration files exist and resolve through the package metadata;
7. the public runtime exports required by the release's declared package surface are actually exported by the packed package;
8. downstream-required public exports identified by compatibility testing are present;
9. the package installs and imports in an isolated consumer outside the monorepo;
10. the same checks pass against the **registry-installed artifact after publication** before the release is described as completed.

The `MULTISIG_CAPABILITY_PROFILE_V1` incident is evidence for this rule, not an eternal hardcoded readiness definition. Future releases may require different exports. The contract is to prove the declared and downstream-required surface for the release being made.

The governing principle is:

> **Workspace compatibility is not sufficient evidence of published-package compatibility.**

## 8. Downstream compatibility rule

Schemas releases may affect independently versioned downstream consumers, including `@satsails/p2p-trading-sdk`.

A Schemas release does **not** automatically authorize or publish any downstream package.

After a Schemas artifact is published and registry-verified, the required downstream sequence is:

```text
registry Schemas artifact verified
→ downstream compatibility tested against that registry artifact
→ downstream dependency/version reconciliation reviewed separately
→ downstream release prepared and authorized under its own contract
```

For the P2P Trading SDK specifically, `docs/SDK_RELEASE.md` remains the release authority. A Schemas Release Operator must not mutate SDK dependency ranges or SDK versions as an implicit side effect of publishing Schemas.

## 9. Partial-failure state model

### 9.1 Source/version committed, publication fails before npm accepts the version

**State:** version prepared/source frozen, possibly tagged, artifact not published; release incomplete.

**Recovery:** verify npm first. If the exact package/version does not exist and the frozen artifact has not changed, publication of that same artifact may be retried. If source must change, do not move an existing tag or silently keep the same release identity; prepare a new version unless the Release Approver explicitly abandons an entirely unpublished and untagged preparation before any immutable external state exists.

### 9.2 Tag exists, npm publication fails

**State:** frozen source is tagged, artifact not verified as published; release incomplete.

**Recovery:** inspect npm before retrying. If the version is absent, retry publication of the exact artifact produced from the tagged SHA. If the version exists, verify artifact identity before any other action. Never move the tag to fit a mismatched artifact.

### 9.3 Publication succeeds, GitHub Release creation fails

**State:** immutable npm artifact exists and tag is bound; GitHub Release absent; release incomplete.

**Recovery:** do not republish npm. Verify the existing package and tag, then retry only the GitHub Release recording step.

### 9.4 Same package version already exists

npm package name + version identifies immutable historical artifact state.

- If it is the exact expected artifact from the current release attempt, treat publication as already completed and continue verification.
- If it differs, stop. Do not overwrite, unpublish-and-reuse, reinterpret, or change Git history to conceal the mismatch.
- Changed source requires a new package version.

### 9.5 Registry artifact does not match prepared source

**State:** identity conflict; release is not completed.

**Recovery:** stop for Release Approver review. Do not move tags or republish an occupied version. Determine whether the registry artifact is a prior legitimate publication, an interrupted release, or another identity mismatch. Any corrected source artifact must receive a new version when the existing npm version is already consumed.

### 9.6 Expected public export is missing after publication

**State:** package may be published but package-surface validation failed; release is not completed and downstream publication must remain blocked.

**Recovery:** do not replace the published artifact under the same version. Record the failed release state, prepare a new Schemas version containing the corrected public surface, and run the release process again from a new frozen source identity.

### 9.7 Process interrupted midway

Never infer failure from loss of command output. Reconstruct external state first:

```text
prepared package version
frozen source SHA
schemas/p2p tag → SHA
npm package/version/integrity
registry-installed public surface
npm dist-tag state
GitHub Release
release record/changelog
```

Resume only from the first safely missing state. Never repeat an irreversible operation blindly.

### 9.8 Wrong npm dist-tag is observed

The immutable artifact may still be correct while discovery/routing is wrong. Verify the target artifact first. Any authorized dist-tag correction must point only to an already-verified package version and must be recorded as recovery evidence. Do not infer the desired dist-tag from historical repository state.

## 10. Release record policy

Because no dedicated Schemas changelog currently exists, this contract establishes only the forward requirement:

- the next release preparation must create a Schemas release record before publication;
- that record must name the exact new package version and describe its package-surface changes;
- it may document the known `0.1.0` identity limitation as historical context;
- it must not fabricate historical dates, tags, source bindings, or exports that cannot be proven;
- after creation, that release record becomes the Schemas package-change history, while this document remains the owner of release mechanics.

Whether the file is named `packages/sails-p2p-schemas/CHANGELOG.md` should be decided in the release-preparation gate, not retroactively populated in this contract PR.

## 11. Contract for future automation

This PR does not create release automation.

A future minimal Schemas release mechanism may automate only the states and checks defined here. At minimum it must:

- require explicit release authorization;
- operate on an exact frozen `main` SHA;
- derive the package version from the package manifest and assert the approved expected version;
- require the prepared release record;
- perform clean build and typecheck;
- create and inspect the real npm package artifact;
- prove CJS/ESM/declaration behavior promised by package metadata;
- prove expected public exports from an isolated packed-package consumer;
- inspect existing tag/npm/GitHub Release state before mutation;
- fail closed on identity ambiguity;
- create the immutable `schemas/p2p/v<semver>` tag before publication;
- publish the exact verified artifact;
- install and validate the registry artifact after publication;
- create the GitHub Release only after registry verification;
- verify the complete release chain before reporting completion;
- preserve evidence sufficient for recovery.

The implementation decision remains open. A future gate should compare this concrete contract with the existing SDK mechanism and decide whether parameterization/shared machinery is genuinely simpler or whether a small Schemas-specific workflow is clearer.

Do not generalize release machinery merely because two release contracts now exist.

## 12. Explicit non-goals

This contract does not:

- bump the Schemas version;
- publish any npm package;
- mutate npm dist-tags;
- create or move Git tags;
- create GitHub Releases;
- modify SDK dependency ranges or versions;
- modify Schemas or SDK source code;
- change lockfiles;
- create a shared package-release framework;
- create or modify release workflows;
- reconstruct historical artifacts;
- revise protocol or architecture semantics.

It establishes forward release truth so the next Schemas artifact can receive a new, immutable package identity without rewriting history.
