---
target: packages/sails-ui/src/pages/Marketplace.tsx
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-24T12-53-54Z
slug: packages-sails-ui-src-pages-marketplace-tsx
---
Method: dual-agent (A: af5b32bfdbee8f47b · B: a656ccccce707bb1b)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading/empty/error/match-count states all present; per-row content (blank identity, "0 trades") is misleading, not just thin |
| 2 | Match System / Real World | 3 | Natural PT-BR trading vocabulary; min/max amounts show no unit |
| 3 | User Control and Freedom | 3 | Real Radix Sheet/Popover with Escape/focus-trap, explicit Cancelar/Ajustar/Redefinir escapes |
| 4 | Consistency and Standards | 3 | Price column breaks the system's own display-vs-mono typography rule; sort duplicated across two interaction patterns |
| 5 | Error Prevention | 3 | Guarded JSON.parse, numeric range validation on the QVAC mandate |
| 6 | Recognition Rather Than Recall | 3 | Picker triggers show current value; activeFilterCount externalizes drawer state |
| 7 | Flexibility and Efficiency | 3 | Toolbar quick-pickers serve power users; same redundancy costs first-timer orientation |
| 8 | Aesthetic and Minimalist Design | 2 | 7-control toolbar row directly contradicts DESIGN.md's own "restrained," "density reads as competence" rule |
| 9 | Error Recovery | 3 | Explicit fetch-failure vs. no-results distinction, plain-language toasts |
| 10 | Help and Documentation | 3 | InfoTooltip used thoroughly and functionally, not decoratively |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

**Grounded, not generic — with one real gap in the emotional payoff.** The offer list is a single hairline-divided row explicitly rejecting a card grid, with a left accent border for side and a documented Binance P2P/Airtm/El Dorado precedent — a generic component-library port would never produce this. The AI Negotiator's boundary disclosure (QVAC never touches PIX, never moves funds without approval) is the strongest specificity signal on the page: it names a precise, product-real authority boundary no unrelated SaaS product could reuse unchanged.

Where it slips toward generic: the toolbar's picker+picker+picker+filter+toggle+select+search assembly could belong to any e-commerce filter bar, and the one thing that should make a row feel like "trading with a real, familiar person" — identity and track record — currently renders as placeholder-looking data for every real offer (see P0 below). That dilutes the "Familiar Ledger" promise at the exact row level where it matters most.

**Deterministic scan**: The static CLI detector (`detect.mjs`) found 0 issues scanning the raw source of `Marketplace.tsx` and its rendered subcomponents — confirmed as a genuine clean result (Assessment B validated the detector fires correctly against contrived positive-control snippets first). The **live browser DOM detector** (injected into the running page) reported 4 findings: `low-contrast` (1.0:1, `#0a0a0a` on `#050505`), `line-length` (~140 chars/line), `overused-font` (Roboto, 85%), `layout-transition` (`transition: height`).

