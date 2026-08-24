---
name: Sails P2P Trading SDK — Reference UI
description: A familiar, trading-dense wallet interface — black + orange, light and dark
colors:
  bg-light: "rgb(250 250 250)"
  surface-light: "rgb(255 255 255)"
  elevated-light: "rgb(245 245 245)"
  border-light: "rgb(135 135 135)"
  text-light: "rgb(10 10 10)"
  text-secondary-light: "rgb(82 82 82)"
  text-muted-light: "rgb(100 100 100)"
  bg-dark: "rgb(5 5 5)"
  surface-dark: "rgb(15 15 15)"
  elevated-dark: "rgb(22 22 22)"
  border-dark: "rgb(100 100 100)"
  text-dark: "rgb(250 250 250)"
  text-secondary-dark: "rgb(163 163 163)"
  text-muted-dark: "rgb(140 140 140)"
  orange: "rgb(194 65 12)"
  orange-hover: "rgb(154 52 18)"
  orange-accent-dark: "rgb(249 115 22)"
  destructive: "rgb(185 28 28)"
typography:
  display:
    fontFamily: "'Space Grotesk', -apple-system, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 400
rounded:
  sm: "calc(0.5rem - 4px)"
  md: "calc(0.5rem - 2px)"
  lg: "0.5rem"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.orange-hover}"
  button-outline:
    backgroundColor: "transparent"
    rounded: "{rounded.md}"
    padding: "0.5rem 1rem"
---

# Design System: Sails P2P Trading SDK — Reference UI

## Overview

**Creative North Star: "The Familiar Ledger"**

sails-ui is meant to feel like a wallet app people already know how to
use — Binance P2P, Airtm, El Dorado — not like a novel design
experiment. That familiarity is the point: an integrator plugs the SDK
in and inherits an interface their own users won't have to learn.
Density reads as competence, not clutter — this is a trading surface
first, a brand showcase second. Branding is quiet and consistent
(black + orange, orange used sparingly) rather than loud.

The system explicitly rejects two things already ruled out in this
project's own build history: the generic, overly-rounded "AI-generated
app" look (corners were deliberately sharpened from `rounded-xl` to
`rounded-lg` for exactly this reason), and decoration that competes
with the data it sits next to. Every screen is built as real UI wired
to a real backend, never a static mockup — the visual system should
never read as more finished than the product actually is.

**Key Characteristics:**
- Restrained and confident, not tactile/playful — the trading-floor
  reference (Binance P2P/Airtm/El Dorado density), not a consumer
  wallet's warmth (Rainbow/Phantom).
- One accent color (burnt orange), used rarely and with intent.
- Flat by default — depth comes from a three-step neutral surface
  ladder and hairline borders, never shadows.
- Sharper corners than the "generic AI app" default; a deliberate,
  already-made brand decision, not an open question.
- Fully symmetric light/dark themes — orange shifts intensity between
  them, every neutral inverts, nothing is "dark mode only."

## Colors

Neutral-dominant with a single warm accent that appears rarely enough
to still mean something when it does.

### Primary
- **Burnt Orange** (`rgb(194 65 12)` / `#c2410c`): the one brand
  accent — primary buttons, links, focus rings, "online" state. Used
  as text/icon-on-surface too, but see the Named Rule below: it is not
  the same value as the accent used for that role in dark mode.
- **Burnt Orange, pressed** (`rgb(154 52 18)` / `#9a3412`): hover/active
  state for the primary accent, both roles, both themes.
- **Vivid Orange, dark-only accent** (`rgb(249 115 22)` / `#f97316`):
  used only in dark mode, only for orange-as-text/icon/accent on a
  brand surface (QVAC agent highlights, active tab indicators) —
  never behind white body text. The brighter hue is only safe against
  this theme's own near-black surfaces (~6.2–7.2:1); on white body
  copy or light-mode surfaces it fails contrast, which is exactly why
  light mode and every white-text button keep the darker Burnt Orange
  above instead.

### Neutral
Two parallel three-step surface ladders (background → surface →
elevated), one per theme, plus a matching text ladder. Nothing is
shared between light and dark; both are treated as equally real, not
one primary and one derived.

