# Sails P2P Trading SDK — Release Contract

## 1. Purpose and authority

This document is the canonical owner of **release mechanics and institutional release truth** for `@satsails/p2p-trading-sdk`.

It does not own API compatibility. `docs/API_STABLE.md` remains authoritative for the SDK compatibility/freeze contract. `packages/sails-sdk/CHANGELOG.md` remains authoritative for the SDK's recorded change history. This document owns what a release is, who may authorize it, the required state transitions, artifact traceability, and recovery from partial release failure.

The repository has multiple independent version axes. Preserve this distinction:

> **Repository version ≠ SDK package version ≠ protocol version ≠ API stability level.**

Different values across those axes are not, by themselves, an inconsistency.

## 2. Core release invariant

A future released SDK artifact must be attributable to:

1. one declared `@satsails/p2p-trading-sdk` package version;
2. one immutable source commit;
3. one artifact-specific Git tag pointing to that source commit; and
4. one changelog/release-note record describing that version.

This is a forward-looking release contract. It does **not** claim that historical SDK publications already satisfy this invariant.

The required Git tag namespace for future P2P Trading SDK package releases is:

```text
sdk/p2p-trading/v<semver>
```

Examples:

```text
sdk/p2p-trading/v0.1.4
sdk/p2p-trading/v1.0.0-rc.1
sdk/p2p-trading/v1.0.0
```

The namespace is artifact-specific because this monorepo has independent versioned artifacts. A bare repository-global tag such as `v0.1.4` must not be used for a future P2P Trading SDK package release.

The historical `v1.0.0-rc1` tag is preserved unchanged. It is a historical release-candidate checkpoint in Git history, not evidence that `@satsails/p2p-trading-sdk@1.0.0-rc1` was published to npm.

## 3. Release states

Release state must be described precisely. The following states are intentionally distinct and ordered according to the normal release path defined in §5:

1. **Version prepared** — the intended SDK version and changelog entry exist in a release-preparation PR, but are not yet part of the release source commit.
2. **Source frozen** — the version/changelog preparation is merged and one immutable source commit SHA is selected as the release source.
3. **Artifact built** — a clean checkout of that exact SHA has produced the package artifact and required verification has passed.
4. **Tagged** — the artifact-specific Git tag exists and points to the exact frozen source SHA.
5. **Artifact published** — the exact prepared package version has been accepted by the npm registry and registry state has been verified.
6. **GitHub Release recorded** — a GitHub Release exists for that exact tag and records the package version/source relationship and release notes.
7. **Release completed** — every required state above is verified as a single consistent chain.

Therefore:

> **Published ≠ Tagged ≠ Documented ≠ Release Completed.**

A partial state may be recoverable, but it must not be described as a completed release.

## 4. Release authority

Release authority is role-based. One person may hold more than one role, but the responsibilities remain distinct.

| Action | Institutional owner | Rule |
| --- | --- | --- |
| Version decision | **Release Approver** | Approves the intended SDK SemVer version and whether it is normal/stable or prerelease. |
| Release authorization | **Release Approver** | Explicitly authorizes publication after the source and evidence are reviewable. Merge authority alone does not grant this authority. |
| Package version bump | **Release Preparer** | Changes only the SDK package version axis through a reviewed release-preparation PR. |
| Changelog preparation | **Release Preparer** | Moves the intended release changes out of `Unreleased` into the exact package version/date entry before publication. |
| npm publish | **Release Operator** | Uses authorized npm credentials only after release authorization and pre-publication verification. |
| Git tag creation | **Release Operator** | Creates the artifact-specific tag at the exact frozen source SHA; never moves an existing release tag. |
| GitHub Release creation | **Release Operator** | Records the verified release against the exact tag after npm publication is verified. |
| Completion verification | **Release Operator**, reported to the **Release Approver** | Verifies the full source/version/tag/registry/Release/changelog chain. |
| Partial-failure recovery | **Release Operator** within this contract; **Release Approver** for ambiguity or any new-version decision | Recovery must preserve immutable published/version/tag history. |

**Merge authority ≠ publish authority.** A maintainer who can merge code is not thereby authorized to publish the SDK.

## 5. Required release ordering

A normal future SDK release follows this institutional ordering:

### A. Prepare the source

1. Choose the next SDK version under Release Approver authority.
2. In a release-preparation PR, update `packages/sails-sdk/package.json` to that version and update `packages/sails-sdk/CHANGELOG.md` for that exact version.
3. Update the lockfile if the package-version change causes a lockfile change under the repository's normal npm workspace behavior.
4. Pass the repository's required review and CI gates.
5. Merge the release-preparation PR.

