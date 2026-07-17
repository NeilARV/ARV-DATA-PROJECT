---
name: ARV Finance Data App
description: The Insider's Desk — a credible, data-forward workspace for ARV's borrower-clients.
# Colors mirror client/src/index.css verbatim (HSL doctrine, source of truth). Light-mode :root values;
# primary is identical in both modes; dark-mode values live in colors.md and the sidecar.
colors:
  primary: "hsl(192 67% 65%)"
  primary-foreground: "hsl(0 0% 100%)"
  background: "hsl(0 0% 100%)"
  foreground: "hsl(220 9% 15%)"
  card: "hsl(0 0% 98%)"
  card-border: "hsl(220 13% 94%)"
  sidebar: "hsl(220 9% 96%)"
  popover: "hsl(0 0% 96%)"
  muted: "hsl(220 13% 95%)"
  muted-foreground: "hsl(220 9% 40%)"
  accent: "hsl(220 14% 95%)"
  secondary: "hsl(220 14% 93%)"
  border: "hsl(220 13% 91%)"
  input: "hsl(220 13% 80%)"
  ring: "hsl(192 67% 65%)"
  destructive: "hsl(0 84% 42%)"
  destructive-foreground: "hsl(0 84% 98%)"
  chart-1: "hsl(192 67% 65%)"
  chart-2: "hsl(142 76% 36%)"
  chart-3: "hsl(262 83% 48%)"
  chart-4: "hsl(32 95% 44%)"
  chart-5: "hsl(340 82% 52%)"
  status-online: "#22C55E"
  status-away: "#F59E0B"
  status-busy: "#EF4444"
  status-offline: "#9CA3AF"
  spread-positive: "#22C55E"
  spread-negative: "#FF0000"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  # Marketing layer only (components/Home). Responsive-clamped headings, sanctioned here and nowhere
  # else; fontSize below is the lg-step ceiling — see Typography § Marketing Home Layer for the steps.
  marketing-display:
    fontFamily: "Inter, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 700
    lineHeight: "1.05"
    letterSpacing: "-0.03em"
  marketing-section:
    fontFamily: "Inter, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 700
    lineHeight: "1.08"
    letterSpacing: "-0.025em"
rounded:
  sm: "3px"
  md: "6px"
  lg: "9px"
  xl: "12px"
  2xl: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
  badge:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
  # Marketing layer only (components/Home/ui/buttons.ts). INTERIM: duplicates the shared Button with
  # the home look (larger padding, ring-2 focus, borderless, no elevate overlay). Consolidate later.
  button-marketing-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-marketing-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  pill:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.2xl}"
    padding: "4px 12px"
---

# Design System: ARV Finance Data App

> **Source-of-truth note.** Three layers, one job each. **Code owns the values:** every token lives in
> `client/src/index.css` and `tailwind.config.ts` as HSL. **This document owns the *identity and the
> rules*:** why the system looks the way it does, and the canonical statement of every `DS.*` rule —
> the Named Rules in the sections below. **The `ui-design` skill owns the *operational layer*:** the
> which-token-when lookup tables (`.claude/skills/ui-design/references/`) and the machine enforcement
> (`scripts/check-hex.sh`); it cites the `DS.*` rules by ID rather than restating them. Design *work* —
> building, redesigning, or auditing a surface — is driven through `/impeccable`, for which this file
> and `PRODUCT.md` are the context.
>
> **HSL is canonical.** The frontmatter mirrors `index.css` verbatim in HSL, not hex or OKLCH, so the
> two never drift through rounding. A regeneration (`/impeccable document`) MUST preserve HSL; the
> Stitch hex-only linter warning on this frontmatter is expected and accepted. When the three layers
> disagree, the code wins and this file is stale — regenerate it, preserving HSL.

## 1. Overview

**Creative North Star: "The Insider's Desk"**

