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
- The `latest` npm dist-tag has stayed on the `0.x` line through 20+
  releases after `1.1.0` and was moved to `0.19.0` today. No `1.x`
  dist-tag or second active tag (other than `dev`, a pre-release
  channel) exists.

**Conclusion:** `1.0.0`/`1.1.0` are legacy artifacts from before the
current repository/package lineage was established under active
maintenance — not the actively-maintained line, not what the
maintainer's own `latest` tag points to, and not a candidate for
"latest relevant stable" in this review. This is UPSTREAM DOCUMENTED
(directly observed from the registry and GitHub API, not inferred) —
**this review treats `0.19.0` as the latest relevant stable version**,
consistent with npm's own authoritative `latest` dist-tag and with the
actively-maintained release cadence. `@qvac/sdk`'s `dev` dist-tag
(`0.2.7-dev.*`, a pre-release channel) is separately noted under §16
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

## 8. Breaking Change Review (per Sails' actual 4-symbol surface)

| Sails API used | 0.19.0 status | Evidence |
|---|---|---|
| `loadModel({modelSrc, onProgress})`, no `modelConfig` | **UNCHANGED** | No breaking-change entry across 0.15.0–0.19.0 touches the bare `{modelSrc, onProgress}` shape when no `modelConfig` object is passed. `no_mmap`→`load_mode` (0.19.0) and `toolsMode` removal (0.18.0) both live inside `modelConfig`, which Sails never sets (confirmed by grep, §3). |
| `completion({modelId, history, stream: false, responseFormat: {json_schema}})` | **UNCHANGED** | No breaking-change entry touches this shape; `emittedTokens`/`generatedTokens` (0.17.0) is an additive `stats` field Sails never reads. |
| `unloadModel({modelId})` | **UNCHANGED** | No breaking-change entry mentions `unloadModel`. |
| `LLAMA_3_2_1B_INST_Q4_0` | **UNCHANGED** | Never appears in any release's "Removed Models" list (0.16.0, 0.17.0). |
| `./worker-core`, `./commands`, `startQVACProvider`, `delegate`, `heartbeat`, `n_discarded`, `toolsMode` | **REMOVED upstream (0.18.0/0.19.0), but never imported by Sails** | Confirmed by repository-wide grep returning zero matches (§3). |

**Result: zero of Sails' 4 actually-used symbols require any code
change to move from 0.15.0 to 0.19.0.** Every breaking change in the
0.16.0–0.19.0 range touches either an unused modality (OCR, TTS,
diffusion, VLA) or an unused configuration surface (`modelConfig.tools`/
`toolsMode`/`no_mmap`, delegated-inference options) Sails' code never
sets. This is the single strongest piece of evidence in this review —
directly demonstrated by grep, not inferred from documentation.

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

## 10. Privacy Review

No evidence found, across the reviewed release notes, of a change to:
where prompts go (still local-only, strengthened by delegated-inference
removal), telemetry, model acquisition beyond the checksum addition
(§6C/§9), caching (beyond the disk-bounding change, §6A), logs, or
metadata exposure. Sails' own content boundaries — trade data, offers,
chat content, risk context, agent goals — all stay on the same
local-only path they already used at 0.15.0. **No privacy improvement
is claimed without evidence** (per the mission's explicit instruction);
none of the reviewed changes plausibly *worsens* privacy either, based
on documented release notes alone.

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
change shape through 0.19.0, an upgrade to 0.19.0 would preserve
`SUCCESS+CLEAN ≠ SUCCESS+THREAT ≠ DEGRADED` exactly as implemented —
**no F8 metric or instrumentation code would need to change** for a
same-shape-call upgrade. The one caveat: if a future upgrade mission
*also* adopted continuous batching's concurrent `completion()` calls
(§7), that would be a genuine new usage pattern, not merely a version
bump — worth re-checking F8's per-item accounting (`failures ≤
invocations`) still holds under real concurrency at that time, not
assumed to hold automatically. **F8 is not changed by this review.**

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
  range — `@qvac/sdk` at 0.19.0 requires `@qvac/inference@^0.19.0`
  installed alongside it (per the release notes' own migration note:
  "Install both at 0.19.0"). This is a real new co-installation
  requirement for any future upgrade mission to account for in its
  `package.json` strategy (§20) — not evaluated for size/binary-count
  impact in this review (out of scope per §15's own "do not conduct a
  giant supply-chain audit").
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
3. **What existing behavior could break?** Nothing in Sails' actual
   4-symbol usage, per §8's direct grep-based analysis. Zero migration
   required for current code.
4. **What trust/security boundary changes?** None found that touch
   Sails' actual usage; delegated-inference removal *strengthens* the
   local-only property upstream (not directly consumed by Sails
   either way). HF checksum applicability to Sails' model source is
   UNKNOWN, not resolved by this review.
5. **What API/semantic assumptions change?** None for Sails' 4 used
   symbols (§8). `@qvac/inference` becomes a required co-dependency at
   0.19.0 — a packaging assumption, not a semantic one.
6. **Can Sails safely remain on the current version?** Yes — 0.15.0
   is still installable, still functions exactly as reviewed, and
   nothing in the delta reviewed here identifies a security
   vulnerability, EOL status, or correctness defect in 0.15.0 itself
   that would make remaining unsafe.
7. **What evidence is required before adoption?** A real,
   post-upgrade install-and-test pass confirming §8's grep-based
   compatibility claim empirically (not just statically); a real
   concurrent-completion benchmark to confirm or refute the Guardian
   concurrency hypothesis (§7/§11); resolution of the HF-checksum
   applicability UNKNOWN (§6C/§9); a real full-suite + F8-targeted test
   run against the upgraded SDK.
8. **What migration cost/complexity is introduced?** Low for a
   same-shape upgrade (no source-code migration required per §8) —
   the main cost is the new `@qvac/inference` co-dependency addition
   (§15) and validation effort (§7 above), not code rewrites.
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
Guardian concurrency capability). **Secondary consequence noted, not a
separate classification: none of the reviewed changes touch a
security-sensitive property in Sails' actual usage** (§9's own
conclusion) — so the Security-Sensitive Rule's heightened evidence bar
does not currently apply beyond what this review already performed;
if the HF-checksum-applicability UNKNOWN (§6C) is later resolved
affirmatively, that finding would itself warrant Class A treatment for
that specific point, not for the upgrade as a whole (Classification ≠
Consequence, §8A).

## 19. Recommendation

**C — Defer / remain on current version (`^0.15.0`).**

This is a recommendation for CTO Gate, not authority — **Claude
recommendation ≠ CTO decision.**

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

## 20. If Deferred — Recorded Per §21

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
**Sacrifice:** none identified — no Sails capability regresses per §8's
direct compatibility analysis. **Complexity introduced (if adopted):**
one new co-dependency (`@qvac/inference`) and a version-strategy update
— genuinely minimal. **Did it earn its place?** Not decided here —
that is exactly what defers to a future, evidence-gated Decision Test
once the Guardian concurrency question has real answers. **What remains
not demonstrated:** the concurrency benefit for Sails specifically
(§7/§11), the HF-checksum applicability to Sails' model source (§6C/§9),
and any native-layer security-relevant behavior change in
`@qvac/inference` (§9) — all explicitly named, none silently dropped.

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
upgraded SDK, which this review did not do).