The package version and changelog therefore exist in Git **before** publication. The historical sequence `npm publication → repository version/changelog reconciliation later` is not permitted for future releases.

### B. Freeze and verify the exact source

6. Record the exact immutable `main` commit SHA containing the prepared version/changelog.
7. From a clean checkout of that exact SHA, install dependencies using the repository's locked dependency state.
8. Run the checks required by the current CI/release contract, including at minimum the SDK build and typecheck plus the tests required to establish that the package is releasable.
9. Build from that exact source state and create the publishable tarball with `npm pack` (or the equivalent npm dry-run/pack inspection used by the future workflow).
10. Verify the package metadata and contents from the produced artifact, and perform the external/isolated package smoke test required by the release gate.

No publish may use a pre-existing or stale `dist/` unrelated to the frozen source SHA.

### C. Bind the source, publish, and record completion

11. Create the immutable Git tag `sdk/p2p-trading/v<semver>` pointing to the frozen source SHA.
12. Publish the exact verified package artifact to npm using the dist-tag explicitly authorized for that release. A normal stable release may use `latest`; a prerelease must use an explicitly approved non-`latest` dist-tag. The current live registry's dist-tags are not asserted by this document.
13. Verify the registry response/state for the exact package version and expected dist-tag before proceeding. Where available, compare registry integrity metadata with the artifact that was packed for publication.
14. Create the GitHub Release from the exact SDK tag, with release notes that point to the package version and package changelog entry.
15. Verify the full chain:

```text
package version
→ frozen source SHA
→ artifact-specific Git tag
→ npm package version
→ expected npm dist-tag
→ GitHub Release
→ changelog/release notes
```

Only after step 15 is the release **completed**.

## 6. npm facts this contract relies on

This contract relies only on standard npm publication semantics:

- npm refuses publication when the same package name + version already exists in the target registry;
- a published name/version combination cannot be reused as a new artifact;
- publishing without an explicit `--tag` assigns the publication to `latest` by default;
- a different dist-tag can be selected during publish with `--tag`;
- dist-tags are mutable aliases and can be reassigned to an already-published version with `npm dist-tag add`;
- `npm pack`/`npm publish --dry-run` can be used to inspect what would be published without publishing that package version.

A future workflow may automate these mechanics, but the workflow must implement this contract rather than redefine it.

## 7. Partial-failure state model

### 7.1 Source/version committed, publish fails before npm accepts the version

**State:** source frozen, possibly tagged, artifact not published, release incomplete.

**Recovery:** determine whether the registry contains the exact `name@version`. If it does not, the same prepared version may be retried after correcting the publish blocker, because no immutable npm version has been consumed. Do not change the frozen source or move an existing release tag while retrying the same artifact. If source changes are required, prepare a new version unless the Release Approver explicitly determines that the previous source was never published/tagged and the prepared release can be abandoned and replaced before publication.

### 7.2 npm publish succeeds, tag creation is reported as failed

Under the required ordering, the tag is created **before** npm publication. Reaching this state means the normal process was bypassed, an external/manual publish occurred first, or the operator has inconsistent observations that require reconciliation.

**State:** artifact may be published, tag state unresolved, release incomplete.

**Recovery:** first verify npm and Git independently before retrying anything. If npm contains the expected version and the expected tag is absent, create the tag at the already-frozen source SHA only after verifying that this is the source that produced the published artifact. If the expected tag exists at that SHA, continue. If it exists at any other SHA, or the published artifact cannot be safely attributed to the frozen SHA, do not move the tag and do not pretend the chain is valid; stop for Release Approver recovery. The published npm version cannot be replaced with a different artifact under the same version.

### 7.3 Tag exists, npm publish fails

**State:** source frozen and tagged, artifact not yet verified as published, release incomplete.

**Recovery:** inspect the npm registry for the exact package version before retrying. If that version is absent, retry publishing the exact artifact built from the tagged SHA. If that version exists, verify whether it is the artifact from this release attempt before doing anything else. Never move the tag to make a mismatched publication appear consistent. A genuine mismatch requires Release Approver intervention and normally a new package version.

### 7.4 npm succeeds, GitHub Release creation fails

**State:** artifact published and tagged, GitHub Release not recorded, release incomplete.

