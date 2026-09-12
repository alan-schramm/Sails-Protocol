# Sails Market — Visual System & UX Direction (2026-09-12)

**Status: Design Direction, not frozen visual specification. No code,
CSS, tokens, or component changed by this document.** Origin:
`UI-DIRECTION-1`, following `PRODUCT-DIRECTION-FREEZE-1`'s frozen
three-layer product model (`docs/PROJECT_CONTEXT.md` §2D). Visual
language, navigation, and component-library direction remain
**explicitly OPEN** per that freeze (§2D item 10) — this document
proposes a direction for CTO decision, it does not itself freeze one.
Nothing here authorizes implementation.

**Baseline:** `main @ 614c591e7f80217448eaa898054a883e09becf01`.

**Sources/code inspected:** `packages/sails-ui/src/lib/labels.ts`,
`packages/sails-ui/src/components/{ui,layout,trade,marketplace,chat,onboarding}/*`,
`packages/sails-ui/src/App.tsx` (routing), `packages/sails-ui/README.md`
(real-vs-mock disclosure, prior UX-bug fixes), `docs/PROJECT_CONTEXT.md`
§2D (frozen product layers), `docs/BACKLOG.md` item 22 (FundingRequest/
SigningRequest gap). This document does not re-derive the Layer A/B/C
model — it assumes it as given.

**Reusable-layer counterpart (`DESIGN-LANGUAGE-1`, 2026-09-12):**
`docs/SAILS_DESIGN_LANGUAGE.md` promotes this document's §17 (white-
label visual boundary), §19 (component-library verdict), §22 (design
tokens), and §24 (design-system sharing model) into a formal,
cross-product design language — this document stays the Sails-Market-
specific instantiation of that language; where the two could be read as
duplicating each other, the Design Language doc is the reusable
source of truth and this document narrows it to Sails Market.

---

## 1. Reference interpretation (principles, not pixels)

**Zest Protocol (primary):** premium dark financial feel, card rhythm,
restrained spacing, clean hierarchy, strong action emphasis, serious
product tone. Extracted principles: generous but not wasteful
whitespace; one clear primary action per screen state; typography does
the hierarchy work, not color noise; dark surfaces differentiated by
subtle elevation, not borders-everywhere.

**Binance (secondary):** information density, market/operational
organization, filters, tables, multi-panel workflows, high-frequency
status visibility. Extracted principles: numeric alignment and
scanability in tables; filters as a first-class, always-visible
affordance in market views; status is never decorative — every badge
maps to an operational state.

