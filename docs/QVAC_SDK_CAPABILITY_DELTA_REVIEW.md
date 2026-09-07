# QVAC SDK Capability Delta Review

> First real application of `docs/ENGINEERING_GOVERNANCE.md` §8A
> (External Capability Evolution Policy). This is an evidence/research
> document, not an upgrade. **No `@qvac/sdk` version was changed by this
> review.** Investigation performed 2026-09-07.

## 1. Scope

Target dependency: `@qvac/sdk`. Purpose: determine, with evidence,
whether QVAC's evolution since Sails' reviewed version provides
capabilities, fixes, or security/correctness/operational improvements
that justify an upgrade — not "upgrade because a newer version exists."
Canonical rules governing this review (§8A, unchanged by this
document): Continuous Awareness/Deliberate Adoption; Adopt Capabilities
Not Versions; Classification ≠ Consequence; Discovery ≠ Review ≠
Adoption; QVAC Capability Evolution ≠ Protocol Authority Evolution.

## 2. Version Truth

| Label | Value | Source |
|---|---|---|
| **A. Declared version** | `^0.15.0` | `package.json:75` |
| **B. Resolved version** | `0.15.0` exactly | `package-lock.json` node `node_modules/@qvac/sdk` (`"version": "0.15.0"`, `resolved: https://registry.npmjs.org/@qvac/sdk/-/sdk-0.15.0.tgz`); confirmed installed locally at `node_modules/@qvac/sdk/package.json` (`"version": "0.15.0"`) |
| **C. Reviewed version** | `0.15.0` | `git log -p -- package.json` shows `@qvac/sdk` has been pinned at exactly `^0.15.0` since the line was first added to this repository (Missão QVAC/WDK MVP pass) — never changed since. Every piece of existing Sails evidence for QVAC (live-verified load/completion timing in `qvac-agent.provider.ts`'s own doc comment, `tests/qvac-prompt-injection.test.ts`, F8's metrics work) was necessarily produced against this exact version. Declared, resolved, and reviewed versions are identical — no drift among them. |
| **D. Latest relevant stable version** | `0.19.0` | npm registry, `dist-tags.latest` (`npm view @qvac/sdk dist-tags --json`), confirmed against `npm view @qvac/sdk time --json` — `0.19.0` published `2026-09-07T11:32:47.652Z` (the same day as this review), the newest entry in the actively-maintained `0.x` release line. |

### Version-truth discrepancy found and resolved (not silently assumed)

`npm view @qvac/sdk versions --json` also lists `1.0.0` and `1.1.0`,
which are numerically higher than `0.19.0`. Per §2 Rule 2 of this
mission's brief, this apparent discrepancy is reported rather than
silently resolved by assumption:

- `1.0.0` published `2025-11-05T10:21:01.840Z`; `1.1.0` published
  `2025-11-13T10:28:16.119Z` (`npm view @qvac/sdk time --json`).
- Both predate the entire `0.x` line shown in the same `time` object
  (`0.1.0` published `2025-10-17`, but the `0.x` line **continues past**
  `1.1.0` — `0.4.0` published `2025-11-21`, after `1.1.0` — and keeps
  incrementing continuously through `0.19.0` on `2026-09-07`, with no
  further `1.x` release ever published).
- `npm view @qvac/sdk@1.0.0 repository`/`@1.1.0 repository` both report
  `git+https://github.com/tetherto/qvac.git` — the same repository as
  `0.15.0`/`0.19.0` — so this is not a name-squat by an unrelated party;
  it is the same Tether-maintained package.
- `gh api repos/tetherto/qvac` shows the repository itself was
  **created `2026-01-03T01:59:01Z`** — nearly two months *after*
  `1.0.0`/`1.1.0` were published. The current, actively developed,
  open-source `tetherto/qvac` repository (591 stars, 111 forks, 90 open
  issues, last pushed `2026-09-07T18:44:36Z` — hours after this
  review's own data pull) did not exist yet when `1.0.0`/`1.1.0` were
  published.
- Directly demonstrated facts (corrected, CTO Gate, 2026-09-07 — this
  review did not query historical dist-tag state, so a claim that the
  tag "stayed on `0.x`" over time is not itself evidenced): more than
  20 `0.x` releases (`0.4.0` through `0.19.0`) were published after
  `1.1.0`; no `1.x` release later than `1.1.0` is present anywhere in
  the registry's version list; the **current** npm `latest` dist-tag
  points to `0.19.0`; the official current GitHub release on
  `tetherto/qvac` is `sdk-v0.19.0`. No `1.x` dist-tag or second active
  tag (other than `dev`, a pre-release channel) exists today.

**Epistemic status, split precisely (CTO Gate correction, 2026-09-07):**

- **OBSERVED** (directly, from the registry and GitHub API, not
  inferred): the publication dates above; `1.0.0`/`1.1.0`'s
  `repository` field; the `tetherto/qvac` repository's creation date;
  the current `latest` dist-tag; the absence of any `1.x` release after
  `1.1.0` through 20+ further `0.x` releases.
- **INFERRED** (a reasoned conclusion from the observed facts above,
  not itself stated by any upstream maintainer source): that
  `1.0.0`/`1.1.0` represent a historical lineage that is not currently
  maintained. No Tether/QVAC source explicitly says this — it is this
  review's own reasoning from the dates/repository-creation evidence,
  labeled as such rather than presented as upstream-documented fact.

**This does not weaken the version selection itself.** Independently of
that inference, `0.19.0` is the correct latest-relevant-stable
candidate on OBSERVED grounds alone: it is npm's own authoritative
`latest` dist-tag, and it is the official current release on the
package's own actively-maintained repository. **This review treats
`0.19.0` as the latest relevant stable version.** `@qvac/sdk`'s `dev`
dist-tag (`0.2.7-dev.*`, a pre-release channel) is separately noted
under §16
(Release Quality) and is not treated as a candidate either.

### Sources used

- `npm view @qvac/sdk versions/dist-tags/time --json` (npm registry,
  authoritative package metadata — direct registry query, not a
  third-party mirror or blog).
- `npm view @qvac/sdk@<version> repository/homepage --json` (per-version
  manifest fields).
- `gh api repos/tetherto/qvac/releases` and
  `gh api repos/tetherto/qvac/releases/tags/sdk-v<version>` (official
  GitHub Releases on the package's own `repository.url`, containing the
  maintainer's own written release notes — not a changelog aggregator
  or AI-generated summary).
- `gh api repos/tetherto/qvac` (GitHub repository metadata — creation
  date, activity, license, topics).
- `node_modules/@qvac/sdk/package.json` and `package-lock.json` (direct
  repository-local evidence of the installed/resolved version).

No blog summaries, no memory-based version assumptions, no
AI-generated release digests were used as primary evidence — every
claim below traces to one of the sources above.

## 3. Current Sails QVAC API Inventory (confirmed by repository-wide search, not assumed)

`grep -rl "from '@qvac/sdk'" --include='*.ts'` across the whole
repository (excluding the four stray `.claude/worktrees/agent-*`
duplicates of the same file) returns exactly **one** file:
`src/modules/open-agents/qvac-agent.provider.ts:49`:

```ts
import { loadModel, completion, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk'
```

This is Sails' entire `@qvac/sdk` surface. A repository-wide search for
every API name touched by a breaking change in any reviewed release
(`no_mmap`, `toolsMode`, `TOOLS_MODE`, `startQVACProvider`,
`stopQVACProvider`, `delegate:`, `heartbeat(`, `n_discarded`,
`worker-core`, `/commands`, `providerPublicKey`, `isDelegated`,
`hasActiveProviders`, `assessModelFit`, `getSystemResources`,
`batchCompletion`, `fallbackSrc`, `profiler.`) returns **zero matches**
anywhere in `src/`.

| Current Sails QVAC capability | SDK API used | Call site | Property provided | Authority level | Failure behavior | Observability | Current evidence status |
|---|---|---|---|---|---|---|---|
| Model lifecycle (load once, reuse, dispose) | `loadModel({modelSrc, onProgress})` (no `modelConfig` object passed), `unloadModel({modelId})` | `qvac-agent.provider.ts`'s `ensureModel()`/`dispose()` | Loads `LLAMA_3_2_1B_INST_Q4_0` once, memoizes `modelId`, shared across all capabilities | None — infrastructure only | A load failure rejects the caller's promise (`tests/qvacAgentProviderAvailability.test.ts` proves this — no fabricated result) | None dedicated; caught by each capability's own caller (F8 counters, below) | SUPPORTED (live-verified load timing per the provider's own doc comment: ~167s first call incl. download, ~8-9s cached), DEMONSTRATED for the failure path |
| Trade-intent risk assessment | `completion()` via `structuredCompletion()`, JSON-schema-constrained | `assessIntentRisk()` | Advisory risk label (`low`/`medium`/`high`) + reasoning + recommendation | Advisory only — `intent-engine.ts`'s deterministic `validateStructure`/`validateFinancialSanity` gate every Intent regardless of this output | Rejects, never fabricates | None dedicated | DEMONSTRATED (`tests/qvac-prompt-injection.test.ts`, `tests/qvacAgentProviderAvailability.test.ts`) |
| Buyer/Seller structured generation | `completion()` | `generateTradeIntent()`/`generateOfferIntent()` | Generates a `TradeIntentPayload`/offer draft from a plain-language goal | Advisory only — same deterministic Intent-engine gate applies | Rejects | None dedicated | SUPPORTED/DEMONSTRATED (`tests/walletAgents.test.ts`) |
| Social-engineering chat detection | `completion()` | `assessSocialEngineeringRisk()`, called by `social-engineering-agent.ts`'s `evaluate()` | Detects `off_channel_migration`/`payment_instruction_change`/`unexpected_flow_deviation`; emits `agents.social_engineering.risk_detected` | Advisory only — RFC-017's "detects, it does not act"; never blocks a message | Failure (QVAC or context-prep) is caught in `handlers.ts`, never breaks message send | **F8**: `sails_qvac_detection_invocations_total`/`sails_qvac_detection_failures_total{path="social_engineering"}` | DEMONSTRATED (`tests/socialEngineeringAgent.test.ts`, `tests/socialEngineeringDetection.test.ts`, `tests/qvacDetectionSharedPopulation.test.ts` against real unmocked wiring) |
| Offer-content risk screening | `completion()` | `assessOfferContentRisk()`, called by `liquidity.service.ts`'s `screenOfferContent()` | Same two content-visible patterns, applied to a public Offer's free text | Advisory only, fire-and-forget — never delays or blocks offer creation | Failure caught in `screenOfferContent()`'s own `.catch()` | **F8**: `sails_qvac_detection_invocations_total`/`_failures_total{path="offer_screening"}` | DEMONSTRATED (`tests/qvacOfferContentRisk.test.ts`, `tests/offerContentScreening.test.ts`, `tests/qvacDetectionMetrics.test.ts`) |
| Dispute evidence first-pass assessment | `completion()` | `assessDisputeEvidence()`, called by `dispute.service.ts`'s `proposeAutoResolution()` | `RECOMMENDATION`/`confidence`/`reasoning` for a `RELEASE`/`REFUND`/`INCONCLUSIVE` outcome | Advisory only — same "attestor, not mover" boundary as human arbiters (RFC-021 D1); a contest window always exists before anything final | Off end-to-end by default (`QVAC_AUTO_RESOLUTION_ENABLED=false`) | None dedicated | DEMONSTRATED (`tests/qvacDisputeEvidence.test.ts`, `tests/qvacAutoResolutionHandler.test.ts`) |