**Recovery:** retain the existing npm version and immutable tag. Retry GitHub Release creation against that exact tag. Do not republish npm merely to recover the GitHub record.

### 7.5 GitHub Release exists but npm publication fails

Under the required ordering, a public GitHub Release is created only after npm publication is verified. Reaching this state means the normal process was bypassed or the apparent npm failure has not yet been reconciled.

**State:** inconsistent / incomplete.

**Recovery:** verify npm before taking another action. If npm actually succeeded, complete normal verification. If npm did not succeed and the same exact version can still be published safely, complete publication from the frozen/tagged source and then verify the chain. If the prepared version cannot be published, do not repurpose its tag or GitHub Release for different source. Record the correction explicitly and use a new version for changed source.

### 7.6 Same version is attempted twice

Before treating a publish error as a retryable failure, inspect whether `@satsails/p2p-trading-sdk@<version>` already exists. npm does not permit reusing a published package name/version combination.

- If the existing version is the expected artifact from the current release attempt, treat publication as already completed and continue with verification.
- If it is not the expected artifact or cannot be attributed safely, stop. Do not overwrite, unpublish-and-reuse, or move Git history to conceal the mismatch. Release Approver decides the new-version recovery path.

### 7.7 Wrong npm dist-tag is observed

**State:** the immutable package version may still be correct, but release routing/discovery is incorrect; release is incomplete until the authorized dist-tag state is verified.

**Recovery:** confirm the target package version first. Because npm dist-tags are mutable aliases, an authorized Release Operator may correct the dist-tag to the already-verified published version. This correction does not change the package artifact. Record the correction in the release evidence. Never infer the desired current dist-tag from this document; it must come from the release authorization for that version.

### 7.8 Release process is interrupted midway

**State:** whatever is externally verifiable at interruption time; never assume the last command failed merely because the operator lost its response.

**Recovery:** reconstruct state from the systems of record before retrying anything:

1. frozen Git SHA;
2. artifact-specific tag and its target SHA;
3. exact npm package version and dist-tags;
4. GitHub Release state;
5. changelog/release-preparation commit.

Resume only from the first missing valid state. Do not repeat irreversible operations blindly.

## 8. Historical release interpretation

Historical release records remain evidence, not something to cosmetically reconstruct.

### `0.1.0`, `0.1.1`, `0.1.2`, `0.1.3`

Repository history records npm publication activity for these versions, but the repository does not currently provide an immutable artifact-specific tag + GitHub Release chain for each publication. Do not fabricate that traceability. No retroactive tags or Releases are created by this contract.

The `0.1.3` history is specifically instructive: repository history records that npm publication happened before the package-version/changelog reconciliation commit. Future releases must not intentionally reproduce that ordering.

This document does **not** assert the current live npm `latest` value, current dist-tags, live registry timestamps, or npm provenance status. Those facts must be verified against the registry when a release is prepared or audited.

### Historical `v1.0.0-rc1`

The repository's existing `v1.0.0-rc1` tag is a historical RC checkpoint. Its own tag record states that it was not an npm-published `1.0.0-rc1` package release. Preserve it unchanged and do not reinterpret it as part of the new artifact-specific tag namespace.

## 9. Relationship to the changelog and API stability

- `packages/sails-sdk/CHANGELOG.md` answers **what changed in each recorded SDK version**.
- `docs/API_STABLE.md` answers **what compatibility/freeze promises apply to the public SDK surface**.
- `docs/SDK_RELEASE.md` answers **what counts as an SDK release, how it is authorized/executed, and how release state is recovered**.

No one of these documents replaces the other two.

## 10. Contract for future automation

A future release workflow may automate only steps permitted by this contract. At minimum, automation must:

- require an explicit authorized invocation rather than publish merely because code reached `main`;
- operate from one explicit immutable source SHA;
- verify that the SDK package version/changelog preparation already exists in that source state;
- build and package from a clean checkout;
- run the required release gates before publication;
- publish the verified artifact, not an unrelated pre-existing `dist/`;
- use the artifact-specific tag namespace defined here;
- verify npm state after publication before creating the GitHub Release;
- stop rather than guess when an immutable version/tag/source mismatch exists;
- expose enough evidence for a maintainer to prove whether release completion succeeded.

Implementation details such as exact GitHub Actions YAML, credential mechanism, npm trusted publishing/provenance support, or the current registry's dist-tags are deliberately deferred to the release-automation mission. Automation is an implementation of this contract, not its source of authority.