ARV Finance is a lender, and this app is the workspace it hands its borrower-clients — wholesalers and fix-and-flip operators running deals across a handful of active MSAs. The visual system has to earn the trust of a paying client before it impresses them with data, and then do both at once. That is the whole brief: the **trusted insider** (you are being taken care of by people who have funded and closed these exact deals) held together with the **sharp analyst** (the numbers are authoritative, the market is read cold). The Insider's Desk is that room — uncluttered, credible, everything a pro needs within reach, nothing shouting for attention.

Visually this reads as **restraint in service of confidence**. A near-white canvas (or a deep neutral in dark mode), a single cyan brand accent used only where it means something, and one well-tuned sans (Inter) carrying every heading, label, value, and row. Depth is quiet: there are no drop shadows anywhere in the product — surfaces are flat at rest and lift only in response to interaction, via a subtle overlay. Density is calibrated per surface, not globally: the Data app searches like Zillow/Redfin and can run dense; the Mastermind works like Slack; deals and vendors sit between. All four are plainly the same product.

The system explicitly rejects four looks, drawn straight from the product's anti-references: the **generic AI/SaaS template** (cream backgrounds, gradient heroes, identical icon-heading-text card grids, tracked-uppercase eyebrows); the **cluttered legacy real-estate portal** (banner-ad busy, cramped MLS tables); **cold enterprise or bank software** (sterile, corporate, feels like a mortgage form); and **consumer-toy playfulness** (cartoonish, over-animated, unserious). The Insider's Desk is professional and human — never any of those.

**Key Characteristics:**
- One accent (cyan `192 67% 65%`), spent only on meaning: CTAs, active state, focus, links, positive series.
- One family, Inter, at a fixed rem scale — hierarchy comes from weight and size, not from fluid scaling.
- Flat by default; depth is a hover/active overlay, never a shadow.
- Neutral-cool grays throughout; warmth is deliberately absent (no cream, no beige).
- Per-surface density, one coherent identity.
- A single bounded exception: the one-page marketing layer (`components/Home`) may use clamped display headings and choreographed entrance motion — still Inter, still one accent, still flat and cool.

## 2. Colors

A cool-neutral system with a single cyan brand accent — restrained by default, and semantically strict (`DS.NO-HARDCODED-COLOR`). Full hex equivalents, dark-mode pairs, and the four sanctioned categorical palettes (deal types, transaction types, badge variants, rank medals) live in `ui-design/references/colors.md`; this section describes character and role only.

### Primary
- **Insider Cyan** (`hsl(192 67% 65%)`): the one brand color. CTAs, active states, focus rings, links, the active sidebar item, and the primary chart series. Identical in light and dark mode by design — the brand is a constant. Its scarcity is the point (see the One Accent Rule).

### Neutral
- **Ink** (`foreground` `hsl(220 9% 15%)` → `hsl(220 9% 98%)` dark): body text and headings. A near-black with a faint cool cast, never pure `#000`.
- **Muted Ink** (`muted-foreground` `hsl(220 9% 40%)` → `hsl(220 9% 72%)` dark): every piece of secondary text — labels, descriptions, timestamps, placeholders, decorative icons (`DS.MUTED-FOREGROUND`). The dark value was tuned to 72% lightness specifically; do not approximate it with a gray.
- **Canvas & Surfaces** (`background`, `card`, `sidebar`, `popover`, `muted`, `accent`, `secondary`): a tight ladder of cool near-whites in light mode (`100%` → `93%` lightness) and deep neutrals in dark (`9%` → `18%`). The sidebar is a slightly cooler/darker plane than the content canvas — a second neutral layer, not a color.
- **Lines** (`border` `hsl(220 13% 91%)`, `card-border` lighter, `input` darker): three deliberately distinct hairlines. They are not interchangeable.

### Semantic
- **Destructive** (`hsl(0 84% 42%)`): delete, error, warning. The only red in the chrome.
- **Status dots** (`#22C55E` online · `#F59E0B` away · `#EF4444` busy · `#9CA3AF` offline) and **financial deltas** (`spread-positive #22C55E` / `spread-negative #FF0000`): categorical, referenced by token name.

### Charts
Five-series ramp led by the brand: `chart-1` cyan (primary/brand), `chart-2` green (positive), `chart-3` violet, `chart-4` amber, `chart-5` rose. Dark-mode values are lightened 5–20% for contrast.