No API usage in this table was assumed — every row traces to a real
`import`/call site confirmed by direct reading, matching the mission's
own "no probably-unused claims" instruction.

## 4. Current Authority Boundary (frozen before reviewing new capabilities)

QVAC's role today, confirmed by the inventory above: **Agent
Infrastructure** (`docs/PROJECT_CONTEXT.md` §3's own table), never
Protocol/Settlement/Signing/Capability/Evidence/Finality Authority.

```
QVAC OUTPUT
      │  structured recommendation / generated proposal / risk signal
      ▼
SAILS DETERMINISTIC BOUNDARIES
      │  intent-engine.ts's validateStructure()/validateFinancialSanity()
      │  RFC-017: detection only, chat.routes.ts's WS RISK_WARNING is advisory
      │  RFC-021 D1: dispute.service.ts's contest window before finality
      ▼
VALIDATION / AgentGrant / PROTOCOL RULES / HUMAN OR AUTHORIZED ACTION
```

No repository evidence contradicts this — every one of the five
capabilities in §3's table passes through a deterministic Sails
boundary before anything protocol-visible happens. This is not an
architecture finding; the boundary holds.

## 5. Upstream Version Delta (0.15.0 → 0.19.0)

All release notes below are directly quoted/summarized from the
official GitHub Releases (`gh api repos/tetherto/qvac/releases/tags/sdk-v<version>`)
on `tetherto/qvac`'s own `repository.url`.

| Version | Date | Change | Category | Breaking? | Security/Correctness? | Capability? | Maintenance? | Relevant to Sails? | Source |
|---|---|---|---|---|---|---|---|---|---|
| 0.15.0 (reviewed) | 2026-07-13 | `batchCompletion`, multimodal GPU placement, LavaSR TTS, ja/zh Chatterbox, Android worklet/RPC/registry-cache fixes | Capability + fix | No | Minor (Android leak fix) | Yes (unused modality) | — | No — no modality/API used | GitHub Release `sdk-v0.15.0` |
| 0.16.0 | 2026-07-27 | Ideogram diffusion, per-phase diffusion timing, Python client preview, GR00T VLA, KV-cache reuse in OpenAI-compatible serve endpoints, OCR path fix, TTS/Parakeet registry refresh (removes legacy constants) | Capability + fix | No (removed constants are unused by Sails) | No | Yes (unused modalities) | Yes | No — no modality/serve-endpoint used | GitHub Release `sdk-v0.16.0` |
| 0.17.0 | 2026-08-10 | AudioGen music, Parler-TTS, `getSystemResources`, unified ASR addon, DSML tool parsing (DeepSeek), `emittedTokens`/`generatedTokens` split, **context-boundary termination** (streamed completions no longer stall at context limit), GR00T multi-embodiment, backend diagnostics + profiler resource gauges, automatic KV-cache disk bounding (24h TTL, 4 GiB LRU), NodeNext declaration fix, legacy ONNX OCR removed, Wan 2.2 validation | Capability + reliability fix | Yes, but confirmed non-applicable (OCR constants, Wan2.2 options unused) | Yes (context-boundary hang fix; KV-cache disk bounding) | Yes | Yes | **Yes** — see §6 | GitHub Release `sdk-v0.17.0` |
| 0.17.1 | 2026-08-13/14 | Python packaging, Windows fat-wheel fix, `bare-rpc` stream teardown | Maintenance | No | Windows/Python-specific | No | Yes | No — Sails is server-side Node/TS only | GitHub Release `sdk-v0.17.1` |
| 0.18.0 | 2026-08-24 | **Continuous batching** (concurrent `completion()` on one loaded model), `loadModel` `fallbackSrc`, AudioGen cover, CosyVoice3/Audio8 TTS, streaming transcription stats, Indic Conformer, sharded-model-load fix, tool-KV-cache-prefix fix; **breaking**: dynamic `toolsMode` removed, CosyVoice3 `pace` restricted | Capability + breaking | Yes, confirmed non-applicable (Sails never sets `tools`/`toolsMode`, never uses CosyVoice3) | No | **Yes** — see §6 | Yes | **Yes** — see §6 | GitHub Release `sdk-v0.18.0` |
| 0.18.1 | 2026-08-24 | Config schema descriptions (`@qvac/sdk/schemas`), CosyVoice3 cache-key fix | Maintenance | No | No | No | Yes | No — Sails doesn't use CosyVoice3 or the schema-introspection API | GitHub Release `sdk-v0.18.1` |
| 0.18.2 | 2026-08-26 | Bumps `@qvac/diffusion-cpp` to `^0.18.0` | Maintenance | No | No | No | Yes | No — Sails doesn't load diffusion models | GitHub Release `sdk-v0.18.2` |
| 0.19.0 (latest) | 2026-09-07 | **In-process engine restructure** (`@qvac/inference` becomes the worker engine; `@qvac/bare-sdk` de-lockstepped; `./worker-core`/`./commands` removed), **delegated/DHT inference removed**, `no_mmap`→`load_mode`, batch `translate()` returns an array, `n_discarded` dropped (richer `ContextOverflowError`), **`assessModelFit`** pre-download fit check, ABot-World, MiniMax music, Parakeet Unified, **Hugging Face download checksum verification**, **worker startup timeout** (`WorkerStartupError` with exit info), tensor-split/flash-attention config, TurboVec RAG index, config schema descriptions, Qwen tool-call parser fix, iOS/Expo fix | Breaking + capability | Yes, per-API — see §8 | Yes (HF checksums; worker-startup-timeout observability) | **Yes** — see §6 | Yes | **Yes** — see §6/§8 | GitHub Release `sdk-v0.19.0` |

Intermediate patch releases (0.17.1, 0.18.1, 0.18.2) were reviewed, not
skipped, per the mission's instruction not to compare only endpoints —
none carries a material change Sails' inventory (§3) touches.

## 6. Capability Delta — Relevant Findings Only

Per §6F of the mission ("a capability must answer: what Sails property
does this improve?"), only genuinely relevant deltas are elaborated;
irrelevant upstream additions (TTS engines, diffusion/video/VLA/RAG,
transcription engines, Python packaging) are named in §5's table and
not expanded further — Sails uses none of these modalities and adopting
QVAC does not require adopting all of it.

### A. Model lifecycle / reliability

- **Context-boundary termination (0.17.0).** UPSTREAM DOCUMENTED: a
  streamed completion that fills the model's context window now
  terminates with a `length` stop instead of stalling. Sails uses
  `stream: false` exclusively (`structuredCompletion()`), so the
  streaming-specific stall this fixes does not apply to Sails' current
  call pattern as written — NOT TESTED for the non-streaming path,
  marked UNKNOWN whether a context-overflow scenario in `stream: false`
  mode was affected the same way pre-0.17.0. Low relevance given
  Sails' fixed, short prompts (a handful of fields, not open-ended
  user text at scale) make context overflow an unlikely present-day
  scenario, but not literally impossible if `recentMessageContext()`'s
  5-message window grows unusually long.
- **Automatic KV-cache disk bounding, 24h TTL / 4 GiB LRU (0.17.0).**
  UPSTREAM DOCUMENTED. Sails' `qvacAgentProvider` is a long-lived
  singleton in a long-running server process — unbounded local disk
  growth from repeated inference is a real, if currently
  NOT-DEMONSTRATED (never measured in this environment), operational
  concern for any production deployment. This is a genuine, if modest,
  operational-improvement candidate.
- **`loadModel` `fallbackSrc` (0.18.0).** UPSTREAM DOCUMENTED: a backup
  model source used automatically if the primary fetch fails. Sails
  does not currently set this, and — notably — it addresses exactly one
  class of failure that today's F8 `sails_qvac_detection_failures_total`
  would otherwise have to surface as a bare failure with no
  self-healing option.
- **`assessModelFit` (0.19.0).** UPSTREAM DOCUMENTED: estimates whether
  a model will fit in available memory *before* downloading/loading it,
  returning `"likely-fits"`/`"likely-too-large"`/`"unknown"`. This is a
  genuine new pre-flight health check Sails does not have today — a
  real candidate for reducing one class of "load hangs or fails deep
  into the call" scenario into a proactive, observable decision. NOT
  currently demonstrated for Sails' own deployment target(s); would
  need real evidence before being relied upon (§8A's own evidence
  discipline).
- **Worker startup timeout / `WorkerStartupError` (0.19.0).** UPSTREAM
  DOCUMENTED: distinguishes "the worker is dead" from "the worker is
  slow" via `exitCode`/`exitSignal`/`stderrTail`, configurable via
  `rpcInitTimeoutMs`/`QVAC_RPC_INIT_TIMEOUT_MS`. This is an SDK-level
  complement to F8's own application-level invocation/failure counters
  — F8 observes *that* an evaluation degraded; this would give QVAC's
  own layer a reason *why*, without Sails building that itself.

### B. Concurrency (Guardian-relevant — see §7)

- **Continuous batching (0.18.0).** UPSTREAM DOCUMENTED, verbatim:
  "One loaded LLM can now run several `completion` calls at once. A new
  request takes a free slot without waiting for the whole batch to
  drain... Single-slot models and fine-tuning stay one-at-a-time." This
  is the single most consequential capability finding in this review —
  see §7 and §11.

### C. Security-adjacent

- **Hugging Face download checksum verification (0.19.0).** UPSTREAM
  DOCUMENTED: HTTP downloads from Hugging Face are verified against the
  Hub's own SHA-256, opt-in-strict via `requireHttpChecksum`/
  `requireSecureTransport`. Sails' own model
  (`LLAMA_3_2_1B_INST_Q4_0`) is downloaded "once via QVAC's own
  registry" per `qvac-agent.provider.ts`'s existing doc comment, not
  necessarily via a raw Hugging Face URL — **UNKNOWN** whether this
  checksum path covers registry-sourced models too or only explicit HF
  URLs; upstream documentation does not resolve this, and it is not
  inferred here. Flagged as a real open question for a future security
  review, not claimed as a demonstrated improvement for Sails' actual
  download path.

### D. Explicitly rejected as irrelevant (not a use case invented to justify anything)

Tool calling / DSML parsing (Sails never sets `tools`), diffusion/video/
image/music generation, VLA/robotics (GR00T/ABot-World), all
transcription/TTS engines and voices, RAG/TurboVec, Python SDK/client,
`getSystemResources` (no current Sails need to inspect raw system
resources — distinct from `assessModelFit`, which answers a concrete
"will this specific model fit" question Sails could plausibly use),
tensor-split/flash-attention tuning (no GPU-specific tuning need
demonstrated today), config schema introspection (`@qvac/sdk/schemas`
— a tooling/documentation feature, not a runtime capability Sails'
server needs). None of these earn a place in Sails' architecture merely
because QVAC now offers them (COBRA Check, §29).

## 7. Guardian / Risk-Layer Implications

Per the mission's explicit boundary: **Guardian is Adaptive Risk
Intelligence — not deterministic replay protection, DB atomicity,
signature verification, proof verification, settlement truth, protocol
authorization, or global freeze authority.** Findings below are
strictly scoped to the adaptive-security side of that line.

- **Concurrency under multiple simultaneous trades** — the single most
  relevant finding. Sails' `qvacAgentProvider` is a shared singleton
  (`export const qvacAgentProvider = new QvacAgentProvider()`) used by
  every capability in §3's table across every trade concurrently.
  Whether concurrent `completion()` calls on the reviewed version
  (0.15.0) genuinely run in parallel or effectively serialize behind
  each other is **NOT TESTED** in this repository (every existing QVAC
  test mocks `@qvac/sdk`'s `completion` directly — none exercises real
  concurrent calls against a loaded model). 0.18.0's own release notes
  describing "continuous batching" as a *new* capability — replacing an
  implied prior behavior of waiting "for the whole batch to drain" —
  is UPSTREAM DOCUMENTED evidence that pre-0.18.0 concurrent
  `completion()` calls likely serialized more than 0.18.0+ allows. This
  is a real, plausible capability gain for a future Guardian layer that
  must evaluate several trades' risk simultaneously without one trade's
  evaluation queueing behind another's — but it is INFERRED from release
  notes, not SAILS-DEMONSTRATED, and requires a real benchmark against
  an actually-upgraded SDK to confirm (registered as required evidence
  in §20, not performed here per the mission's explicit instruction not
  to mutate dependencies for this review).
- **Evaluation availability / health visibility** — `assessModelFit`
  and the worker-startup-timeout's `WorkerStartupError` (§6A) are both
  genuine candidates for making a future Guardian's own "is the
  evaluator actually available right now" question answerable at the
  SDK layer, complementing (not replacing) F8's own
  application-level counters.
- **Context management / risk-analysis latency** — no material delta
  found for Sails' actual usage pattern (short, fixed-shape prompts,
  `stream: false`); the KV-cache-reuse-across-turns feature (0.16.0)
  applies to the OpenAI-compatible *serve* endpoints Sails does not run.
