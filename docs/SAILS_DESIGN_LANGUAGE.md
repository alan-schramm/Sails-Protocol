# Sails Design Language — Foundation (2026-09-12)

`DESIGN-LANGUAGE-1`. Institutionalizes the first version of a **reusable
visual/interaction language** shared across every first-party and
opted-in third-party Sails surface. Complementary to, not a replacement
for, `docs/SAILS_MARKET_DESIGN_DIRECTION.md`:

- **`SAILS_MARKET_DESIGN_DIRECTION.md`** — the specific visual direction
  of the **Sails Market** commercial product (its shell decision, its
  copy tone, its default entry point, its own screen-by-screen review).
- **`SAILS_DESIGN_LANGUAGE.md` (this document)** — the visual/
  interaction language reusable **between** Sails Market, Reusable
  Reference Components, the White-label P2P Base, Satsails Wallet where
  appropriate, future first-party Sails apps, and third-party
  compositions that opt into the system. Where the two overlap (e.g.
  §17/§19/§22/§24 of the Market doc), this document is the promoted,
  cross-product version of that material; the Market doc keeps the
  product-specific instantiation and now cross-links back here.

**Design Language ≠ Protocol Semantics.** Nothing in this document
changes `Asset`, `SettlementRail`, `SettlementScope`, `EscrowType`,
Provider Identity, capability maturity, SDK boundaries, or any other
protocol/architecture truth (`docs/PROJECT_CONTEXT.md`, ADR-002). This
is a visual-and-interaction contract layered *on top of* those, never a
redefinition of them.

## 0. North star

Applies the same discipline this repo's architecture already uses, one
layer up:

- **PRODUCT → ARCHITECTURE → IMPLEMENTATION → EVIDENCE.**
- **Stable semantics, replaceable edges** (`docs/PRINCIPLES.md`) — now
  extended explicitly to the visual layer: **brands may vary,
  interaction semantics must not.** A theme can change what a warning
  looks like; it cannot change what counts as a warning, or make a
  warning read as calmer than a success state.
- **Simple, not simplified** — a design language reduces inconsistency,
  it does not reduce expressiveness or force every product into one
  visual skin.
- **Interfaces may multiply; protocol semantics must not** — now:
  **brand customization must not alter economic meaning.** The UI may
  change brand, theme, and visual composition. Risk, authority,
  economic state, and action semantics may never change silently with
  branding.

## 1. Base visual identity — Sails brand

The Sails Market identity (`packages/sails-ui/src/index.css`) is built
from four families: **black / charcoal / dark gray** (surfaces),
**neutral gray** (text, borders, muted content), and **Sails orange**
(`--color-orange` / `--color-orange-accent`, currently `#c2410c` light /
`#f97316` dark-as-accent — both independently WCAG-AA-verified against
their own surfaces). Orange is the **single primary brand/action
accent** — it marks "this is the one thing to notice or act on," not a
universal signifier. It is never repurposed as a semantic-state color
(§2) and never used decoratively as a filler accent across a screen —
overuse dilutes exactly the "one clear signal" property that makes it
work as an active-nav/CTA accent.

## 2. Semantic colors — a separate axis from brand