### Named Rules
**The Token-Only Rule.** (`DS.NO-HARDCODED-COLOR`) Every color is a semantic token — never a hex literal, an `rgb()`, or a Tailwind palette color (`text-gray-300`, `bg-slate-800`) in a component. The only sanctioned hex is the four categorical palettes (deal types, transaction types, badge variants, rank medals), enumerated in `ui-design/references/colors.md`; adding a fifth means documenting it there and in `scripts/hex-allowlist.txt` first. `scripts/check-hex.sh` enforces this on a diff.

**The Muted-Foreground Rule.** (`DS.MUTED-FOREGROUND`) Every piece of secondary text — labels, descriptions, timestamps, placeholders, decorative icons — is `text-muted-foreground`, never a hand-picked gray. The dark-mode value is tuned to 72% lightness specifically, and hardcoding `text-gray-300/80` discards that tuning. The single most-violated rule in the codebase.

**The One Accent Rule.** Insider Cyan is the *only* brand color, and it appears only where it carries meaning — action, selection, focus, link, primary series. If cyan is decorating something that isn't interactive or isn't the primary datum, remove it. Its rarity is what makes it read as authoritative.

**The Cool-Neutral Rule.** Grays carry a faint blue cast (`hue 220`), never a warm one. No cream, no beige, no sand — those are the generic-template tell this brand rejects. Warmth, when it's wanted, comes from copy and content, never from the surface.

## 3. Typography

**Display / Body / Label Font:** Inter (300–700), with `sans-serif` fallback. One family does every job.

**Character:** Inter is a neutral, highly legible humanist sans — the sharp-analyst voice. There is no display/body pairing and there should not be; a second family would read as decoration, and this system earns hierarchy through weight and size instead. `DS.FIXED-TYPE-SIZE` and `DS.TYPE-FLOOR` are defined in the Named Rules below; `ui-design/references/typography.md` carries the operational scale and role tables.

### Hierarchy
- **Display / Page title** (`600`, `1.5rem`/24px, scales from `text-xl`): the only element besides a growing card heading that scales responsively.
- **Headline / Section header** (`600`, `1.25rem`/20px).
- **Title / Card heading, financial value** (`600` heading, `700` value, `1.125rem`/18px): financial values go bold — the numbers are the point.
- **Body** (`400`, `1rem`/16px, `1.5rem` line height): primary text, spec rows, inputs, table cells. Prose caps at 65–75ch; dense tables may run wider.
- **Label** (`500`, `0.875rem`/14px): field names, links, secondary headings, button text.
- **Caption** (`400`, `0.75rem`/12px): timestamps, sub-labels, badge text (`600`).

### Marketing Home Layer (the sanctioned exception)
The one-page marketing surface (`components/Home`) is the *only* place responsive-clamped display type is allowed. Two shared scales, both `font-bold` with `text-wrap:balance` and negative tracking, both well under the 6rem shout ceiling:
- **Marketing display** (Hero, local to `Hero.tsx`): `text-[2.25rem]` → `sm:text-5xl` → `lg:text-[3.25rem]`, `leading-[1.05]`, `tracking-[-0.03em]`. Ceiling ~52px.
- **Marketing section heading** (`Home/ui/typography.ts` `sectionHeading`): `text-[2rem]` → `sm:text-4xl` → `lg:text-[2.75rem]`, `leading-[1.08]`, `tracking-[-0.025em]`. Ceiling ~44px. Every marketing section header shares this one scale so the page's hierarchy reads deliberate, not drifting.

### Named Rules
**The Fixed-Scale Rule.** (`DS.FIXED-TYPE-SIZE`) Type sizes are fixed, not fluid. Exactly two things scale with the viewport — page titles and a card heading when its card grows. Scaling everything in lockstep changes no real proportion; it only pays reflow for the illusion of hierarchy. Clamp-sized headings belong to the marketing layer, never to app UI.