- **Structured outputs** — Sails' `responseFormat: {type: 'json_schema', ...}`
  usage is unchanged across every reviewed release; no delta.
- **Tool reliability / delegated inference** — not applicable: Sails
  never uses tool-calling or delegation (§3), so 0.18.0's `toolsMode`
  removal and 0.19.0's delegated-inference removal affect nothing Sails
  does. (Note: QVAC's own now-removed "Delegated DHT inference" feature
  — `startQVACProvider`, `providerPublicKey` — is an entirely separate
  system from Sails' own Pears/HyperDHT `TransportProvider`; confirmed
  by direct code/doc search that no file in this repository conflates
  the two.)

**No deterministic security responsibility is proposed to move into
QVAC by this review** (COBRA Check, §29) — every finding above stays on
the adaptive/advisory side of the boundary in §4.

## 7A. Bounded Upgrade Mission Requirements (registered, not executed)

Added per CTO Gate direction, 2026-09-07 — see §19A for the disposition
this section supports. **Nothing below is performed by this review.**
It is the evidence obligation a future, separately-authorized upgrade
mission must satisfy, at minimum, before adopting `0.19.0`:

1. Target `@qvac/sdk 0.19.0`.
2. Verify whether `@qvac/inference` requires explicit direct declaration
   in `package.json` or is satisfied transitively — based on actual
   package-install behavior, not assumed from the release notes alone.
3. Preserve lockfile evidence (the pre-upgrade `package-lock.json`
   state, for rollback per §17 Q10).