Semantic state colors exist **independently of brand** and must never
be overridden in a way that destroys their meaning. Current tokens
(`index.css`, `tailwind.config.js`'s `colors.brand.*`):

| Meaning | Token | Tailwind class |
|---|---|---|
| Success / positive completion | `--color-success` | `bg-brand-success`, `text-brand-success` |
| Information / neutral important state | `--color-info` | `bg-brand-info`, `text-brand-info` |
| Attention / warning / pending | `--color-warning` | `bg-brand-warning`, `text-brand-warning` |
| Danger / destructive / failure | `--color-danger` (aliases `--destructive`) | `bg-brand-danger`, `text-brand-danger` |

**Frozen rule:** a white-label theme, a future dark-mode variant, or any
future visual pass may change the *exact hue* of these (e.g. a
colorblind-safe palette variant) but may never **swap their meaning**
(danger reading calmer than success, warning and info becoming
visually indistinguishable) or drop the accompanying icon/text pairing
that carries meaning for colorblind users (§6's accessibility rule —
color is never the only cue). These four are not "branding
alternatives" to be replaced by a tenant's palette; they are meaning.

## 3. Surface system

Formalizes the hierarchy already implemented in `index.css`, now named
explicitly as a system rather than an implicit convention:

| Layer | Token | Role |
|---|---|---|
| `background` | `--color-bg` | Page canvas |
| `surface` | `--color-surface` | Primary content containers (cards, panels, the Sidebar/Topbar) |
| `surface-elevated` | `--color-elevated` | Raised above `surface` — pressed toggles, active toolbar segments, popover/select content |
| `border-subtle` | `--color-border-subtle` | Purely decorative dividers/container edges — tonal separation does the real work |
| `border-functional` | `--color-border` | Real interactive-component boundaries (inputs, buttons with an outline variant) — the WCAG 1.4.11 non-text-contrast-verified hairline; never downgraded to `border-subtle` |
| `overlay` | Radix `Dialog`/`Sheet`/`Popover`'s own backdrop | Modal/drawer/popover scrims |

**Governing rule (added `UI-FOUNDATION-1-VISUAL-CORRECTION`,
reaffirmed here):** prefer **tonal separation + elevation + subtle
borders** over **black boxes with bright white outlines**. A bright,
uniform border on every container was the concrete, CTO-flagged
"wireframe" defect this rule now exists to prevent structurally, not
just patch once. `border-functional` is not deprecated — it is scoped
down to the actual interactive-component case WCAG 1.4.11 protects
(inputs, functional control outlines), never used as the default for
a merely decorative card or row divider.

## 4. Typography system

Named, reusable levels (`index.css`'s `@layer components`, first added
`UI-FOUNDATION-1`), deliberately small — not a full type-scale plugin:

- `.text-page-title` — page-level heading (`Market`, `Entrar`).
- `.text-section-title` — a titled sub-section within a page.
- `.text-label` — small, uppercase, tracking-wide category/field label
  (filter section headers, table column headers, form field labels —
  unified in this mission; previously form labels used an ad-hoc
  `text-xs text-brand-text-muted` pairing instead of this class).
- `.text-metadata` — supporting/secondary detail text.
- `.text-numeric` — tabular numerals for anything scanned as a column
  of numbers (price, amounts).
- **Technical/advanced detail** (new naming, no new class needed): the
  existing pattern of putting technical detail behind an `InfoTooltip`
  (Login's Ed25519 explainer, the AI surface's `BOUNDARY_TEXT`) *is*
  this level — advanced detail stays available, never forced into the
  primary reading path.

No additional type scale is authorized without a demonstrated gap —
these six cover every real level in use today.

## 5. Interaction states

Formalized across every primitive touched this mission
(`button`/`input`/`select`/`switch`/`checkbox`/`.toolbar-chip`):
**default, hover, active/pressed, selected, focus-visible, disabled,
loading, error, success, warning.** Concrete rules:

- **Focus-visible is mandatory on every interactive element** — a real
  gap found and fixed this mission: `.toolbar-chip` (the Asset/Currency/
  PaymentMethod picker triggers) had no focus ring at all before
  `DESIGN-LANGUAGE-1`; it now uses the same `focus-visible:ring-2
  focus-visible:ring-ring` convention every shadcn primitive already
  uses.
- **Color is never the only cue.** Semantic states (§2) always pair
  color with an icon and/or text, never color alone — already true for
  every status badge (`StatusBadges.tsx`) and now for the empty/error
  states (icon + message, not a colored dot).
- **Active navigation must be strong and unambiguous.** For Sails
  Market, orange is the primary active-brand signal (Sidebar's left
  rail + tinted background + orange icon/text; BottomNav's top accent
  bar) — a plain `elevated`-background "gray" active state is
  insufficient (found and corrected `UI-FOUNDATION-1-VISUAL-CORRECTION`).
  A white-label theme may retheme this accent color (§9) but not remove
  the requirement that exactly one destination reads as unambiguously
  active at a time (§ Escopo A, this mission's own nav-matching fix).
- **Selected ≠ hover ≠ active.** A selected filter chip/badge and a
  hovered-but-unselected one must never share the same visual weight —
  already true via `badgeVariants`' `default`/`secondary` split.

## 6. Iconography system

**Evaluated this mission**, not replaced wholesale. Current library:
**Lucide** (`lucide-react`, ~6,100 icons, MIT-licensed, tree-shakeable —
only imported icons ship, already the case here via named imports).

- **Coverage:** excellent for navigation, action, status, empty/loading/
  error, and generic agent/AI iconography (`Bot`, `SearchX`,
  `AlertTriangle`, `ShieldCheck`, etc. — all already in use). **Zero
  coverage** for asset/token brand marks — Lucide ships no
  cryptocurrency logos (confirmed by direct inventory this mission: no
  `Bitcoin`/coin-branded icon exists in the installed version).
- **Decision: keep Lucide** as the base icon set for every category
  *except* asset/token identity. No license, bundle-impact, or
  accessibility concern was found; replacing it would be change without
  evidence, exactly what this mission was told not to do.
- **Icon-category rules:**
  - *Navigation icons* — one per primary destination, paired with a
    text label always visible at `lg+` (never icon-only navigation on
    desktop; icon-only is acceptable only at the collapsed `md`-`lg`
    rail width and on `BottomNav`, both already label-adjacent or
    tooltip-able).
  - *Action icons* — precede the action label (`<KeyRound/> Conectar
    Carteira`), never replace it silently.
  - *Status icons* — always paired with the matching semantic color
    (§2) and text, never color alone.
  - *Asset/token icons* — see §7; explicitly **not** Lucide's job.
  - *Rail/network icons* — not introduced this mission; a real rail is
    currently represented by its label text only (`ASSET_LABELS`,
    e.g. "Bitcoin (Liquid)"). A dedicated rail-icon set is future work,
    not authorized here.
  - *Agent/AI icons* — `Bot` (Lucide), inside a tonal orange-accent
    badge (§9's own visual treatment) — evaluated as sufficient; no
    dedicated agent glyph needed yet.
  - *Security/risk/authority icons* — `ShieldCheck`/`Scale`/`Lock`
    (Lucide) — evaluated as sufficient for current surfaces.
  - *Empty/loading/error* — a Lucide icon (e.g. `SearchX`,
    `AlertTriangle`) + primary message + supporting detail, never an
    icon alone and never bare text alone (§ Escopo A's empty-state
    rule, corrected `UI-FOUNDATION-1-VISUAL-CORRECTION`, re-applied this
    mission).

## 7. Asset / token visual representation

**Visual identity ≠ protocol identity.** No icon, logo, or color
introduced under this section may redefine, alias, or stand in for
`Asset`, `SettlementRail`, or `SettlementScope` (ADR-002) — it is a
*display* affordance only, and the underlying enum value is always
still what is stored/filtered/submitted.

**Strategy adopted (minimal, real, implemented this mission):**
`packages/sails-ui/src/components/ui/AssetIcon.tsx` — a small,
self-contained registry mapping each `AssetType` to a tonal monogram
badge (a 1-2 character glyph, e.g. `₿` for every Bitcoin-family rail,
`U` for USDT/USDC families distinguished by hue, `Ξ` for Ethereum) keyed
off the same `ASSET_SHORT_LABELS` (`lib/labels.ts`) already shown as
text everywhere else. **Why a monogram, not a real logo library:**
adopting a real crypto-icon package sight-unseen would skip exactly the
evaluation this mission requires (license, bundle impact, coverage of
the actual asset list, accessibility) — a real logo library is a future
decision, evaluated on its own before adoption, not implied by this
foundation. The monogram is deliberately swappable: every call site
renders `<AssetIcon asset={...}/>`, so a future real-logo pass changes
one file, not every screen that shows an asset.

**Applied this mission:** `AssetPicker.tsx`'s trigger and dropdown rows
(the one representative usage required as evidence). Not yet applied to
`OfferCard.tsx`, `CurrencyPicker.tsx`, or elsewhere — extending it is
authorized future work, not required by this foundation.

**Pattern rule:** icon/logo is always paired with the asset name/symbol
as text (`icon + name`), never a bare icon substituting for the label —
consistent with §6's "icon never replaces the label" rule and with
accessibility (the icons here are `aria-hidden`; the adjacent text is
the accessible name).

**Color note:** the per-asset accent colors in `AssetIcon.tsx` (Bitcoin-
orange, Tether-teal-ish, Circle-blue, etc.) are a **third color axis**,
separate from brand (§1) and semantic-state (§2) colors — asset
identity, not brand identity and not a risk/state signal. They must
never be reused for UI meaning (e.g. the Bitcoin accent orange must
never be read as "warning" just because it is also orange-family).

## 8. Sails Agent

**`Sails Agent`** is now the product-level identity for AI/agent
assistance across the Sails ecosystem — not a protocol module, not an
OpenAgents scope change, purely a **naming/presentation layer** over
existing, already-real capability. The Marketplace's existing AI
surface (`AgentIntentionPanel.tsx`, previously labeled "AI Negotiator")
is the first concrete **composition** of this identity: **"Sails Agent
— Market Negotiation."** A future agent surface elsewhere in the
product (e.g. a dispute-assistance agent, if one is ever built) would
be a *different* composition of the same "Sails Agent" identity, not a
competing brand name — this is a naming/product-identity pattern, to be
reused, not a one-off rename.

**Renamed this mission** (visible copy only — component name, props,
route, and the underlying real QVAC-backed intent/propose/approve flow
are unchanged): the panel's header, its `aria-label`s, its
authentication-required toast, and its mandate-section heading. **Left
unchanged, deliberately:** the primary CTA microcopy ("Gerar com QVAC",
"QVAC pensando...") — that copy is capability attribution under an
active user action (§10's own allowed case), not this feature's
product-level identity; renaming it was judged a separate, more
visible copy decision than this mission's classification work covers,
and is not required by "Sails Agent" adoption.

**Frozen principle:** **access does not imply economic authority.**
Sails Agent (or any future agent identity) can be granted *access* to
generate intentions, search offers, and present proposals — it can
never be granted the *authority* to move funds, sign, or complete a
trade without the explicit human approval step that already exists
(`handleApprove` — the only route from a QVAC proposal to a real
`Trade`/escrow call). This mirrors, at the product-naming level, the
same boundary `docs/PROJECT_CONTEXT.md` §2E's Security Constraint (item
9) already holds for signer technology: naming something "Agent" must
never read as "Agent can act with economic authority."

## 9. QVAC representation

QVAC is a **capability/technology**, not the product's primary
identity — the identity is "Sails Agent" (§8); QVAC is what currently
powers one composition of it. Recommended visual use, **only when
material**: capability attribution (the existing `InfoTooltip`
boundary text), advanced/technical context, a "Powered by QVAC"-style
diagnostic line (the existing `LLAMA_3_2_1B_INST_Q4_0 · inferência
local` loading-state line), or relevant execution-context detail. **Not
recommended:** a QVAC logo/wordmark repeated across every AI-touched
screen — that would let implementation/provider branding compete with
"Sails Agent" as the thing a user is meant to recognize, exactly what
this rule prevents. **Current state evaluated as already compliant** —
the two existing QVAC mentions (the info-tooltip boundary text, the
diagnostic loading line) already sit in the "advanced/technical
context" and "diagnostic information" buckets this rule allows; no
change was needed or made to QVAC's own visibility this mission.

## 10. White-label theming contract

Formalizes, for the **visual** layer, the same boundary
`docs/PROJECT_CONTEXT.md` §2D item 4 already froze for **functional**
configuration: **configuration selects from a compliant palette; it
never redefines meaning.**

**Customizable by a white-label tenant:**
- Primary brand/action accent color (replaces Sails orange)
- Logo / wordmark
- Typography, within a compatibility-tested font-pairing set
- Corner radius (`--radius`)
- Selected surface tones (within the same light/dark structure)
- Selected spacing/density presets, where justified (§10 of the Market
  doc's existing density system)
- Some brand-specific surfaces (e.g. Login's always-dark brand panel)
- An icon/branding layer on top of the shared iconography (§6)

**Not customizable in a way that would be semantically destructive:**
- Danger / warning / success / informational meaning (§2)
- Risk hierarchy and authority cues
- Funding/signing semantic states (`docs/PROJECT_CONTEXT.md` §2E items
  7/8, once implemented)
- The distinction between an error state and a success state
- Accessibility requirements (contrast minimums, focus visibility,
  touch target size, color-is-never-the-only-cue)
- Economic state meaning

**Goal, stated plainly:** partner A's wallet can be blue, partner B's
can be green, Satsails uses orange — but the same class of risk/state
must stay legible and coherent across all of them. This is not yet
implemented as a runtime theme-switching mechanism (§11) — it is the
**contract** a future implementation must satisfy.

## 11. Token / theme architecture

**Current state (accurate as of this document):** already a
three-layer system, just not previously named as such —

1. **Primitive** — raw `"R G B"` triplet values in `index.css`'s
   `:root`/`:root.dark` blocks (e.g. `--color-orange: 194 65 12`).
2. **Semantic** — named-by-meaning aliases over primitives (`--primary`,
   `--color-success`, `--color-border-subtle`, shadcn's own
   `--background`/`--card`/`--input`/`--ring` slots — all aliased onto
   the primitives above, never a second independent palette).
3. **Component** — Tailwind class names / `@layer components` classes
   consuming the semantic layer (`bg-brand-orange-accent`,
   `.toolbar-chip`, `.text-label`) — never a raw utility color
   (`bg-orange-500`) outside the one documented exception (§7's
   asset-accent registry, itself contained to one file).

**Required, not yet built:** a fourth **brand-token indirection** — a
tenant-swappable layer between semantic and primitive specifically for
`--primary`/`--color-orange*` (so white-label swaps one set of values,
not every component). This mission's authorized scope was foundation +
minimal proof, not this mechanism; it is the concrete next
implementation block (§ Next recommended block, PR body).

**Explicitly avoided:** hardcoded color proliferation, raw utility
colors scattered outside the token system, arbitrary theme-specific
hacks, and a new, heavyweight theme-engine abstraction. Tailwind stays
the styling engine — the requirement is token discipline, not a stack
change.

## 12. Operating-system-style design grammar

Sails Design Language is intended to function the way a design system
inside an operating system does for the apps built on it — **not** to
make every Sails-adjacent app look identical, impose one required
appearance, or erase partner branding. It **is** intended to guarantee:
interaction consistency, predictable navigation, consistent feedback,
consistent state semantics, consistent spacing rhythm, consistent
accessibility behavior, coherent component expectations, and a shared
visual grammar underneath whatever brand sits on top.

**Institutional formulation:** *applications may express different
brands while preserving a shared interaction grammar.*

## 13. Visual references

Each reference has a **specific, bounded role** — principles, never
pixels, brand, or literal layout:

- **Zest Protocol — primary visual refinement reference.** Premium
  financial feel, dark composition, breathing room, hierarchy,
  restrained use of accent.
- **Binance — secondary operational reference.** Dense market
  workflows, filters, tables, operational scanning, multi-control
  toolbar layout (this mission's own toolbar-container/`.toolbar-chip`
  work draws directly from this role).
- **Sovryn — additional visual/system reference (new this mission).**
  Layered dark surfaces, cards, semantic status colors, reducing
  white-outline dependency, readable dark-state composition — the
  same direction as §3's surface-system rule.

## 14. Relationship between product layers

Respects the already-frozen structure (`docs/PROJECT_CONTEXT.md` §2D
item 1), stated here in visual-language terms:

- **Reusable Reference Components (Layer A)** — must stay semantically
  neutral and reusable; no Sails-specific personality baked in (no
  hardcoded orange, no "Sails Agent" naming inside a generic component
  — composition adds that on top).
- **White-label P2P Base (Layer B)** — may theme strongly (§10) without
  redefining economic meaning.
- **Sails Market** — may use the strongest Sails personality: orange
  brand accent as primary active signal, "Sails Agent" identity,
  Sails-specific composition and copy tone. This is where §1/§8's full
  brand expression lives.
- **Satsails Wallet** — may reuse this language and its components
  where it fits, without being forced to visually copy Sails Market —
  a sibling composition, not a derivative (`docs/PROJECT_CONTEXT.md`
  §2D's frozen topology: no forced parenthood between first-party
  products).

## 15. Explicit non-goals of this foundation

This document does **not**: implement `FundingInstruction` or
`SigningRequest` UX, expand OpenLiquidity or OpenAgents protocol scope,
create Private Markets/OTC/Portfolio/notification-backend modules,
introduce a new protocol primitive, change the custody/signer model or
Day-0 settlement scope, or close any capability-maturity backlog item
by virtue of a CSS/UI change. It does not require an ADR — no new
architectural constraint is introduced; this formalizes and names an
existing, already-implemented token/component pattern and extends it
with a small, real proof (checkbox/switch/asset-icon/toolbar
consistency), not a new architecture.

## Closing confirmations

- Design Language ≠ Protocol Semantics — confirmed, no protocol/SDK/
  Core file touched by this document or its accompanying implementation.
- No new product scope, module, or backlog-closure claim is made here.
- `docs/SAILS_MARKET_DESIGN_DIRECTION.md` remains the product-specific
  instantiation; this document is the reusable layer it now explicitly
  cross-links to (§17/§19/§22/§24 there point here for the promoted
  material).
- `docs/PROJECT_CONTEXT.md` §2D item 4 now cross-links here for the
  visual-layer instantiation of its frozen white-label configuration
  boundary — the functional boundary itself is unchanged.