**The Marketing-Exception Rule.** Clamped display type and choreographed entrance motion are permitted on `components/Home` and forbidden everywhere else. The exception is bounded, not a second design language: still Inter, still one cyan accent, still cool neutrals, still flat. If a clamp heading or a scroll reveal shows up outside `components/Home`, it's a bug.

**The 12px Floor Rule.** (`DS.TYPE-FLOOR`) `text-xs` (12px) is the minimum for UI text. The only exceptions are avatar initials (sized to their circle) and the dense transaction list. Anywhere else, a smaller size means the container is too small — fix the container.

## 4. Elevation

This system has **no shadows**. Every shadow token is set to zero opacity. Depth is painted by a translucent overlay on a `::before`/`::after` pseudo-element (`hover-elevate`, `hover-elevate-2`, `active-elevate-2`, `toggle-elevate`) — roughly a 3% wash on hover, 8% on press, tinted dark-on-light and light-on-dark. `DS.NO-SHADOWS` is defined in the Named Rules below; `ui-design/references/components.md` carries the elevation-utility table.

### Named Rules
**The Flat-By-Default Rule.** (`DS.NO-SHADOWS`) Surfaces are flat at rest. Elevation is a *response to state* (hover, press, toggle), never an ambient decoration. A card that looks lifted while idle is wrong.

**The Overlay-Not-Shadow Rule.** (`DS.NO-SHADOWS`) Never reach for a `box-shadow` to separate two surfaces — use the border ladder (`border` / `card-border` / `input`) or the elevate overlay. Consequence worth remembering: an ancestor with `overflow: hidden` clips the overlay, so a rounded-image card silently loses its hover — fix the clip, don't add a shadow.

## 5. Components

Shared primitives live in `client/src/components/ui/` and are documented in `ui-design/references/components.md` (`DS.INTERACTION-STATES`). Character and the essentials below; that reference owns the exhaustive variant/size tables.

### Buttons
- **Shape:** `rounded-md` (6px) — the system default radius.
- **Primary:** `bg-primary` fill, derived `primary-border`, `primary-foreground` text. Confident but not loud.
- **Hover / Active:** primary uses `hover:brightness-90` / `active:brightness-75` (a tint over a saturated fill reads muddy, so the elevate overlay is *not* used here); every other variant uses `hover-elevate` / `active-elevate-2`.
- **Secondary / Outline / Ghost / Destructive:** neutral fill, hairline outline, transparent icon-button, and the lone red respectively — one shape vocabulary across all.

### Cards / Containers
- **Corners:** `rounded-xl` (12px). **Background:** `bg-card`. **Border:** 1px `card-border` (lighter than the default border). **Padding:** 16–20px. **Elevation:** none at rest; deal cards take `hover:border-primary` and a `border-primary` selected state (`border-2` reserved for the active/expanded card).

### Inputs / Fields
- **Style:** `border-input` (1px, deliberately darker than other lines), `rounded-md`, `bg-background`. **Text:** 16px on mobile (below this iOS zooms), 14px desktop. **Focus:** the shadcn/Radix `ring` (`focus-visible:ring-1 ring-ring`) — don't hand-roll a focus style.

### Badges
- **Shape:** `rounded-md`, `text-xs font-semibold`, never wraps. Categorical variants (`cyan`, `green`, `red`, `purple`, `orange`, `indigo`) map to the sanctioned palettes — adding a hex-backed variant requires documenting it in `colors.md` first.

### Navigation (Sidebar)
- **Style:** `bg-sidebar` (a cooler second neutral plane), 1px `sidebar-border`, item padding `px-3 py-2`, `text-sm`. **Active item:** `bg-sidebar-accent text-sidebar-primary font-medium` — the one place the brand cyan appears in chrome. **Mobile:** collapses to a drawer at `lg` (1024px), the primary breakpoint.

### Marketing Home Layer (`components/Home`)
The marketing surface has its own small primitive set, page-local and separate from the shared `ui/` library. Every one of them still spends only semantic tokens — no hardcoded color — and stays flat and cool. Character and where they live:

- **Marketing buttons** (`Home/ui/buttons.ts` — **INTERIM**): three class-string variants — `btnPrimary` (borderless `bg-primary`, `px-5 py-2.5`, `hover:brightness-90` / `active:brightness-75`), `btnOutline` (hairline `border-border`, `hover:bg-accent`), `btnGhost` (muted, `hover:bg-accent`). They deliberately duplicate the shared `<Button>` with a heavier home look (larger padding, `ring-2` focus, no elevate overlay). This is scaffolding: fold them back into `components/ui/button.tsx` once that look goes app-wide, then delete the file.
- **`Pill`** — a neutral eyebrow tag: `rounded-full` `bg-card` with a `border`, `text-xs font-medium text-muted-foreground`. Section tags only; not the tracked-uppercase eyebrow this brand bans.
- **`FeatureBullet`** — a `Check` icon in `text-primary` beside `text-sm text-muted-foreground` copy. The one sanctioned spot cyan decorates a list marker.
- **`LiveDot`** — a `bg-status-online` dot with a pulsing `animate-ping` halo; signals real-time activity.
- **`Reveal`** — wraps children in a scroll-triggered fade+slide (`IntersectionObserver`, `duration-700 ease-out`). It reveals an already-rendered default: under reduced motion or without `IntersectionObserver` it shows immediately, so the section never ships blank behind an observer that won't fire.

**Motion set** (`styles/home.components.css`, page-local): `arv-marquee` (28s markets ticker), `arv-fade-in`, `arv-pin-drop` (staggered hero map-pin entrance), `arv-underline` (a cyan underline that draws in under the hero's accent word), and the `arv-range` slider skin. Each has a `prefers-reduced-motion: reduce` hold that stills it. Gated through `prefersReducedMotion()` (`utils/motion.ts`); section anchoring via `scrollToSection()` (`utils/scroll.ts`).

## 6. Do's and Don'ts

Concrete guardrails. The Don'ts carry the product's anti-references by name so the visual line matches the strategic one.

### Do:
- **Do** spend Insider Cyan (`192 67% 65%`) only on meaning — action, selection, focus, link, primary series. Neutral everything else. (The One Accent Rule.)
- **Do** route every secondary text through `text-muted-foreground` (`DS.MUTED-FOREGROUND`); never a hand-picked gray.
- **Do** convey depth with the elevate overlay or the border ladder, never a shadow (`DS.NO-SHADOWS`).
- **Do** hold type sizes fixed; scale only page titles and growing-card headings (`DS.FIXED-TYPE-SIZE`).
- **Do** use a semantic token for every color; the only hex allowed is in the four sanctioned categorical palettes (`DS.NO-HARDCODED-COLOR`).
- **Do** match density to the surface — Data can run tight like Redfin, Mastermind reads like Slack.
- **Do** keep the marketing layer's clamp headings and entrance motion inside `components/Home`, every animation paired with a `prefers-reduced-motion` hold. (The Marketing-Exception Rule.)
- **Do** treat `Home/ui/buttons.ts` as interim scaffolding — reach for the shared `<Button>` in app UI, and consolidate the marketing variants back into it rather than growing a second button system.

### Don't:
- **Don't** ship the **generic AI/SaaS template**: no cream/beige backgrounds, no gradient hero, no identical icon-heading-text card grids, no tiny tracked-uppercase eyebrow over every section.
- **Don't** drift toward the **cluttered legacy real-estate portal**: no banner-ad density, no cramped MLS-style tables fighting for every pixel.
- **Don't** go **cold enterprise/bank**: no sterile corporate chrome that feels like filling out a mortgage form. Credible, not clinical.
- **Don't** go **consumer-toy**: no cartoonish illustration, no over-animated motion, no unserious flourishes — it undercuts credibility with people moving real money.
- **Don't** warm the neutrals. Grays stay cool (`hue 220`); a warm-tinted surface is off-brand. (The Cool-Neutral Rule.)
- **Don't** add a second font family, a `box-shadow`, or a fluid clamp heading to app UI. Those belong to nobody here, or to the marketing layer at most.