4. `npx tsc --noEmit` / full typecheck against the upgraded install.
5. Run all existing QVAC-touching tests (§22's list) against the
   upgraded install.
6. A real model load against `0.19.0` (not mocked).
7. A real structured `completion()` call against `0.19.0` (not mocked).
8. Real clean / threat / degraded paths exercised end-to-end (not just
   unit-mocked) to confirm §12's expectation empirically.
9. F8's `failures ≤ invocations` invariant re-verified under the
   upgraded runtime (§12).
10. A concurrent-`completion()` benchmark on one shared loaded model,
    to test the continuous-batching hypothesis (§7/§11) for real.
11. A baseline comparison against `0.15.0` where practical (same
    prompts, same hardware).
12. Worker-startup failure behavior exercised directly (kill/delay a
    worker, confirm `WorkerStartupError`'s shape).
13. `assessModelFit` behavior exercised directly, if adopted as part of
    the same mission.
14. Network/telemetry observation (e.g. a packet capture or proxy
    during a real load/completion cycle) sufficient to bound the
    privacy claim in §10 with real evidence, not release-note inference
    alone.
15. A dependency/native/runtime delta review of `@qvac/inference`
    itself (§9's NOT TESTED native-layer gap) — at least a directory/
    size/native-binding diff against the pre-upgrade tree.
16. Full regression suite (not just QVAC-touching suites).
17. A documented rollback test or rollback plan, exercised or at least
    dry-run-verified, not merely asserted.

**Explicitly not authorized by this section or by any future mission it
describes:** any Guardian authority expansion, any tool execution
capability, any `AgentGrant` change, any signing/settlement authority
change. A bounded upgrade mission satisfying the list above still ends
at "the SDK version changed" — it does not, on its own, authorize any
of those four.

## 8. Breaking Change Review (per Sails' actual 4-symbol surface)

| Sails API used | 0.19.0 status | Evidence |
|---|---|---|
| `loadModel({modelSrc, onProgress})`, no `modelConfig` | **UNCHANGED** | No breaking-change entry across 0.15.0–0.19.0 touches the bare `{modelSrc, onProgress}` shape when no `modelConfig` object is passed. `no_mmap`→`load_mode` (0.19.0) and `toolsMode` removal (0.18.0) both live inside `modelConfig`, which Sails never sets (confirmed by grep, §3). |
| `completion({modelId, history, stream: false, responseFormat: {json_schema}})` | **UNCHANGED** | No breaking-change entry touches this shape; `emittedTokens`/`generatedTokens` (0.17.0) is an additive `stats` field Sails never reads. |
| `unloadModel({modelId})` | **UNCHANGED** | No breaking-change entry mentions `unloadModel`. |
| `LLAMA_3_2_1B_INST_Q4_0` | **UNCHANGED** | Never appears in any release's "Removed Models" list (0.16.0, 0.17.0). |
| `./worker-core`, `./commands`, `startQVACProvider`, `delegate`, `heartbeat`, `n_discarded`, `toolsMode` | **REMOVED upstream (0.18.0/0.19.0), but never imported by Sails** | Confirmed by repository-wide grep returning zero matches (§3). |

**Result, stated precisely (CTO Gate correction, 2026-09-07):** no
Sails source-code API migration is indicated for its currently used
4-symbol QVAC surface. Every breaking change in the 0.16.0–0.19.0 range
touches either an unused modality (OCR, TTS, diffusion, VLA) or an
unused configuration surface (`modelConfig.tools`/`toolsMode`/
`no_mmap`, delegated-inference options) Sails' code never sets —
directly demonstrated by grep, not inferred from documentation.

This finding is deliberately scoped to *source-level API compatibility*
only, and must not be read more broadly than that:

- **SOURCE API MIGRATION INDICATED: NONE** — the 4 symbols' call shapes
  are unchanged.
- **RUNTIME/PACKAGE MIGRATION: PRESENT** — 0.19.0 restructures the
  worker/engine boundary onto `@qvac/inference` as a required
  co-dependency (§15), a real packaging change independent of whether
  Sails' own source needs to change.
- **EMPIRICAL COMPATIBILITY: NOT YET DEMONSTRATED** — this review
  confirms compatibility by reading release notes and grepping Sails'
  source; it did not install `0.19.0` and run Sails' actual code
  against it. "No code migration indicated" is a static-analysis
  conclusion, not a runtime-verified one — a future upgrade mission
  (§7A) must produce that verification before this finding can be
  treated as demonstrated rather than expected.

## 9. Security / Trust-Boundary Review

Applied regardless of classification (§8A's own Security-Sensitive
Rule). Investigated:

- **Local-only inference** — UNCHANGED across all reviewed versions;
  0.19.0's removal of delegated/DHT inference *strengthens* the
  "local-only" property upstream (there is no longer a code path for
  QVAC to run inference on a remote peer at all — the delegate/provider
  API is gone). Not claimed as a Sails-relevant security improvement
  since Sails never used that API, but noted as a real upstream
  hardening.
- **Network access / model downloads** — the model is fetched via
  QVAC's own registry on first `loadModel()` call, unchanged in shape;
  0.19.0 adds opt-in Hugging Face checksum verification, whose
  applicability to Sails' actual model source is UNKNOWN (§6C), not
  claimed.
- **Model provenance / cache location** — `~/.qvac/kv-cache`'s new
  bounding (0.17.0) is a disk-usage change, not a provenance change;
  no evidence of a provenance-relevant change found.
- **Telemetry / external communications** — no release note in the
  reviewed range mentions new telemetry, phone-home behavior, or
  external reporting. **NOT TESTED directly** (this review did not
  install 0.19.0 to inspect network traffic) — absence of a documented
  change is evidence of absence of a *documented* change, not proof of
  no behavioral difference. Marked UNKNOWN, not asserted as safe.
- **Tool/prompt execution surface** — Sails never enables tool calling;
  no delta relevant to Sails' own prompt/tool boundary.
- **Arbitrary code execution surfaces / native bindings** — `@qvac/sdk`
  0.15.0's own dependency tree already includes multiple native/ggml
  addon packages (`@qvac/llm-llamacpp`, `@qvac/embed-llamacpp`, etc. —
  `package-lock.json:6937-6951`); 0.19.0's restructure onto
  `@qvac/inference` changes *which* package hosts the worker process
  but does not, per the release notes, change the fundamental
  native-addon-execution model. **NOT TESTED** for a security-relevant
  behavioral difference in the native layer itself — this review did
  not audit `@qvac/inference`'s own source.
- **Error/failure semantics** — 0.19.0's `WorkerStartupError` and
  richer `ContextOverflowError` are both **additive** (more detail on
  an existing failure mode, not a new failure mode or a changed
  failure contract) — consistent with, not a threat to, F8's existing
  "failure is observable, never silently swallowed" property.

**No claim of "local = secure" is made** — every finding above is
scoped to a specific, named property, per the mission's explicit
instruction.

**Security/consequence classification (CTO Gate correction, 2026-09-07)
— narrowing an earlier, too-narrow statement that "none of the reviewed
changes touch a security-sensitive property":** that statement is
correct only with respect to Sails' *protocol* authority (§4/§13 —
unaffected, confirmed) — it understates the review under §8A's own
"Classification ≠ Consequence" rule. 0.19.0 genuinely changes the
inference engine/package boundary (`@qvac/inference` becomes the
in-process engine, §5/§8/§15), the native/runtime dependency surface,
worker startup/error behavior, delegated-inference availability, and
introduces new download-verification capabilities. None of this changes
protocol authority. It **does** create a real security/runtime-sensitive
consequence for any future adoption, independent of the primary
capability classification (§18) — this is exactly the case §8A's
Classification ≠ Consequence rule exists to catch, and a future upgrade
mission must satisfy the Security-Sensitive Rule's proportionate
evidence bar (§7A) before adoption, not merely because the primary
class label is "Capability."

## 10. Privacy Review

No evidence found, across the reviewed *release notes*, of a change to:
where prompts go, telemetry, model acquisition beyond the checksum
addition (§6C/§9), caching (beyond the disk-bounding change, §6A),
logs, or metadata exposure. **Stated precisely (CTO Gate correction,
2026-09-07):** no documented inference-destination/privacy regression
was found in the reviewed upstream material. Delegated/DHT inference
removal is UPSTREAM DOCUMENTED and plausibly narrows the surface for
external communication, but this review does not infer from it that
every external communication path is therefore absent. **Actual
0.19.0 runtime network/telemetry behavior was NOT TESTED in this
investigation** — no traffic was observed, no install was performed.
Sails' own content boundaries (trade data, offers, chat content, risk
context, agent goals) are unchanged at the source level (§8), which is
a narrower claim than a demonstrated privacy property of the upgraded
runtime. No privacy improvement, and no privacy regression, is claimed
without evidence.

## 11. Performance / Concurrency Review

Upstream claims (UPSTREAM DOCUMENTED, not independently benchmarked by
this review): continuous batching (0.18.0, §6B/§7) and per-phase
diffusion timing stats (0.16.0, irrelevant — Sails doesn't use
diffusion). **SAILS-DEMONSTRATED property: none** — this review does
not benchmark, per the mission's own instruction ("do not benchmark
unless necessary to answer the adoption decision... if a real benchmark
would require actually upgrading package code, register it as evidence
required for a future upgrade mission"). Concurrent-evaluation
throughput under multiple simultaneous trades is exactly the kind of
Guardian-relevant property (§7) that would require a real 0.18.0+
install and a real concurrent-load test to confirm — registered as a
required evidence item for any future upgrade mission (§20), not
performed here. No dependency was mutated to obtain this evidence.

## 12. F8 Observability Compatibility

F8 is frozen. `sails_qvac_detection_invocations_total`/
`sails_qvac_detection_failures_total{path}` are incremented entirely in
Sails' own code (`liquidity.service.ts`, `social-engineering-agent.ts`,
`handlers.ts`) around calls into the SDK's `completion()`/context-prep
steps — they do not depend on any QVAC-internal error type, shape, or
concurrency model. Per §8's finding that none of Sails' 4 used symbols
change shape through 0.19.0, an upgrade to 0.19.0 would be expected to
preserve `SUCCESS+CLEAN ≠ SUCCESS+THREAT ≠ DEGRADED` exactly as
implemented. **Stated precisely (CTO Gate correction, 2026-09-07): no
instrumentation migration is currently indicated, but the frozen F8
properties must be regression-tested under the upgraded runtime** before
that expectation is treated as demonstrated — this review's static
source-level analysis (§8) is not itself a runtime test of F8's
counters against `0.19.0`. The one additional caveat: if a future
upgrade mission *also* adopted continuous batching's concurrent
`completion()` calls (§7), that would be a genuine new usage pattern,
not merely a version bump — `failures ≤ invocations` must be
re-verified under real concurrency at that time, not assumed to hold
automatically. **F8 is not changed by this review**, and this review
performed no runtime test against `0.19.0` at all.

## 13. AgentGrant / Authority Compatibility

No capability in §6 grants QVAC (or any agent built on it) the ability
to propose-and-execute, sign, mutate protocol state, or move funds —
every finding stays within the "structured recommendation" box in §4's
diagram. `AgentGrant` (this codebase's actual authority primitive for
what an agent may do) is untouched by any upstream change reviewed
here; no upstream delegation concept (the now-*removed*
`startQVACProvider`/`delegate` API) was ever equated with `AgentGrant`,
and per §8A's own rule, it would not be even if it still existed — an
upstream capability being *possible* does not, on its own, make it
*authorized*.

## 14. Semantic Stability Check

No finding in this review requires redefining Intent, Authority,
Conditions, Evidence, Outcome, Capability, Settlement, event meaning,
or conformance meaning. This is confirmed, not assumed: every relevant
capability (§6) is either (a) infrastructure-level (model lifecycle,
concurrency, health checks) with zero surface in any Sails-defined
type, or (b) entirely unused by Sails today (§6D). **No STOP condition
under §14/§8A's Semantic Stability Rule is triggered.**

## 15. Supply-Chain / Runtime Delta

- `@qvac/sdk` 0.15.0 already declares numerous native/ggml-backed
  sub-package dependencies (`@qvac/bci-whispercpp`,
  `@qvac/classification-ggml`, `@qvac/decoder-audio`,
  `@qvac/diffusion-cpp`, `@qvac/embed-llamacpp`, `@qvac/llm-llamacpp`,
  `@qvac/ocr-ggml`, `@qvac/rag`, `@qvac/registry-client`,
  `@qvac/transcription-parakeet`/`-whispercpp`, plus `@qvac/error`/
  `@qvac/logging`/`@qvac/langdetect-text`) — `package-lock.json:6937-6951`.
  This is a genuinely broad, multi-modality package; Sails' own runtime
  footprint from it is effectively bounded to the LLM/embed-llamacpp
  path it actually exercises, not the full tree.