- **Light — Paper White** background (`rgb(250 250 250)`), **Surface**
  (`rgb(255 255 255)`), **Elevated** (`rgb(245 245 245)`), **Ink**
  text (`rgb(10 10 10)`), **Ink Secondary** (`rgb(82 82 82)`), **Ink
  Muted** (`rgb(100 100 100)`), **Hairline** border (`rgb(135 135
  135)`), hover (`rgb(110 110 110)`).
- **Dark — Void** background (`rgb(5 5 5)`), **Surface** (`rgb(15 15
  15)`), **Elevated** (`rgb(22 22 22)`), **Paper** text (`rgb(250 250
  250)`), **Paper Secondary** (`rgb(163 163 163)`), **Paper Muted**
  (`rgb(140 140 140)`), **Hairline** border (`rgb(100 100 100)`),
  hover (`rgb(130 130 130)`).

Borders were deliberately raised from a near-invisible hairline (light
`#e5e5e5`, dark `#242424`) to the values above — the originals measured
1.2–1.3:1 against every adjacent surface, well under WCAG 1.4.11's 3:1
floor for UI-component boundaries. The new values are the minimum step
that clears 3:1 while staying the lightest-weight line available; don't
darken/lighten them back toward invisibility.

### Status colors (semantic, not brand)
Real Tailwind literal colors, not custom tokens — used for trade
side and lifecycle state, standardized to the `-500` weight after a
contrast pass found the previously-used `-700` weight failing WCAG AA
in dark mode (2.5–3.2:1 against tinted backgrounds; `-500` lands at
4.4–8.6:1): green (`BUY`/completed/active), red (`SELL`/disputed/error),
blue (payment/in-progress), yellow (pending/warning), purple (QVAC
agent recommendations, `-400` weight specifically — `-500` measured
4.3:1, just under the 4.5:1 floor).

### Named Rules
**The Rare Accent Rule.** Orange is a signal, not a background. It
marks the one primary action or the one thing currently true (active
tab, online indicator, focus ring) — it is never a large fill, never a
page background, never used twice in the same view for two different
meanings.

**The Two-Orange Rule.** There are two oranges, not one: the darker,
contrast-locked `rgb(194 65 12)` for anything with white text on top of
it (buttons, in both themes), and the brighter `rgb(249 115 22)` only
for text/icon-on-surface in dark mode. Never swap them — the bright
value fails contrast as a button fill or as text on a light surface.

## Typography