Neither is copied literally. No neon, no glassmorphism-heavy chrome,
no yellow-on-black (Binance's own accent), no DeFi-toy iconography.

## 2. Visual character (proposed, not frozen)

Dark premium base; **Sails orange** (`--color-orange`, `#f97316` —
already the one constant across both themes per the existing
`packages/sails-ui` design system) is **the sole primary brand/action
accent** — **corrected (2026-09-12, `UI-DIRECTION-1-CORRECTION`):**
this does not mean orange is the only color in the system. The
semantic state colors (`success`/`warning`/`danger`/`info`, §3) are
preserved and required (§13's "never color alone" rule depends on
them existing as real, distinct colors) — **semantic state colors are
not competing brand accents**; they communicate state, orange
communicates "this is the primary action," and the two never overlap
in meaning; high-contrast typography; subtle 1px borders, never heavy
strokes; restrained corner radius (small-to-medium, never full-pill
except on true pills — status chips, tags); minimal decorative
gradients (a single subtle background gradient at most, never
per-card); no blur/glass; strong data legibility as the top visual
priority; a tone credible for P2P trading, settlement, liquidity, OTC,
private markets, and agents alike — never a marketing-landing-page
feel bleeding into operational screens.

## 3. Dark-first / light-ready — recommended, compatible with the frozen freeze

**Sails Market defaults to dark mode.** The design system uses semantic
tokens so light mode requires no component rewrites, and white-label
deployments may choose either default. Proposed semantic token
categories (names only — no values, no code, per this mission's scope):

`background`, `surface`, `surface-elevated`, `border`, `border-subtle`,
`text-primary`, `text-secondary`, `text-muted`, `accent`,
`accent-hover`, `accent-contrast`, `success`, `warning`, `danger`,
`info`, `focus`, `disabled`. No component may hardcode a raw color —
every visual semantic resolves through one of these.

## 4. AI-UI anti-pattern list — explicit "do not do"

- Identical card grids with no information hierarchy (every card same
  size/weight regardless of importance).
- Random decorative gradient blobs behind content.
- Excessive glassmorphism/backdrop-blur as a default surface treatment.
- Oversized hero sections inside operational screens (Trade, Escrow,
  Dispute — these are task screens, not landing pages).
- Decorative charts with no operational meaning (a sparkline that maps
  to nothing real).
- Excessive rounded-corner radius on every element uniformly.
- "Icon-per-line syndrome" — an icon prefixing every list row whether
  or not it adds information.
- Too many pills/badges competing for attention on one row.
- Over-centered layouts on data-dense operational screens.
- Repetitive "feature card" composition (three identical cards
  describing benefits) inside a working product, not a marketing page.
- Fake/illustrative metrics presented as if real (already a named,
  disclosed limitation for `AMOUNT_PRESETS`/`ILLUSTRATIVE_FX_TO_USD` —
  must never read as authoritative in the visual design either).
- Visual density with no task hierarchy (everything the same visual
  weight).
- Arbitrary/unmotivated drop shadows.
- Unnecessary motion (anything that moves without communicating a state
  change).
- Every action rendered as a large primary button — action weight must
  reflect action consequence (§12, §14).

## 5. Information hierarchy (operational screens)

1. Context — what trade/offer/dispute this is.
2. Current economic state — status, amount, asset/rail.
3. Required user action — the one thing the user must do next, if any.
4. Risk/authority implications — what committing to the action means.
5. Supporting information — timing, fees, counterparty, history.
6. Technical detail on demand — never default-visible.

Normal users never need to understand `EscrowType`, the Provider
registry, adapter identity, internal routing, or implementation class
names (already true of the current UI — verified in this mission
chain's own prior audit, `REFERENCE-UI-REALITY-1`) — this hierarchy
preserves that, it does not newly establish it.

## 6. Progressive disclosure — three depths

- **Primary:** what is happening, amount, asset/rail, counterparty,
  action required, current state.
- **Secondary:** timing, fees, settlement details, evidence/status
  history, policy/dispute context.
- **Advanced:** signer details, provider/implementation details,
  technical evidence, raw state identifiers, diagnostics — behind an
  explicit "Detalhes técnicos" disclosure, never default-visible,
  matching `PRODUCT-DIRECTION-FREEZE-1`'s own progressive-disclosure
  principle (§2D item 7's "access does not imply authority" extended to
  *visibility* does not imply necessity).

## 7. Navigation / shell and default entry point — OPEN, two separate decisions

**Corrected (2026-09-12, `UI-DIRECTION-1-CORRECTION`): shell pattern and
default entry point are two separate decisions, evaluated
independently below** — the prior version of this section conflated
them and leaned too heavily on the current UI and historical
marketplace precedent rather than evaluating fresh against full future
scope. Neither decision is frozen by this document (§2D item 10).
Evaluated against the full future Sails Market scope: OpenP2P,
OpenLiquidity, OpenAgents, OTC, Private Markets, Activity, Portfolio/
Positions, Identity/Reputation, Settings, and future modules.

### 7a. Shell pattern

| Option | Tradeoffs against full future scope |
|---|---|
| **Left sidebar (recommended)** | Scales cleanly to a growing module list (OpenP2P, OpenLiquidity, OpenAgents, OTC, Private Markets, Activity, Portfolio, Identity, Settings each map to one sidebar section) without a top row ever becoming crowded. Costs horizontal width on smaller desktop viewports; needs a collapse/rail state to stay worthwhile below ~1280px. |
| **Top navigation only** | Works today at 9 screens (current `TopNav`/`BottomNav`). Would need a mega-menu or horizontal scroll once module count exceeds ~5-6 top-level items — a real, foreseeable scaling risk once OTC/Private Markets/Agents/Portfolio all need first-class entries simultaneously, not a defect today. Lowest implementation cost if module growth stays slow. |
| **Hybrid sidebar + topbar** | Sidebar carries module-level navigation; topbar carries session/identity/theme/notifications/search — separates "where am I in the product" from "who am I / what do I need right now." Slightly more surface to design and maintain than either pure option, but avoids overloading either nav with two different jobs. |

**Recommended: hybrid sidebar + topbar** — it is the only option that
doesn't force module navigation and session/identity concerns to share
one nav surface, which is the actual scaling constraint once the module
count in scope is realistic (9+ named surfaces). **Viable alternative:
top navigation only**, if module growth is deliberately staged slowly
enough that a mega-menu is never required — a legitimate, lower-cost
choice, not an inferior one, if that pacing is the actual product plan.
Pure left-sidebar-with-no-topbar was evaluated and set aside only
because it has no natural home for session/identity/theme without
either cluttering the sidebar itself or duplicating the hybrid model
without its benefit.

### 7b. Default entry point

**Corrected: market-first is a candidate default, not inherited
truth.** The prior version over-relied on this codebase's own historical
P2P-precedent research (Binance/Bisq/HodlHodl), performed before this
product-layering freeze existed and before Sails Market's fuller module
scope (OTC, Private Markets, Agents, Portfolio) was itself frozen —
that research answered "what should a P2P marketplace open into," not
"what should Sails Market, a multi-module economic coordination
product, open into." Four candidates evaluated on their own terms:

| Candidate | Tradeoffs |
|---|---|
| **Market** | Immediate, concrete value for a new or occasional user; the P2P precedent still applies as one input, not the deciding one. Weak for a returning user with active trades/positions elsewhere. |
| **Overview** | A dashboard-style summary answers "what needs my attention" first — best for a returning, multi-module user. Weak/empty for a first-time user with nothing yet to summarize. |
| **Portfolio** | Strongest for an active trader once OTC/Positions exist; too narrow as a *default* before those modules ship, since a new user has no portfolio yet. |
| **Contextual last-used workspace** | Best per-user experience once returning-user data exists; the weakest *default-for-new-users* case, and adds real state/personalization cost before any module beyond OpenP2P exists. |

**Recommended: Market**, specifically because it is the only candidate
that works correctly for a first-time user *today*, with the other
three explicitly named as the right defaults to revisit once Portfolio/
Activity/multi-module usage data exists to justify them — this is a
staged recommendation, not a permanent one. **Viable alternative:
Overview**, if Sails Market's initial launch scope already includes
enough cross-module state (multiple active trades, OTC positions) that
a first-time user is unlikely in practice. **Market-first status:
explicitly a candidate default pending CTO Gate, not frozen, not
inherited authority from prior research** — corrected per this
mission's own instruction.

## 8. Responsive strategy

- **Navigation:** sidebar collapses to the existing `BottomNav` pattern
  on mobile (already built, already tested for a login/wallet indicator
  gap — reuse, don't reinvent).
- **Data tables:** collapse to a card-per-row representation on mobile,
  never a horizontally-scrolling table as the sole mobile answer —
  preserve column *priority* (asset/rail/amount/status always visible;
  everything else behind a row expand).
- **Trade detail:** on mobile, funding/signing/status becomes the top
  of the screen (the "required action"), chat/history become a
  secondary tab — not a single long scroll mixing both.
- **Action persistence:** the primary required action (sign, fund
  confirmation, release) stays pinned (sticky footer) on mobile so
  scrolling chat/history never hides it.
- **Bottom sheets/drawers:** used for funding instructions, signing
  confirmation, and filters on mobile — not full-screen page
  navigations for transient tasks.
- **Status visibility:** state badge always visible in the trade header
  regardless of scroll position (sticky), on both desktop and mobile.
- **Touch targets:** minimum 44×44px for any action control, including
  table row actions and status chips that are also tap targets.
- **Critical actions:** never placed where an accidental scroll-tap
  could trigger them (e.g., never directly below a chat input on
  mobile).

## 9. Typography (rules, not a final font)

- **Display:** used only on true landing/marketing surfaces, never
  inside operational screens (anti-pattern §4).
- **Page title:** one per screen, moderate size — identifies the
  screen, not decorative.
- **Section title:** smaller, used to separate operational blocks
  (Funding, Signing, History) within one screen.
- **Body:** the default reading size for descriptions, chat, notes.
- **Metadata:** smaller, muted-color, for timestamps/IDs/secondary
  facts.
- **Mono/numeric:** a monospace or tabular-numeral face for amounts,
  addresses, hashes, and any table column of numbers — **tabular
  numerals required** wherever amounts are compared vertically (already
  partially present via `formatByCurrency`, should extend to the visual
  font-feature level).
- **Labels:** compact, often uppercase/letter-spaced, for form field
  labels and table headers.
- **Compact table text:** smaller than body, still legible at the
  "data-dense" density level (§10).

Oversized typography is explicitly avoided in operational screens —
reserved for the rare true landing-style surface only.

## 10. Spacing / density system

Target: **more refined than Binance, denser than a typical SaaS
dashboard, calmer than an exchange terminal.** Three density levels:

- **Comfortable** — default for Trade detail, Dispute, onboarding —
  screens where a user reads carefully and makes one decision.
- **Compact** — default for Profile/History/Active Trades lists.
- **Data-dense** — available for Marketplace/market list views and
  future OTC/Private Markets order-book-style surfaces, opt-in per
  view, never forced on first-time users.

Density is a token-driven spacing-scale switch, not a separate
component set — one component, multiple density tokens.

## 11. Card system

- **Summary card** — one key fact + a few metadata lines (e.g. an
  offer's headline terms).
- **Action card** — contains the one required action for the current
  state (funding, signing, release).
- **Market card** — `OfferCard`-equivalent, optimized for grid scanning.
- **Status card** — pure state display, no action.
- **Risk/warning card** — visually distinct treatment (color + icon +
  copy), reserved for genuine risk signals (RFC-017 social-engineering
  warnings, dispute deadlines) — never reused for routine information.
- **Trade/offer card** — the existing `TradeCard`/`OfferCard` pattern.
- **Technical-detail card** — the Advanced-disclosure (§6) container.

Not every block should be a card — use **sections** for grouped
content within one screen, **dividers** for lightweight separation,
**tables** for repeated structured rows, **inline rows** for a single
key/value fact, **panels** for a persistent side area (e.g. chat).
Overusing cards for everything is itself an anti-pattern (§4).

## 12. Tables / market data

- **Column hierarchy:** asset/rail and amount always leftmost/most
  prominent; status always present; secondary facts (payment method,
  counterparty reputation) follow; actions rightmost.
- **Numeric alignment:** right-aligned, tabular numerals (§9).
- **Sorting/filtering:** filters always visible above the table in
  market views (Binance-inspired), never hidden behind a menu for the
  primary filter dimensions (asset, side, currency).
- **Responsive collapse:** per §8.
- **Status representation:** color + text label together, never color
  alone (§13).
- **Row actions:** icon-button, revealed on hover on desktop, always
  visible on touch.
- **Pagination/infinite:** paginate for operational lists (trades,
  disputes — a user needs a stable, referenceable page); infinite
  scroll acceptable for market discovery browsing only.
- **Empty states:** always a specific, actionable message (e.g. "Nenhum
  trade ativo — publique uma oferta" with a CTA), never a bare "no
  data."
- **Skeleton/loading states:** row-shaped skeletons matching real
  column layout, not a generic spinner, for any table taking >200ms.

## 13. Status / state language

Full state set: pending, action required, waiting counterparty,
awaiting funding, funding detected, signing required, partially signed,
settlement pending, completed, disputed, failed, expired, cancelled.
**Every state pairs a semantic color token (§3) with an explicit text
label — never color alone**, satisfying accessibility (§20) and this
mission's own explicit instruction. A consistent icon per state family
(neutral/waiting, action-required, success, danger) reinforces without
replacing the text.

## 14. Funding UX direction (design only, not implemented)

**Generic model: Funding Instruction**, not "address" — because not
every rail uses one. A `FundingInstruction` communicates: asset/rail
being funded; destination/instruction (address for MULTISIG/
LIGHTNING_HODL, or a rail-specific equivalent instruction for a future
non-address-based rail); amount; confirmation expectations (e.g.
"1 confirmação necessária" for MULTISIG, matching the real
`MULTISIG_FUNDING_REQUIRED_CONFIRMATIONS` default); current detected
state (from the evidence ladder already proven in this mission chain:
none detected / detected, awaiting confirmation / confirmed); what
happens next; what the user must not do (e.g. never send from an
exchange withdrawal that can't originate the exact amount); and
failure/retry guidance. **Closes, at the design level, the exact proven
gap** (`docs/BACKLOG.md` item 22): BTC MULTISIG's `escrow.multisigAddr`
existing backend-side but unrendered. The same component must remain
generic enough for LIGHTNING_HODL/SAFE_GUARD_EVM's own rail-appropriate
instructions once each is independently validated (per the backlog
item's own corrected scope).

## 15. Signing UX direction (design only, not implemented)

Must visually support all four authorization shapes from `PRODUCT-DIRECTION-FREEZE-1`
§2D item 6 (explicit / delegated / automatic under prior authority /
batched) **without presenting every signature as requiring a manual
click** when authority already permits automation. The UI's obligation
is **observability**, not always **interactivity**: a visible,
timestamped state transition ("Sua assinatura foi enviada
automaticamente" vs. "Assinatura necessária — [Assinar]") satisfies the
frozen principle either way. This directly replaces today's silent
`useEscrowKey.ts` background execution (no visible step at all) with a
state the user can always see, whether or not it required their click.

## 16. Dispute UX direction (design only, not implemented)

A serious economic state-transition surface, not a support-ticket
aesthetic. Must clearly separate: evidence (submitted items, who
submitted, when); state (open/under-review/ruled/appealed); participants
(buyer/seller/arbiter, roles labeled); arbitrator role (visibly distinct
from a "support agent" — this is an economic ruling, not a help-desk
reply); available actions (submit evidence, contest, appeal) gated to
the actual party who may take them; deadlines/time sensitivity
(countdown, not just a date); final ruling (its own distinct, permanent
visual state, not folded into the activity feed). No chat-bubble
styling for ruling content — rulings render as structured, dated
records.

## 17. White-label visual boundary

Configurable: logo, brand name, accent color, light/dark default,
typography within a compatibility-tested font-pairing set, radius/
density within supported presets, optional module visibility,
empty-state illustrations (if any), legal/footer content. **Must never**
let tenant styling damage accessibility contrast minimums, state
semantics (§13's color+text pairing), critical warning visibility,
economic meaning, or funding/signing clarity (§14/§15) — these are
protected token/behavior contracts, not stylable surfaces. Matches and
extends `PRODUCT-DIRECTION-FREEZE-1` §2D item 4's existing
configuration-boundary principle to the visual layer specifically.
**Formalized cross-product (`DESIGN-LANGUAGE-1`):** the full
customizable/non-customizable contract now lives in
`docs/SAILS_DESIGN_LANGUAGE.md` §10 — this paragraph is its Sails-
Market-specific summary, not a second independent definition.

## 18. Sails Market differentiation boundary

Sails Market may own, above the reusable/reference layer: a branded
shell, richer navigation (§7's sidebar model, once decided), product-
specific dashboards, multi-module composition, premium market views,
analytics, advanced coordination surfaces, first-party editorial/copy
tone, richer portfolio/activity views. **None of this is pushed down
into Layer A Reference Components** — a Reference Component stays
generic; Sails Market composes multiple generic components into a
richer, opinionated screen. This mirrors `PRODUCT-DIRECTION-FREEZE-1`'s
own Layer A/C boundary applied at the UI-composition level.

## 19. Existing component-library verdict

**Iconography counterpart (`DESIGN-LANGUAGE-1`):** the same "retain by
default, evaluate before replacing" discipline applied here to shadcn
primitives is now applied to Lucide (icons) in
`docs/SAILS_DESIGN_LANGUAGE.md` §6 — same principle, one level down.

**Corrected rule (2026-09-12, `UI-DIRECTION-1-CORRECTION`):** the prior
version asserted universal retention of every shadcn primitive without
evidence. Corrected principle: **retain existing primitives by
default; restyle through tokens; replace only where a concrete
accessibility, interaction, density, responsiveness, or product-fit
limitation is demonstrated** — retention is a default, not an
absolute, and evidence (not the fact that shadcn is already installed)
is what would justify replacing any specific component.

`packages/sails-ui`'s shadcn-based primitives (`button`/`card`/`badge`/
`input`/`dialog`/`sheet`/`select`/`popover`/`switch`/`textarea`/
`tooltip`) and the trade/marketplace/chat component folders
(`TradeCard`, `EscrowCountdown`, `EscrowStateMachine`, `EscrowActions`,
`TradeParties`, `TradeDisputePanel`, `OfferCard`, `AssetPicker`,
`CurrencyPicker`, `PaymentMethodPicker`, `ChatWindow`/`ChatMessage`) are
classified, per component:

- **Retain:** `dialog`, `sheet`, `popover`, `tooltip`, `switch` —
  Radix-based interaction primitives with no accessibility or
  interaction concern found in this pass.
- **Retain/restyle:** `button`, `card`, `badge`, `input`, `select`,
  `textarea` — sound structurally, but their visual treatment (color,
  radius, density) is exactly what the semantic token system (§3, §22)
  should drive once it exists; no structural change expected.
- **Extend:** `TradeCard`, `EscrowStateMachine`, `OfferCard` — real,
  reusable shapes that need new variants (density, the new status
  language of §13) rather than replacement.
- **Candidate for replacement if evidence emerges:** none identified
  with concrete evidence in this pass. The most likely future
  candidates, named for future review rather than replaced now, are
  `select`/`popover` in a future **data-dense** (§10) market/table
  context, where a native or denser-purpose-built control might
  outperform Radix's default sizing — no such limitation has actually
  been demonstrated yet, so no replacement is recommended today. shadcn
  is treated as an implementation asset (already frozen, §2D item 11),
  never product strategy.

## 20. Motion principles

Subtle, informative, state-driven, fast, never decorative-first. Good:
a brief confirmation animation on a state transition (funding detected,
signature submitted); a panel/drawer sliding in with clear origin;
a loading-progression indicator that reflects real steps, not a
generic spinner; a smooth reorder/filter response in a table. Avoid:
floating decorative elements, parallax, spring-heavy "bouncy" motion,
continuous/looping animation with no state meaning. Every motion must
answer "what changed," never exist purely for polish.

## 21. Accessibility

Minimum standard: WCAG AA contrast for all text/background token pairs
(including in every white-label theme — enforced at the token level,
§17); full keyboard navigation for every interactive element; a always-
visible focus ring (never `outline: none` without a token-driven
replacement); state meaning never conveyed by color alone (§13);
`prefers-reduced-motion` respected for all motion (§20); semantic
ARIA labels on icon-only controls; minimum 44×44px touch targets
(§8); compact density modes (§10) remain readable — density reduces
whitespace, never text size below an accessible minimum. Accessibility
rules are frozen as shared (§23), surviving white-label theming by
construction (tenant config cannot override contrast/focus/motion
rules, only colors within a compliant palette).

## 22. Design tokens (families, not values — no implementation)

Color, surface, border, typography (family/size/weight/line-height
scale), spacing, radius, shadow (used sparingly, per §4/§20), z-index
(a defined stacking scale — dropdown < popover < dialog < toast),
motion (duration/easing scale), density (the comfortable/compact/
data-dense multiplier from §10). Proposed structure: three layers —
primitive (raw values) → semantic (§3's categories) → component
(component-specific aliases of semantic tokens) — the same pattern
already implied by the existing `--color-orange` custom-property
system, formalized. **Formalized cross-product (`DESIGN-LANGUAGE-1`):**
`docs/SAILS_DESIGN_LANGUAGE.md` §11 names this same primitive →
semantic → component structure as already-implemented (not merely
proposed) and identifies the one missing piece — a tenant-swappable
brand-token indirection — as the concrete next implementation block.

## 23. Page archetype system

Overview/dashboard, market/list, asset/market detail, offer detail,
trade detail, funding/signing flow, dispute flow, activity/history,
settings/configuration, advanced module workspace (for OTC/Private
Markets/Agents). Each archetype defines its own information-hierarchy
application (§5) and density default (§10) once, reused by every screen
of that type — this is what gives future modules (OpenLiquidity, OTC,
Private Markets) a coherent feel without redesigning per module.

## 24. Design-system sharing model

- **Shared** (Layer A, all products): semantic tokens, primitives,
  Reference Components, state language (§13), accessibility rules
  (§21), spacing/density rules (§10).
- **Sails Market-specific** (Layer C): brand shell, information
  architecture (§7's chosen shell), multi-module navigation, commercial
  copy, advanced analytics/composition, selected visual refinements
  beyond the shared baseline.
- **White-label configurable** (Layer B, per §17): allowed visual
  identity variables, enabled modules, theme preference, selected
  density presets.

**Formalized cross-product (`DESIGN-LANGUAGE-1`):**
`docs/SAILS_DESIGN_LANGUAGE.md` §14 restates this same three-way split
in visual-language terms and adds Satsails Wallet explicitly as a
fourth sibling that may reuse the shared layer without being forced to
visually copy Sails Market.

## 25. Screen design review checklist

For every implemented screen, before considering it done: product
truth preserved? action hierarchy clear? does the user know the current
economic state? is asset/rail understandable without jargon? is
material authority visible? is funding/signing unambiguous? no internal
implementation leak (`EscrowType`/provider/adapter names)? reusable
semantics preserved (could this screen's components work in a
white-label deployment unmodified)? does it look intentionally
designed? does it avoid the anti-patterns in §4? is it responsive
(§8)? is it accessible (§21)? is it white-label-safe (§17)? is Sails
Market's differentiation preserved where appropriate (§18) without
leaking into Layer A?

## 26. Available UI/frontend skill

**Recommended: `ui-ux-pro-max`** — directly matches `packages/sails-ui`'s
real stack (React, Tailwind, shadcn/ui already in use), covers dark
mode, accessibility, and 99 UX guidelines plus component/chart patterns
across exactly the stacks this codebase uses. Recommended use: the
*next*, separately-authorized implementation mission, once a shell
(§7) and token system (§22) are CTO-approved — not this mission, per
its own "do not use if implementation is not required" instruction.
**Secondary/complementary: `ckmdesign-system`** (three-layer
primitive→semantic→component token architecture) — matches §22's
proposed token structure closely; useful specifically for the token-
implementation phase. **Not recommended for this codebase:**
`ckmui-styling`/`ckmdesign`/`ckmbanner-design` — oriented more toward
marketing/brand-asset generation (logos, banners, social creative) than
an operational financial product's component system.

## 27. Institutional delta

- **Design Direction (this document):** the visual character, anti-
  pattern list, information hierarchy, progressive disclosure model,
  responsive/typography/spacing/card/table/status/motion/accessibility
  principles (§1-§6, §8-§13, §17-§25).
- **UX Guideline (future, extracted from this document once approved):**
  the screen review checklist (§25) as a standing, enforced checklist
  for every future screen.
- **Design System rule (future, once tokens are implemented):** the
  token family/layer structure (§22).
- **Product Decision required — explicitly still pending CTO freeze,
  not frozen merely because recommended (corrected, 2026-09-12,
  `UI-DIRECTION-1-CORRECTION`):** the navigation **shell pattern**
  (§7a — hybrid sidebar+topbar recommended, top-nav-only viable
  alternative); the **default entry point** (§7b — Market recommended
  as a staged, revisitable default, not inherited truth; Overview named
  as the viable alternative); dark-first-with-light-ready as the
  default (§3 — proposed, not frozen); Zest/Binance as the accepted
  reference pair (§1 — proposed, not frozen).
- **Architecture Decision required:** none — no protocol/architecture
  constraint is introduced by any visual/UX direction in this document.
- **Backlog:** cross-linked as `docs/BACKLOG.md` item 23 (new, this
  mission) — does not close item 22's FundingRequest/SigningRequest
  gaps, which remain open implementation work this document only
  designs toward.
- **Remain OPEN:** final visual language, final navigation, final
  dashboard structure, exact token values, exact typography family —
  all as already frozen OPEN by `PRODUCT-DIRECTION-FREEZE-1` §2D item
  10, unchanged by this document.

## Closing confirmations

No React component, CSS, or design token was created or modified. No
navigation, theme, or SDK/API change. No protocol semantics touched.
No Semantic Kernel or Core impact.