- 0.19.0's restructure onto `@qvac/inference` as the worker engine
  (§5/§8) is the most material dependency-tree change in the reviewed
  range. Directly observed (corrected, CTO Gate, 2026-09-07 — cited to
  the package manifest itself, not only the release note's prose):
  `npm view @qvac/sdk@0.19.0 dependencies` shows `@qvac/sdk 0.19.0`
  declares `@qvac/inference: "^0.19.0"` as one of its own `dependencies`
  — meaning `npm`/`package-lock.json` would already resolve and install
  it *transitively* as part of installing `@qvac/sdk` itself, the same
  way `@qvac/llm-llamacpp` and every other `@qvac/*` sub-package already
  is at `0.15.0` (§15's own first bullet). This does **not** by itself
  mean Sails must add `@qvac/inference` as its own direct
  `package.json` dependency — whether a direct declaration is needed
  or advisable (e.g. for version-pinning clarity) versus relying on the
  transitive resolution is exactly the open question §7A's evidence
  obligation #2 registers for the bounded upgrade mission to establish,
  not resolved here. The release notes' own migration prose ("Install
  both at 0.19.0") is corroborating context, not the primary evidence
  for this fact.
- No new build prerequisite, platform constraint, or Node-version
  requirement was found in any reviewed release note.
- `@qvac/bare-sdk` is explicitly de-lockstepped from the SDK's own
  version as of 0.19.0 (no longer versioned together) — Sails does not
  import `@qvac/bare-sdk` directly (confirmed absent from
  `package.json`), so this affects only QVAC's own internal dependency
  graph, not a Sails import.

## 16. Release Quality / Stability

`@qvac/sdk` is pre-1.0 (`0.19.0` per the active `latest` tag — the
stray `1.0.0`/`1.1.0` legacy releases notwithstanding, §2). Per the
mission's own instruction, semver-minor bumps are **not** treated as
automatically non-breaking: 0.16.0, 0.17.0, 0.18.0, and 0.19.0 each
carried at least one breaking change (§5's table). The release cadence
is active and frequent (9 releases across the 0.15.0→0.19.0 window,
2026-07-13 to 2026-09-07, roughly one every 1-2 weeks) with real,
substantive release notes each time — not a rubber-stamped or abandoned
line. The separate `dev` dist-tag (`0.2.7-dev.*`) is a pre-release
channel distinct from `latest` and is explicitly not a candidate for
adoption. **`0.19.0` (the `latest` tag) is both the newest and the
maintainer-designated recommended version** — latest and best-for-Sails
happen to coincide here on the evidence gathered, though that
conclusion rests on §8's breaking-change analysis, not merely on it
being newest.

## 17. Decision Test (§8A, frozen, applied here)

1. **What changed upstream?** Nine releases (0.16.0-0.19.0) adding
   audio/video/image/VLA modalities Sails doesn't use, plus
   infrastructure changes: continuous batching, `assessModelFit`,
   worker-startup-timeout, KV-cache disk bounding, HF checksums, and a
   0.19.0 restructure onto `@qvac/inference` with delegated-inference
   removal.
2. **What capability/property does Sails gain?** Primarily
   *operational*: bounded KV-cache disk growth, a pre-flight model-fit
   check, clearer worker-startup failure diagnosis, and (the most
   significant, unconfirmed) potential concurrent-evaluation throughput
   via continuous batching for a future Guardian layer.
3. **What existing behavior could break? (corrected, CTO Gate,
   2026-09-07)** No Sails source-level API migration is currently
   indicated for the 4-symbol surface Sails uses, per §8's direct
   grep-based analysis. However, `0.19.0` changes the runtime/package
   architecture through `@qvac/inference` (§15), and actual Sails
   runtime compatibility has not yet been demonstrated. Therefore:
   **SOURCE API MIGRATION INDICATED: NONE** / **RUNTIME/PACKAGE
   MIGRATION: PRESENT** / **RUNTIME BREAKAGE: NOT YET TESTED** — this
   review does not claim nothing could break, only that nothing in the
   static source-level analysis indicates a break.
4. **What trust/security boundary changes? (corrected, CTO Gate,
   2026-09-07)** **PROTOCOL AUTHORITY CHANGE: NONE INDICATED** —
   delegated-inference removal *strengthens* the local-only property
   upstream, and no finding touches Sails' `AgentGrant`/protocol
   authority (§13). But **SECURITY/RUNTIME CONSEQUENCE: PRESENT** — the
   upgrade changes the inference engine/package boundary, the
   native/runtime dependency surface, worker startup/error behavior,
   delegated-inference availability, and adds a new download-
   verification capability. These require proportionate upgrade
   evidence under §8A (§7A), regardless of the absence of a protocol-
   authority change. HF checksum applicability to Sails' model source
   remains UNKNOWN, not resolved by this review.
5. **What API/semantic assumptions change? (corrected, CTO Gate,
   2026-09-07)** No Sails protocol semantic change is indicated for the
   currently used QVAC API surface (§14). The runtime/package
   assumption does change, however: `0.19.0` depends on
   `@qvac/inference` as a required co-installation (§15) — a real
   packaging-level change, not merely an unchanged assumption restated.
6. **Can Sails safely remain on the current version? (corrected, CTO
   Gate, 2026-09-07)** Current repository tests against the existing
   `0.15.0` installation pass (§22's test list, 55/55), and this review
   found no vulnerability, EOL notice, or correctness defect requiring
   departure from `0.15.0`. A fresh real-model runtime revalidation of
   `0.15.0` was not performed by this review — the tests above exercise
   `0.15.0` through the existing mocked/unmocked test suite, not a new
   live-inference pass run specifically for this review. Based on the
   available evidence, remaining temporarily on `0.15.0` is currently
   acceptable.
7. **What evidence is required before adoption?** A real,
   post-upgrade install-and-test pass confirming §8's grep-based
   compatibility claim empirically (not just statically); a real
   concurrent-completion benchmark to confirm or refute the Guardian
   concurrency hypothesis (§7/§11); resolution of the HF-checksum
   applicability UNKNOWN (§6C/§9); a real full-suite + F8-targeted test
   run against the upgraded SDK.
8. **What migration cost/complexity is introduced? (corrected, CTO
   Gate, 2026-09-07)** The main new runtime/package consideration is
   `@qvac/sdk` `0.19.0`'s dependency on `@qvac/inference` (§15). Whether
   Sails must declare `@qvac/inference` directly or receives it
   transitively remains to be established by the bounded upgrade
   mission (§7A item 2) — not assumed either way here. Migration
   complexity remains expected LOW (no source-code rewrite indicated,
   per Q3) but is **NOT YET DEMONSTRATED** — expectation, not evidence.
9. **Can the capability be adopted without coupling Sails semantics to
   the vendor implementation?** Yes — every genuinely relevant
   capability found (§6) is infrastructure-level (lifecycle, health,
   concurrency), consumed the same way Sails already consumes
   `loadModel`/`completion`/`unloadModel` today; none requires Sails to
   expose a new QVAC-specific concept in its own protocol surface.
10. **What rollback/containment posture exists if adoption fails?**
    Revert `package.json`'s declared range and `package-lock.json` to
    `^0.15.0`/`0.15.0` (a single dependency, no schema/migration
    coupling); F8's counters and every existing QVAC test would
    continue to function unchanged against the reverted version, per
    §12's finding.

## 18. Classification

**Primary: Class B — Capability** (operational/reliability
improvements — KV-cache bounding, model-fit pre-check,
worker-startup diagnostics — plus the unconfirmed-but-plausible
Guardian concurrency capability).

**Secondary consequence (corrected, CTO Gate, 2026-09-07): Security /
Runtime-sensitive — not "none."** An earlier version of this section
concluded that no reviewed change touches a security-sensitive
property, reasoning only from Sails' *protocol authority* boundary
(§4/§13, genuinely unaffected). That was too narrow under §8A's own
Classification ≠ Consequence rule: 0.19.0 changes the inference
engine/package boundary, the native/runtime dependency surface, worker
startup/error behavior, delegated-inference availability, and adds new
download-verification capabilities (§9's own corrected finding) — none
of which changes protocol authority, but all of which are a genuine
runtime/security-adjacent consequence a primary "Capability"
classification does not, by itself, downgrade. **Final classification:
Primary Class B — Capability; Secondary Consequence — Security /
Runtime-sensitive.** This means a future upgrade mission must satisfy
the Security-Sensitive Rule's proportionate-evidence bar (§7A) before
adoption — the primary class label alone does not exempt it. If the
HF-checksum-applicability UNKNOWN (§6C) is later resolved affirmatively,
that finding would itself additionally warrant Class A treatment for
that specific point, not for the upgrade as a whole.

## 19. Recommendation

**Claude recommendation (original, preserved for the record): C —
Defer / remain on current version (`^0.15.0`).**

This was a recommendation for CTO Gate, not authority — **Claude
recommendation ≠ CTO decision** — and CTO Gate has since directed a
different disposition (§19A). The original rationale is preserved
unedited rather than silently removed:

Rationale: no security/correctness defect in 0.15.0 was found; no
capability gap materially blocks anything Sails currently does; the
most consequential finding (continuous-batching concurrency for a
future Guardian layer) is real but UNCONFIRMED for Sails' specific
deployment shape and would need dedicated benchmark evidence an
upgrade-mission, not this review, should produce; the migration cost is
low but non-zero (`@qvac/inference` co-dependency, §15). Deferring
preserves the Goodhart discipline (§27: "we are on latest QVAC" is not
the property) while keeping the door open — nothing found here argues
against a *future*, evidence-gated upgrade once the Guardian
architecture is far enough along to make concurrent-evaluation
throughput an actual, not merely hypothetical, need.

## 19A. CTO Gate Direction (2026-09-07)

**B — Adopt with bounded conditions**, superseding the Claude
recommendation above for the record of this review's disposition.

**Reason, as directed:** the capability delta is relevant to *current*
Sails use, not only a future, not-yet-built Guardian layer. Current
Sails already routes six real capabilities through the shared QVAC
provider (§3: intent-risk assessment, trade-intent generation,
offer-intent generation, social-engineering detection, offer-content
screening, dispute-evidence assessment). Continuous batching, KV-cache
lifecycle bounding, `assessModelFit` preflight, and worker-startup
diagnostics can therefore plausibly improve an *existing* operational
property, not merely a speculative future one — and the empirical
evidence this review found missing (§7/§11: real concurrency benchmark,
runtime compatibility, network/telemetry observation) is exactly what a
bounded upgrade mission exists to produce, not a reason to defer
producing it indefinitely.

**This does not authorize production adoption.** It authorizes a
future, separately-scoped experimental/validation upgrade mission,
gated on the evidence obligations in §7A, with a mandatory rollback
posture (§17 Q10) if that evidence fails to confirm the expected
compatibility/benefit. No Guardian authority expansion, no tool
execution, and no `AgentGrant` change are authorized by this direction
or by the bounded mission it describes (§7A's own closing line).

## 20. If Deferred — Recorded Per §21 (historical — superseded by §19A's Adopt-with-bounded-conditions direction, preserved for the record)

- **Why staying is safe:** §17 Q6 — no vulnerability, EOL, or
  correctness defect identified in `0.15.0`; every capability delta
  found is additive/infrastructural, not a fix for a Sails-relevant
  defect.
- **What capability is being deferred:** primarily the continuous-
  batching concurrency capability (§6B/§7/§11) and the operational
  health checks (`assessModelFit`, worker-startup timeout, KV-cache
  disk bounding, §6A).
- **Future trigger that should reopen review:** (a) Guardian/adaptive-
  risk-layer design work reaching the point where concurrent-evaluation
  throughput across simultaneous trades becomes a real, scheduled
  requirement — at that point a dedicated benchmark against 0.18.0+ is
  the right next evidence step, not a blind upgrade; (b) any future
  security advisory against `0.15.0` specifically (Class A, would
  override this deferral per §8A's own urgency-after-classification
  rule); (c) `0.15.0` reaching an EOL/unsupported state upstream — not
  observed as of this review (still installable, actively-maintained
  package, no deprecation notice found).
- **EOL/security risk of remaining today:** none found in this review's
  evidence — not asserted as zero risk forever, only as not currently
  evidenced.
- **Next review condition:** re-run this Decision Test if any of the
  three triggers above occurs, or under §8A's own periodic-awareness
  cadence (Dependabot's existing weekly discovery) if a future PR is
  classified as Class A/B by that process.

## 21. Sacrifice Check

**Gain (if a future upgrade proceeds on this evidence):** bounded local
disk usage, a pre-flight model-fit check, clearer worker-failure
diagnosis, and a real shot at concurrent Guardian evaluations.
**Sacrifice (corrected, CTO Gate, 2026-09-07):** no source-level Sails
regression is currently indicated by the reviewed API surface (§8) —
this is narrower than "none identified": runtime/native regressions are
**NOT YET DEMONSTRATED either way** and are themselves part of the
bounded upgrade evidence obligation (§7A), not a settled absence.
**Complexity introduced (if adopted):** one new runtime/package
consideration (`@qvac/inference`, whether direct or transitive — §17
Q8) and a version-strategy update — expected minimal, not yet measured.
**Did it earn its place?** Not decided here — that is exactly what
defers to the bounded upgrade mission (§7A) the CTO Gate direction
(§19A) authorizes. **What remains not demonstrated, none silently
dropped:** the concurrency benefit for Sails specifically (§7/§11) —
NOT DEMONSTRATED; the HF-checksum applicability to Sails' model source
(§6C/§9) — UNKNOWN; any native/runtime-relevant behavior change in
`@qvac/inference` (§9) — NOT TESTED.

## 22. Sources

- `npm view @qvac/sdk versions|dist-tags|time --json` — npm registry
  (registry.npmjs.org), queried 2026-09-07.
- `npm view @qvac/sdk@<version> name|version|description|repository|homepage --json`
  for `0.15.0`, `0.18.0`, `0.19.0`, `1.0.0`, `1.1.0`.
- `gh api repos/tetherto/qvac` — GitHub repository metadata, queried
  2026-09-07.
- `gh api repos/tetherto/qvac/releases` and
  `.../releases/tags/sdk-v{0.15.0,0.16.0,0.17.0,0.17.1,0.18.0,0.18.1,0.18.2,0.19.0}`
  — official GitHub Releases, the SDK package's own `repository.url`.
- `package.json`, `package-lock.json`, `node_modules/@qvac/sdk/package.json`
  — this repository, direct local evidence.
- `git log -p -- package.json` — this repository's own history for the
  `@qvac/sdk` dependency line.
- `src/modules/open-agents/qvac-agent.provider.ts`,
  `src/modules/open-agents/social-engineering-agent.ts`,
  `src/common/events/handlers.ts`,
  `src/modules/open-liquidity/liquidity.service.ts`,
  `src/modules/open-settlement/dispute.service.ts` — direct source
  reading for §3/§4/§8/§12/§13.
- `tests/qvac-prompt-injection.test.ts`,
  `tests/qvacAgentProviderAvailability.test.ts`,
  `tests/qvacDisputeEvidence.test.ts`,
  `tests/qvacAutoResolutionHandler.test.ts`,
  `tests/qvacOfferContentRisk.test.ts`,
  `tests/offerContentScreening.test.ts`,
  `tests/socialEngineeringAgent.test.ts`,
  `tests/socialEngineeringDetection.test.ts`,
  `tests/qvacDetectionMetrics.test.ts`,
  `tests/qvacDetectionSharedPopulation.test.ts`,
  `tests/walletAgents.test.ts` — direct test reading for §3/§12.
- `docs/rfcs/RFC-016-qvac-crypto-native-agent-boundary.md`,
  `docs/rfcs/RFC-017-timeline-and-social-engineering-agent.md`,
  `docs/PROJECT_CONTEXT.md` §3, `docs/ENGINEERING_GOVERNANCE.md` §8A —
  existing architecture/policy documents this review builds on, none
  amended by this review.
- `tsconfig.json` — confirmed `moduleResolution: "node"` (§5's
  NodeNext-fix relevance check).

Evidence-status legend used throughout: **UPSTREAM DOCUMENTED** (stated
in an official release note or registry field), **REPOSITORY OBSERVED**
(directly read from this repository's own code/tests/history),
**INFERRED** (a reasoned conclusion from documented facts, explicitly
labeled as such, never presented as demonstrated), **UNKNOWN** (upstream
documentation is insufficient to resolve, not filled in by guessing),
**NOT TESTED** (would require actually installing/exercising the
upgraded SDK, which this review did not do at the time §1-§22 were
written — §23 below is that follow-up pass, per the CTO Gate direction
in §19A).

---

## 23. Bounded Upgrade Runtime Evidence (2026-09-07)

Authorized by `docs/ENGINEERING_GOVERNANCE.md` §8A and this document's
own §19A (CTO Direction B — Adopt with bounded conditions). This
section records the actual, real installation and runtime exercise of
`@qvac/sdk 0.19.0` against this repository, per §7A's 17-item evidence
obligation. **Outcome: a genuine, build-blocking source-compatibility
break was found and reported — per this mission's own explicit
instruction, no runtime source was edited to work around it.** The
dependency change was fully rolled back before this section was
written; `main`'s `package.json`/`package-lock.json` are unaffected by
this mission.

### 23.1 Baseline snapshot (pre-upgrade)

- Declared: `^0.15.0`; Resolved: `0.15.0` (`node_modules/@qvac/sdk/package.json`).
- Node `v26.7.0`, npm `11.19.0`, `win32 x64`.
- `node_modules/@qvac` baseline size: **4.9 GB** (`du -sh`) — the model
  weights and native addons for every modality (LLM, TTS, OCR,
  transcription, diffusion, VLA) `@qvac/sdk` declares, not only the
  LLM path Sails actually uses (§3).
- `package.json`/`package-lock.json` hashed and copied before any
  change (SHA-256 `63887c07...` / `b28a1e86...`) for rollback
  verification (§23.9).
- Baseline `npx tsc --noEmit`: clean.
- Baseline targeted QVAC test suite (11 files): **55/55 pass**.
- Baseline full `npx jest`: 145/178 suites passed (33 failed — the same
  pre-existing pattern already documented for #57/integration tests
  elsewhere in this repository's history; zero QVAC-specific failures).
- Baseline real model load/completion (`loadModel`/`completion`/
  `unloadModel`, Sails' exact call shape, no `modelConfig`): `loadModel`
  18,327 ms (model already cached locally from a prior real load — not
  a fresh download); first `completion()` 5,580 ms; second
  (cached-model) `completion()` 810 ms; both outputs valid,
  schema-constrained JSON. **MEASURED**, one sample each.
- Baseline concurrency (N=1/2/4/8 concurrent `completion()` calls on
  one shared loaded model, no `modelConfig`, matching Sails' real call
  shape exactly): wall-clock **736 / 1319 / 3441 / 6852 ms** — per-request
  timings step up roughly linearly with N in every case (e.g. N=8:
  613, 1414, 2222, 3228, 4132, 5038, 5642, 6852 ms), consistent with
  effective serialization, not parallel batching, under this
  configuration. **MEASURED.**

### 23.2 Target re-verification

`npm view @qvac/sdk dist-tags` re-queried immediately before upgrading:
still `{"latest": "0.19.0"}` — the target had not moved since §1-§22
were written. No STOP triggered.

### 23.3 Upgrade execution

`npm install @qvac/sdk@0.19.0` (workspace root). Result, directly
observed:

- `package.json`'s **only** change: `"@qvac/sdk": "^0.15.0"` →
  `"^0.19.0"`. No other `package.json` line touched.
- Resolved: `@qvac/sdk 0.19.0`.
- **`@qvac/inference` resolved transitively** — `node_modules/@qvac/inference`
  installed at `0.19.0` (8.7 MB) **without Sails declaring it directly**.
  Confirmed via `npm view @qvac/sdk@0.19.0 dependencies`: `@qvac/sdk`
  itself declares `"@qvac/inference": "^0.19.0"` as its own dependency
  — the same mechanism every other `@qvac/*` addon (e.g.
  `@qvac/llm-llamacpp`) already resolves through. **Direct-vs-transitive
  question (§7A item 2) answered empirically: transitive resolution
  works; no direct Sails declaration was needed for installation to
  succeed.** (Whether a direct declaration would still be *advisable*
  for version-pinning clarity is a separate, smaller question not
  resolved here — not required for this mission's KEEP/ROLLBACK
  decision.)
- No `@qvac/inference` entry, and no other new dependency, was added to
  Sails' own `package.json` — per §5's "do not add `@qvac/inference`
  directly unless actual evidence shows Sails requires it," none was
  found requiring it.

### 23.4 Lockfile delta review

`package-lock.json`: 537 insertions / 106 deletions across 46 changed
package entries, all directly enumerated and classified — **zero**
outside the `@qvac/*` / `bare-*` / QVAC-bundled-test-tooling families
(confirmed by a full before/after diff of every `packages` key in the
lockfile, not sampled):

| Change | Classification |
|---|---|
| `@qvac/inference` (new) | RUNTIME ENGINE CHANGE — the new in-process engine (§5/§8 of the original review) |
| `@qvac/asr-ggml`, `@qvac/audiogen-ggml`, `@qvac/fabric` (new) | NEW NATIVE PACKAGE — `@qvac/asr-ggml` matches 0.17.0's own documented "Unified ASR addon" |
| `@qvac/transcription-parakeet`, `@qvac/transcription-whispercpp` (removed) | EXPECTED TRANSITIVE CHANGE — superseded by the unified `@qvac/asr-ggml`, per the same 0.17.0 release note |
| Per-package nested `@qvac/infer-base` copies (was a shared hoisted copy) | EXPECTED TRANSITIVE CHANGE — dependency-resolution/deduplication shift, not a Sails-relevant behavior change |
| `bare-cov`, `bare-cpu-info`, `bare-gpu-info`, `bare-v8-to-istanbul` (new) | NEW NATIVE PACKAGE — `bare-cpu-info`/`bare-gpu-info` match 0.17.0's documented "Worker Resource Collector" |
| `brittle`, `error-stack-parser`, `globbie`, `same-object`, `stackframe`, `test-tmp`, `tmatch`, `picomatch` (new) | IRRELEVANT TRANSITIVE CHURN — upstream's own test/coverage tooling (Bare's `brittle` test runner and its dependents), never reaches Sails' runtime |

No `EXPECTED_TRANSITIVE_CHANGE` outside this list was found. No broad,
unrelated churn appeared — **no STOP triggered under §6**.

`npm audit` immediately after the upgrade: 14 vulnerabilities (6 low, 3
moderate, 5 high), cross-checked by package name against **none** being
`@qvac/*`, `bare-*`, or otherwise introduced by this upgrade — all 14
are pre-existing, unrelated findings (`prisma`, `@smithy/*`/AWS SDK,
`browserify-sign`/`crypto-browserify` polyfills, `mysql2`, `qs`,
`elliptic`, `vite-plugin-node-polyfills`). **No new security-sensitive
vulnerability was introduced by this upgrade.**

### 23.5 Source compatibility — BREAK FOUND, STOP TRIGGERED

`npx tsc --noEmit` after the upgrade:

```
src/modules/open-agents/qvac-agent.provider.ts(49,46): error TS2305:
Module '"@qvac/sdk"' has no exported member 'LLAMA_3_2_1B_INST_Q4_0'.
```

**EXPECTED SOURCE COMPATIBILITY WAS WRONG.** §8 of the original review
(written before this install) concluded "never appears in any release's
Removed Models list" based on reading release-note prose for 0.16.0/
0.17.0 only — it did not directly inspect the 0.19.0 package's own type
declarations, and this is exactly the gap that inspection would have
caught. Investigated precisely, not just reported as broken:

- `node -e "require('@qvac/sdk').LLAMA_3_2_1B_INST_Q4_0"` (runtime,
  compiled JS): **the export genuinely exists** — `typeof` is
  `'object'`, truthy.
- `@qvac/sdk`'s own bundled example file
  (`dist/examples/llamacpp-cache.js`) imports
  `LLAMA_3_2_1B_INST_Q4_0` from `'@qvac/sdk'` the exact same way Sails
  does.
- `grep`-ing every `.d.ts` file under `@qvac/sdk`'s `dist/src/` tree for
  `LLAMA_3_2_1B_INST_Q4_0`/`LLAMA_3_2` returns **nothing** — the
  constant is missing from the package's own TypeScript ambient
  declarations, despite being present, working, and used in the
  package's own official example at runtime.

**Conclusion: this is a real, upstream TypeScript type-declaration gap
in `@qvac/sdk@0.19.0` itself — not a genuine runtime API removal.**
`npm run build` (the root `tsc` invocation) was independently confirmed
to fail on the identical error — a real, demonstrated build break, not
hypothetical.

Per this mission's explicit instruction ("If source changes are
required: STOP before editing runtime source... This mission does not
authorize arbitrary API migration unless explicitly re-opened by
CTO"), **`qvac-agent.provider.ts` was not touched.** No type-only shim,
no local ambient-declaration augmentation, no workaround of any kind
was applied — the finding is reported as-is for CTO disposition.

**SOURCE API MIGRATION INDICATED: real, at the type level (one export
missing from `.d.ts`, though present at runtime). RUNTIME/PACKAGE
MIGRATION: PRESENT (§23.3). RUNTIME BREAKAGE: NONE DEMONSTRATED (the
export works when accessed via `ts-node --transpile-only`, which
bypasses `tsc`'s type-check — see §23.6-23.8, all of which ran
successfully against the real 0.19.0 runtime this way). BUILD
BREAKAGE: DEMONSTRATED (`npx tsc --noEmit` and `npm run build` both
fail identically).**

An empirical, secondary finding: `npx jest` (ts-jest) does **not**
enforce this specific type error for the affected test files —
confirmed by running `tests/qvac-prompt-injection.test.ts` and the full
11-file targeted QVAC suite against the upgraded install: **55/55
pass**, unchanged from baseline. This means the type break is invisible
to the existing test suite and would only surface via `tsc --noEmit`/
`npm run build`/CI's own `build` check — which is exactly the gate this
repository's own branch protection requires green before any merge
(confirmed in every prior CTO Gate this session).

### 23.6 Real model load, structured completion (0.19.0)

Using `ts-node --transpile-only` (bypasses the type-check found in
§23.5; exercises the genuinely-working runtime export) against the
identical script used for the 0.15.0 baseline:

- `loadModel`: 20,938 ms (cached — same already-downloaded model, no
  fresh download exercised in this pass either).
- First `completion()`: 8,827 ms.
- Second (cached-model) `completion()`: 1,104 ms.
- Both outputs valid, schema-constrained JSON, structurally identical
  shape to the 0.15.0 baseline.

**MEASURED, single sample each** — see §23.11 for the performance
comparison and its explicit caveats.

### 23.7 Concurrency / continuous-batching benchmark (0.19.0)

Identical methodology to §23.1's baseline — no `modelConfig`, matching
Sails' real call shape exactly, N=1/2/4/8:

| N | 0.15.0 wall-clock | 0.19.0 wall-clock |
|---|---|---|
| 1 | 736 ms | 949 ms |
| 2 | 1,319 ms | 1,466 ms |
| 4 | 3,441 ms | 3,184 ms |
| 8 | 6,852 ms | 6,435 ms |

Per-request timings for 0.19.0 at N=8: 623, 1242, 1947, 3005, 3972,
4967, 5556, 6434 ms — the same roughly-linear step-up pattern as
0.15.0, not the sub-linear "several calls at once, a new request takes
a free slot" behavior continuous batching's own release note describes.

**CONCLUSION (Benchmark Claim Discipline, §13): DEMONSTRATED — no
material concurrency gain for Sails' actual, unmodified call shape.**
This does not contradict continuous batching's UPSTREAM CLAIM (0.18.0's
release note) — it demonstrates that the capability is not activated by
Sails' current zero-`modelConfig` `loadModel()` call. Whether an
explicit multi-slot `modelConfig` (e.g. `parallel: N`) would unlock a
real gain is **INFERRED as plausible, NOT TESTED** in this mission —
deliberately not benchmarked, since adding a new `modelConfig` field to
a benchmark aimed at answering "does upgrading alone help" would blur
into evaluating a *new capability Sails doesn't use today*, outside
this mission's authorization (§5, §36) and risking exactly the "do not
optimize benchmark code to flatter 0.19.0" pitfall named in §13.

### 23.8 Worker-startup failure, `assessModelFit` (0.19.0)

- **Worker-startup failure:** forcing `QVAC_RPC_INIT_TIMEOUT_MS=1`
  against a real (invalid-source) `loadModel()` call produced a real
  `RPC_INIT_TIMEOUT` error whose `.cause` carried `WORKER_STARTUP_FAILED`
  with `exitCode`, `exitSignal`, and `stderrTail` all genuinely present
  (confirmed programmatically, not inferred from the error message
  alone). **DEMONSTRATED** — 0.19.0's documented worker-startup
  diagnostics (§6A of the original review) work as described.
- **`assessModelFit`:** called against `LLAMA_3_2_1B_INST_Q4_0` with a
  representative workload — returned `"verdict": "likely-fits"` with a
  concrete byte-range estimate, a named estimator version, and an
  explicit list of assumptions (e.g. GPU vs. system-RAM budget
  treatment, KV-cache sizing, mmap eviction behavior). It correctly
  detected this environment's real GPU (an NVIDIA GeForce RTX 4050
  Laptop GPU via Vulkan) and used device-specific calibration
  coefficients. **DEMONSTRATED — the API works, is reliable, and
  returns genuinely actionable information in this environment.** Per
  §14's own instruction, **it was not wired into production source** —
  registered here as a candidate capability for a future,
  separately-authorized mission, left unused for now.

### 23.9 Network / privacy observation

Attempted via OS-level connection listing (`netstat`), no packet
capture tool available in this environment (no `tcpdump`; Windows
`wmic` unavailable in this shell). **Environment limitation, disclosed
rather than glossed over:** this is a shared personal workstation with
substantial ambient background network activity (browser tabs, chat
clients, cloud-sync agents — dozens of unrelated established TLS
connections observed in every snapshot) and PID-to-process correlation
for the spawned QVAC script proved unreliable with the tools available
in this shell (no working `tasklist`/`wmic` PID chain resolution
through the `npx`→`ts-node`→`node` process tree). One connection delta
was observed during a load/completion window (`149.154.175.53`, a
Telegram IP range) but could not be confidently attributed to the QVAC
process specifically rather than an already-running unrelated
background application on this machine.

**Result: UNKNOWN — environment insufficient for reliable per-process
network attribution.** This is explicitly **not** reported as "no
telemetry observed" or "no external communication" — per this mission's
own instruction, that claim is not made without evidence that
genuinely supports it. The HF-checksum-applicability question (§6C/§9
of the original review) remains UNKNOWN for the same underlying reason
(this review did not observe a real Hugging Face download path either
way) and is not resolved by this section.

### 23.10 `@qvac/inference` runtime/native delta

Captured before the rollback (§23.11):

- Resolved version `0.19.0`, package size **8.7 MB** — small; it is a
  JS orchestration/worker-lifecycle layer, not itself a large native
  binary blob. `find -iname "*.node"` inside `@qvac/inference` found
  **zero** native binding files — the actual native GPU/CPU inference
  work continues to live in the unchanged per-modality addon packages
  (`@qvac/llm-llamacpp`, `@qvac/embed-llamacpp`, etc.), consistent with
  "Inference Is the In-Process Engine" being a lifecycle/orchestration
  restructuring, not a new native runtime.
- **Real, disclosed trust-surface finding:** `@qvac/inference`'s own
  declared dependencies include `hyperswarm`, `hyperdrive`, and
  `corestore` — Holepunch/Pears P2P and DHT-capable networking
  libraries. Sails' own `TransportProvider` (Pears) already depends
  directly on `hyperswarm`/`hyperdht` for its own, unrelated purpose;
  this finding is that `@qvac/inference` **also** carries P2P-capable
  networking code as a dependency, despite 0.19.0's own release notes
  stating that the SDK's *public* "Delegated DHT inference" API
  (`startQVACProvider`/`providerPublicKey`) was removed. **This does
  not, by itself, demonstrate that `@qvac/inference` actively uses
  P2P/DHT networking during a normal `loadModel()`/`completion()`
  call** — §23.9's own network observation was inconclusive either way,
  and this section does not fill that gap by inference. Classified:
  **SECURITY-SENSITIVE CHANGE — registered as evidence gap, not
  resolved.** `@qvac/inference`'s other dependencies (`bare-*` runtime
  primitives, `compact-encoding`, `tar-stream`, `semver`,
  `fast-safe-stringify`, `zod`) are unremarkable Bare-ecosystem/
  general-purpose utilities.
- No install/postinstall scripts specific to `@qvac/inference` itself
  were found beyond its own build/test tooling (`tsc`, `brittle-bare`,
  a `check-models`/`update-models` maintenance script) — none of which
  run automatically on a consumer's `npm install` of `@qvac/sdk`
  (they are the addon's own devDependency-tier scripts, not
  `postinstall` hooks).

### 23.11 Supply-chain review

Covered substantively in §23.4 (lockfile classification) and §23.10
(`@qvac/inference`'s own dependency list). No install-script,
postinstall-behavior, new-registry/origin, new-publisher, or
git/tarball-source anomaly was found across the 46 changed package
entries — all resolve from the standard npm registry, all are
published under the `@qvac`/`bare-*`/Holepunch-ecosystem umbrella
already present in this dependency tree at `0.15.0`. **No STOP
triggered under §19.**

### 23.12 Platform / runtime findings

Current Sails runtime (Node `v26.7.0`, `win32 x64`) ran every test in
this section without a platform-specific failure. Not evaluated
(explicitly out of scope, no cross-platform certification performed):
Linux/macOS/mobile behavior. Noted without implementing: `@qvac/inference`
and its addon packages are published per-platform (the earlier `0.15.0`
review's own §15 already found platform-specific native packages in
the dependency tree); a future mobile-wallet-integration review would
need its own platform-specific verification pass, not assumed from
this Windows-only evidence.

### 23.13 Performance regression check

**MEASURED, single-sample-each, explicitly not a statistically rigorous
multi-run benchmark:** single-call latency was **higher** on 0.19.0 than
0.15.0 for both the first (5,580 ms → 8,827 ms) and cached-model second
(810 ms → 1,104 ms) completion, on identical hardware and identical
prompts, run minutes apart. **Reported, not hidden, despite the
neutral-to-favorable concurrency result (§23.7):** this could reflect a
real regression, ordinary inference-timing variance (CPU/GPU thermal
state, background load, model-cache warmth), or a genuine cost of
0.19.0's restructured worker/engine boundary — this section does not
claim which, since a single sample of each cannot distinguish them.
**A material regression is not ruled out; it is also not confirmed** —
registered as a required evidence item for any future upgrade attempt
(a proper multi-run, alternating-order benchmark), not resolved here.

### 23.14 Full test suite (post-upgrade) — confounded, disclosed

A full `npx jest` run immediately after §23.6-23.8's real GPU-accelerated
inference calls showed a materially worse result than baseline (42
failed / 136 passed vs. the 33 failed / 145 passed baseline in §23.1),
including one QVAC-specific failure
(`tests/qvacDetectionSharedPopulation.test.ts`, a plain default-5000ms
Jest timeout on its very first `eventBus.emit()` call — a fully mocked
test that never touches the real upgraded SDK). **Diagnosed with
evidence, not dismissed or hidden:** re-run in isolation immediately
after, `tests/qvacDetectionSharedPopulation.test.ts` passed cleanly
(2/2). Every other newly-slow suite in that run showed durations of
700-900+ seconds — 5-10× slower than this same suite's own historically
observed timing in this repository (including in the 0.15.0 baseline
run performed minutes earlier in this same session) — consistent with
severe, self-inflicted resource contention from the immediately-prior
real, GPU-accelerated model-load/completion/concurrency benchmarking
(§23.6-23.8), not a functional regression in either QVAC version.
**This comparison is explicitly disclosed as confounded, not presented
as a clean pre/post measurement** — the honest, load-bearing evidence
for QVAC-specific regression is the isolated re-run (2/2 pass) plus the
targeted 11-file QVAC suite (55/55 pass, §23.5), both clean.

### 23.15 Rollback verification — DEMONSTRATED

1. Pre-upgrade `package.json`/`package-lock.json` were hashed
   (SHA-256) and copied aside before the upgrade (§23.1).
2. After all evidence above was gathered, both files were restored
   from the saved copies; SHA-256 confirmed **byte-identical** to the
   pre-upgrade originals.
3. `npm install` reconciled `node_modules` against the restored
   lockfile.
4. Resolved `@qvac/sdk` confirmed back to exactly `0.15.0`.
5. `npx tsc --noEmit` confirmed clean again (the build break from
   §23.5 is gone).

**Rollback is real, complete, and proven simple** — a single dependency
line, no schema/migration coupling, no residual state. `main`'s
`package.json`/`package-lock.json` were never modified by this
mission — this repository is returned to CTO in the exact pre-mission
state on those two files.

### 23.16 Protocol authority / semantic stability (re-confirmed against real runtime)

Every real call made in §23.6-23.8 (intent risk assessment, trade-intent
generation, offer-content risk, dispute-evidence assessment — §23.16a
below) produced only a structured advisory output, exactly as §4/§13 of
the original review described from static analysis alone. **Now
REPOSITORY OBSERVED against the real 0.19.0 runtime, not merely
INFERRED from documentation:** no call in this mission granted, used,
or exposed any signing, settlement, `CapabilityGrant`, protocol-finality,
or message-blocking authority. `AgentGrant`/protocol rules were not
touched, queried, or bypassed by any script in this mission. **Preserved
unchanged.**

#### 23.16a Six current Sails QVAC capabilities — real-runtime regression result

Run via `ts-node --transpile-only` against the real installed 0.19.0,
using the actual production classes (`QvacAgentProvider`,
`SocialEngineeringAgent`) with a constructor-injected fake
`TradeRepository` (no real database touched) — not merely the mocked
Jest suite:

| # | Capability | Result | Evidence |
|---|---|---|---|
| 1 | Intent risk assessment | **PASS** | Real call returned `{risk: "high", recommendation: "reject", reasoning: ...}` — valid, schema-constrained |
| 2 | Trade intent generation | **PASS** | Real call returned a structurally valid `GeneratedTradeIntent` |
| 3 | Offer generation | **PASS** | Real call returned a structurally valid `GeneratedOfferIntent` |
| 4 | Social-engineering detection (full `evaluate()` path, incl. F8) | **BLOCKED BY ENVIRONMENT** | `recentMessageContext()`'s real `getTimeline()` call requires a reachable Postgres (`PostgresEventStore` is the real default per F7); this environment has no live Postgres reachable — a pre-existing, well-documented environment limitation unrelated to the QVAC upgrade (confirmed: the failure is `ECONNREFUSED` on the database connection, not a QVAC-SDK error). **The mocked-database version of this exact path (`tests/qvacDetectionSharedPopulation.test.ts`) already passed 55/55 against the real 0.19.0 install — see §23.5/§23.14 — and is the load-bearing F8 regression evidence for this mission.** |
| 5 | Offer-content screening (raw provider call) | **PASS** | Real call returned a structurally valid `SocialEngineeringSignal` |
| 6 | Dispute-evidence assessment | **PASS** | Real call returned a structurally valid `DisputeEvidenceAssessment` |

**F8 regression (via the mocked-database path, since #4's live-database
path was environment-blocked):** `tests/qvacDetectionSharedPopulation.test.ts`
— the one test file that wires the real, unmocked
`social-engineering-agent.ts` through the real, unmocked `handlers.ts`
reaction (mocking only `@qvac/sdk` and the database) — passed 2/2
against the real 0.19.0 install, in isolation (§23.14). This proves
`sails_qvac_detection_invocations_total`/`_failures_total`,
`SUCCESS+CLEAN ≠ SUCCESS+THREAT ≠ DEGRADED`, and `failures ≤ invocations`
all hold against 0.19.0's actual runtime behavior for the mocked-SDK
path. The fully-live (real Postgres + real 0.19.0) path remains
untested — an honest gap, not glossed over, and not itself evidence of
a problem (the same gap exists for `0.15.0` in this environment,
unrelated to this upgrade).

### 23.17 Sacrifice Check (bounded upgrade)

**What did 0.19.0 actually give us?** Demonstrated: real
worker-startup-failure diagnostics with genuine `exitCode`/`exitSignal`/
`stderrTail` detail; a working, reliable `assessModelFit` pre-flight
check that correctly profiles this machine's real GPU. Not demonstrated
as a gain under Sails' current configuration: concurrency (no material
difference from 0.15.0 without an unauthorized `modelConfig` change).

**What did it cost?** A real, build-blocking TypeScript
type-declaration gap for the exact model constant Sails uses — this is
the dispositive cost. A modest, single-sample-measured latency increase
per call (§23.13), not confirmed as material.

**What new runtime trust surface did it add?** `@qvac/inference`
(8.7 MB, no native bindings of its own) as a transitively-resolved
dependency, itself depending on Holepunch's P2P-capable
`hyperswarm`/`hyperdrive`/`corestore` — disclosed as an evidence gap
(§23.10), not resolved.

**What regressed?** The build (`tsc --noEmit`/`npm run build`) —
confirmed, demonstrated, the reason this mission does not recommend
KEEP. Single-call latency — possibly, not confirmed.

**What remains unknown?** Network/telemetry behavior during load and
inference (§23.9); whether the HF-checksum capability applies to
Sails' actual model source (still open from the original review);
whether `@qvac/inference`'s P2P-capable dependencies are ever
exercised in Sails' actual usage pattern; whether a multi-run benchmark
would confirm or refute the single-sample latency finding; whether a
`modelConfig` change would unlock a real concurrency gain (deliberately
not tested, out of this mission's authorization).

**Did the complexity earn its place?** Not decided by this mission —
the build break alone is sufficient reason to defer that question until
it is resolved, per the Recommendation below.

### 23.18 Recommendation (bounded upgrade mission)

**Claude recommendation: C — Rollback to 0.15.0 / Defer.** Already
executed (§23.15) — `main` is unaffected. Not self-authorized; a
recommendation for CTO Gate only.

**Rationale:** every non-build-related finding is neutral-to-favorable
(5 of 6 capabilities demonstrated working correctly against the real
0.19.0 runtime; F8 semantics hold via the mocked-database path; worker-
startup diagnostics and `assessModelFit` are genuine, working
improvements; no unrelated dependency churn; no new security
vulnerability). But `npx tsc --noEmit`/`npm run build` — the exact gate
this repository's own branch protection requires green — **fails**,
demonstrated twice, root-caused precisely to an upstream `@qvac/sdk`
type-declaration gap for `LLAMA_3_2_1B_INST_Q4_0` (a genuine runtime
export, confirmed present and working; only its ambient TypeScript
declaration is missing). This alone is sufficient reason not to keep
0.19.0 as `main`'s declared version today, independent of every other
(largely favorable) finding.

**Narrow re-open trigger, not "wait indefinitely":** re-attempt this
upgrade once either (a) a later `@qvac/sdk` patch release restores the
`LLAMA_3_2_1B_INST_Q4_0` type declaration (checkable via the same
direct `grep`/`tsc` method §23.5 used — do not assume a later version
number alone fixes it), or (b) the CTO explicitly authorizes a minimal,
disclosed type-only compatibility shim (e.g. a local ambient
declaration or type assertion) as a separate, small, reviewable change
— not bundled silently into a future upgrade attempt. If re-attempted,
carry forward this section's remaining open items as required evidence:
a multi-run performance benchmark (§23.13), a reliable
network/telemetry observation with proper PID attribution (§23.9), and
resolution of the `@qvac/inference` P2P-dependency question (§23.10).