**I independently re-verified the `low-contrast` finding myself before accepting it, and it does not hold.** I traced it to a real, specific element (`SelectTrigger`'s "Ordenar: Preço" — it inherits color from `<body>` rather than setting its own), then proved with an isolated test that the identical CSS expression (`color: rgb(var(--color-text))`) computes *correctly* to the dark-mode value when applied to a fresh, ordinary `<div>` via class or inline style, but computes to the *light*-mode value specifically when read from `<body>`'s own computed style — reproduced across two separate tabs, including one with no prior interaction. This is a known category of automation-tooling quirk isolated to reading `<body>`'s own computed style after a class-based theme toggle in this specific browser-automation environment (documented once already earlier this session, now reproduced and root-caused a second time) — not a defect a real visitor's browser would ever exhibit. **Verdict: false positive, not a real contrast bug.** `line-length`/`layout-transition` are plausible but unverified (no visual confirmation was possible — see Assessment B's tooling limitations); `overused-font: Roboto` is inconclusive — this app's real font stack is `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (Roboto is the 4th fallback, for platforms lacking the first three), so the detector reporting Roboto as the *resolved* font most likely reflects this specific automation host's available system fonts, not this app's actual font choice for a real user's device.

## Overall Impression

Solid, evidenced foundation — this screen visibly follows its own documented design system in the load-bearing decisions (list-not-grid layout, flat surfaces, restrained color) and has a real history of catching and fixing its own UX bugs (the empty-state distinction, the guarded localStorage parse). The biggest opportunity is not a new feature or a visual refresh — it's closing the gap between "what the offer row promises" (evaluate a real trading partner) and "what data actually reaches it today" (a structurally blank identity column), and reining in a toolbar that has quietly grown past the system's own density rule.

## What's Working

1. **The BOUNDARY_TEXT disclosure in `AgentIntentionPanel`** — precise, product-accurate, delivered exactly where a user would reasonably worry an AI agent might move money without asking.
2. **`OfferCard`'s left accent border for side** — reads buy/sell instantly, a direct, verifiable lift from the stated real-world reference rather than an invented pattern.
3. **The `matchCount` scroll-link between the AI panel and the offer grid** — closes a real, previously-documented gap and does double duty as discoverability aid and status feedback.

## Priority Issues

**[P0] Trader-identity column is structurally blank for every real offer.**
*Why it matters*: `lib/realOffers.ts`'s `summaryToOffer()` hardcodes `displayName: null, verified: false, totalTrades: 0` because `GET /v1/liquidity/offers` doesn't return the owning `User` row. `OfferCard.tsx` renders `{offer.user.displayName}` with no fallback (renders nothing) and `{offer.user.totalTrades} trades` — which reads as "0 trades" for real, established traders, not "data unavailable." On a marketplace whose entire trust model is "evaluate the person before sending money," the primary decision input is empty, and the trust number looks real but is fabricated. It also silently breaks seller search (matches only `displayName`, always `null`).
*Fix*: fallback label instead of blank name; render `totalTrades` as `—` when known-unavailable rather than a real-looking `0`.
*Suggested command*: `/impeccable harden`

**[P1] Price uses the Display font, violating DESIGN.md's own typography rule.**
*Why it matters*: `OfferCard.tsx` sets the price to `font-display` (Space Grotesk) — but DESIGN.md is explicit that Display is for "brand moments only — never body copy, never more than a few words per use," while repeated data values like price belong to the mono/Label tier ("anywhere precision matters more than warmth"). This is the system's own documented rule being violated in its own reference implementation, not a taste call.
*Fix*: switch to `font-mono`, keep `tabular-nums` and the bold weight/size.
*Suggested command*: `/impeccable typeset`

**[P1] Toolbar overload — 7 simultaneously-visible controls in one unbroken row.**
*Why it matters*: AssetPicker, CurrencyPicker, PaymentMethodPicker, Filtros, a 3-way side toggle, Sort, and Search all sit in one row with no grouping break — 4 of 8 cognitive-load checklist items fail or border-fail (chunking, grouping, one-thing-at-a-time, minimal-choices-≤4). This directly contradicts DESIGN.md's own "restrained," "density reads as competence, not clutter" language.
*Fix*: cluster into "narrow" vs. "sort/search" with a visible break; consider folding PaymentMethodPicker into the Filtros drawer only, since it likely duplicates the least-reached-for quick filter.
*Suggested command*: `/impeccable distill`

**[P2] Min/max amounts show no unit, unlike the price column next to them.**
*Why it matters*: `formatAmount()` produces bare numbers ("min 100" / "max 5000") sitting next to a price column that does show a currency symbol — ambiguous which asset the range refers to.
*Fix*: append `ASSET_SHORT_LABELS[offer.asset]` (already used elsewhere in this codebase).
*Suggested command*: `/impeccable clarify`

**[P3] Loading state is a bare centered text line, no skeleton.**
*Why it matters*: Doesn't match the row shape about to appear; reads thinner than PRODUCT.md's own "wallet-grade, not a proof of concept" bar for this specific screen.
*Suggested command*: `/impeccable polish`

## Persona Red Flags

**Jordan (First-Timer)**: Sees a grid where every trader name is blank and every track record reads "0 trades" — for a first-timer this reads as "no established traders here," the opposite of the trust a familiar-wallet design is going for. Also can't tell that the Filtros drawer and the toolbar's PaymentMethodPicker edit the same field — three entry points into overlapping state with no signal they overlap.

**Sam (Accessibility-Dependent)**: A screen-reader user tabbing the list hears no identifying information for any row's trader (empty text node, no fallback, no `aria-label`) — worse than what a sighted user gets, who at least sees an avatar initial. `.offer-row` — the primary interactive element on the whole page — has no defined `focus-visible` treatment, unlike `Button`'s explicit ring, despite DESIGN.md's own "focus ring never removed, this is a real-money-adjacent product" commitment. (Counter-evidence: `InfoTooltip` and the Sheet/Popover primitives are genuinely well-built for keyboard/focus — this is a specific gap in an otherwise-disciplined pattern, not systemic neglect.)

**Casey (Mobile)**: The side-filter toggle (~32px) and picker/Filtros triggers (~36-38px) both sit under the 44×44pt guideline in the row a thumb would tap most. No responsive collapse on the 7-control toolbar — Casey scrolls past several wrapped control lines before reaching an offer.

## Minor Observations

- Sort is editable from two different UI patterns (toolbar Select, drawer pill row) for one value.
- `Verificado`/`PowerTraderBadge` exist in code but can never render against real Marketplace data today, per the P0 gap — worth knowing this trust signal is currently decorative-only here.
- The non-custodial claim shares one muted footnote line with a brand tagline — arguably deserves more visual weight as an architectural invariant, not a footer aside.

## Questions to Consider

- If `GET /v1/liquidity/offers` structurally can't return trader identity today, should this screen present itself as a peer-identity list at all — or would an honest "aggregated liquidity" framing be more truthful than a peer list with blank peers?
- The AI Negotiator and the manual toolbar solve the identical job at equal visual weight on first load — what does this screen look like if it committed to one as primary and the other as a discoverable secondary path?
- DESIGN.md's Rare Accent Rule says orange marks "one thing currently true" — on this screen it currently marks the active side tab, active picker selections, the AI panel highlight box, the filter-count badge, and every hover state at once. Is "rare" still doing its job at that density?