**Display Font:** Space Grotesk (with `-apple-system, sans-serif`
fallback)
**Body Font:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
sans-serif`

**Character:** Space Grotesk is the one place this system carries
personality — wordmark and page headlines only. Everything else stays
on the fast, dense, platform-native system stack, because this is an
information-dense trading surface first; body text optimizes for
legibility and rendering speed over character.

### Hierarchy
- **Display** (Space Grotesk, 700, page titles/wordmark): brand
  moments only — never body copy, never more than a few words per use.
- **Title** (system stack, 600–700, `text-lg`–`text-2xl`): section
  headers, card titles, screen headings.
- **Body** (system stack, 400–500, `text-sm`–`text-base`): the default
  for everything else — labels, values, descriptions.
- **Label/Mono** (system stack, `font-mono` where a value must read as
  data, `text-xs`): amounts, IDs, hashes, timestamps — anywhere
  precision matters more than warmth.

## Layout

Tailwind's default spacing scale throughout, no custom scale. Density
follows the trading-floor reference directly: `Marketplace`'s offer
list is a single hairline-divided list (`.offer-row`), not a card
grid — the same layout Binance P2P/Airtm/El Dorado use for listings,
chosen explicitly over a floatier card-per-offer grid. Side (buy/sell)
reads instantly off a 2px left accent border on each row, not a badge
alone. Responsive breakpoint for row density is `lg` (1024px), not the
more common `md` (768px) — found live that a single-line row didn't fit
all five columns at tablet width; tablet gets the same stacked
mobile-row layout instead of a cramped intermediate state.

## Elevation & Depth

Flat by design — there is no `box-shadow` anywhere in this system.
Depth is conveyed entirely through the three-step neutral surface
ladder (background → surface → elevated) plus a hairline border, never
a shadow. This is a deliberate trading-app choice, not an oversight:
shadows read as "floating card," which fights the dense, list-driven
layout this system uses instead of card grids.

### Named Rules
**The Flat-By-Default Rule.** No shadows, ever. Depth is a background
step and a border, not a blur. If a surface needs to feel "raised,"
move it one step up the bg → surface → elevated ladder instead.

## Shapes

`rounded-lg` (`0.5rem`) is the system default — every card, input, and
row uses it. This is deliberately sharper than the `rounded-xl` this
project used before a 2026-07-28 redesign explicitly called out
uniform oversized radii as the clearest "generic AI-generated app"
tell; sharper corners read closer to the Binance/Airtm/El Dorado
reference this system follows. `rounded-md` (`0.375rem`, `var(--radius)
- 2px`) and `rounded-sm` (`0.25rem`, `-4px`) exist as the smaller steps
shadcn/ui's token pair expects, used for buttons and small controls.

### Named Rules
**The Sharper-Than-Default Rule.** When in doubt, use less radius, not
more. A bubbly, uniformly-rounded interface is the specific look this
system was built to avoid.

## Components

### Buttons
- **Shape:** `rounded-md` (`0.375rem`), `h-10 px-4 py-2` default size;
  `sm`/`lg`/`icon` size variants exist.
- **Primary:** `bg-primary` (Burnt Orange) with white text,
  `hover:bg-primary/90`.
- **Outline:** transparent fill, `border-input` hairline border,
  `hover:bg-accent` (steps up to the Elevated neutral).
- **Secondary / Ghost / Link:** secondary uses the Elevated neutral as
  fill; ghost has no fill until hover; link is text-only, underline on
  hover. All six variants share the same shape and sizing scale.
- **Focus:** a visible `ring-2` in the accent color with a background
  offset — never removed, this is a real-money-adjacent product.

### Cards / Containers
- **Corner Style:** `rounded-lg` (`0.5rem`).
- **Background:** `bg-brand-surface` (the Surface step, not
  Background) — a card is always one step up from the page.
- **Border:** hairline, `border-brand-border`; brightens to the accent
  color's border tint on hover for interactive cards.
- **Shadow Strategy:** none — see Elevation & Depth.

### Inputs / Fields
- **Style:** `bg-brand-elevated` fill, hairline border, `rounded-lg`.
- **Focus:** border shifts to the brand orange, no glow/ring on the
  field itself (the ring pattern is reserved for buttons/focusable
  controls generally, per shadcn defaults).
- **Placeholder:** uses the Muted text step, never the Secondary step —
  keeps a real value visually distinct from a hint.

### Status Badges
- **Style:** tinted background at low opacity (`/10`) in the semantic
  color, matching-color hairline border (`/25`), text in the same
  color at `-500` weight (see Colors → Status colors for why `-500`
  specifically, and the one `-400` exception for the QVAC/purple
  badge).
- **Role:** trade side (buy/sell), trade/escrow lifecycle state,
  payment method, agent risk level — never decorative.

### Navigation
- Bottom nav on mobile, top nav on desktop — standard wallet-app
  convention, not a custom pattern. Active state uses the orange
  accent on the icon/label, inactive uses the Muted text step.

## Do's and Don'ts

### Do:
- **Do** keep orange rare — one primary action or one true state per
  view, per the Rare Accent Rule.
- **Do** use `rounded-lg`/`rounded-md` consistently; never introduce a
  larger radius than the system default.
- **Do** convey depth with the bg → surface → elevated ladder and a
  hairline border, never a shadow.
- **Do** keep both themes fully specified and symmetric — a new token
  needs a real value in both `:root` and `.dark`, not a dark-only
  addition left to inherit a light default.
- **Do** use the `-500` weight for semantic status colors (red, blue,
  green, yellow) in this dark-mode-default app — the `-700` weight
  measured a real WCAG AA failure and was already fixed once; don't
  reintroduce it.

### Don't:
- **Don't** add a shadow anywhere. If something needs to feel raised,
  move it up the neutral ladder instead.
- **Don't** use the bright dark-mode-only orange (`#f97316`) as a
  button fill or as text on a light surface — it fails contrast in
  both cases; that's specifically why the darker `#c2410c` exists.
- **Don't** round corners past `rounded-lg` (`0.5rem`) — the
  oversized-radius look was already identified and deliberately
  reversed once in this project.
- **Don't** reach for a card-grid layout for list-like data (offers,
  trades). This system's own precedent is a single hairline-divided
  list with a left accent border for side — follow it, don't
  reintroduce the floatier card-grid pattern it replaced.
