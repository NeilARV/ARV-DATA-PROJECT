# Design System: ARV Finance Data App

This is the authoritative design reference for the ARV Finance Data App. All design decisions — colors, typography, spacing, breakpoints, components — should be documented here and followed consistently across the codebase.

Style tokens live in `tailwind.config.ts` and `client/src/index.css`.
Component-level utility classes live in `client/src/styles/deal.components.css`.

---

## Breakpoints

| Name | Min Width | Notes |
|---|---|---|
| `sm` | 640px | Rarely used — avoid unless truly needed |
| `md` | 768px | Mobile → tablet transition |
| `tablet` | 850px | Deal card layout shifts, financial grid columns |
| `lg` | 1024px | Primary desktop breakpoint for most layout changes |
| `xl` | 1280px | Wide desktop |
| `2xl` | 1536px | Large/ultrawide (rarely needed) |

**Rule**: Default to `lg:` as the primary responsive breakpoint. Use `tablet:` for deal card layout shifts at the 850px threshold. Use `md:` for other layout shifts at 768px. Avoid stacking multiple responsive variants on the same property — if `sm:`, `md:`, and `lg:` are all on one element, simplify.

---

## Typography

**Font Family**: `Inter` (Google Fonts, weights 300–700) → fallback `sans-serif`

Configured via `--font-sans` CSS variable in `index.css`.

### Font Size Scale

| Class | Size | Line Height | Used For |
|---|---|---|---|
| `text-xs` | 12px / 0.75rem | 1rem | Timestamps, captions, deal type badges, sub-labels |
| `text-sm` | 14px / 0.875rem | 1.25rem | Secondary labels (`deal-card-label`), descriptions, notes body, button text |
| `text-base` | 16px / 1rem | 1.5rem | Primary body text, spec rows, form inputs, table cells |
| `text-lg` | 18px / 1.125rem | 1.75rem | Card-level headings, deal values (`deal-card-value`), dialog titles |
| `text-xl` | 20px / 1.25rem | 1.75rem | Page section headers |
| `text-2xl` | 24px / 1.5rem | 2rem | Page titles, large stat displays |
| `text-3xl`+ | 30px+ | — | Hero/marketing text only; not used in app UI |

### Font Weights

| Weight | Class | Used For |
|---|---|---|
| 400 | `font-normal` | Body text, descriptions, notes |
| 500 | `font-medium` | Labels, links, secondary headings |
| 600 | `font-semibold` | Card titles, dialog titles, section headers |
| 700 | `font-bold` | Financial values, key data points |

### Typography Role Assignments

| Role | Class | Weight | Notes |
|---|---|---|---|
| Page title | `text-2xl` | `font-semibold` | e.g., "Deals", "Properties" |
| Section header | `text-xl` | `font-semibold` | Major page sections |
| Card heading / address | `text-base` or `text-lg` | `font-semibold` | Primary identifier on a card |
| Financial value | `text-lg` | `font-bold` | Price, ARV, budget amounts |
| Label / field name | `text-sm` | `font-medium` | Above a value, form labels |
| Body / description | `text-sm` | `font-normal` | Notes, paragraph content |
| Caption / timestamp | `text-xs` | `font-normal` | Posted dates, secondary metadata |
| Badge text | `text-xs` | `font-semibold` | Status badges, deal type pills |
| Button text | `text-sm` | `font-medium` | Default button size |
| Input text | `text-base` (mobile) / `text-sm` (desktop) | `font-normal` | Form fields |

### Responsive Scaling Rules

**Avoid** applying responsive size variants to every text element — it creates the illusion of hierarchy without actually changing proportions between elements. Only responsively scale:
- Page-level titles (`text-xl lg:text-2xl`)
- Card primary headings where the card itself grows significantly (`text-base lg:text-lg`)

Everything else should be a fixed size. Choose the desktop-appropriate size and keep it consistent.

### Placeholder Text

Always use `text-muted-foreground` for placeholder text. Never hardcode gray values for placeholders.

---

## Color System

All colors are defined as CSS variables in `client/src/index.css` and mapped to Tailwind tokens in `tailwind.config.ts`.

### Brand / Primary

| Token | Light | Dark | Approx Hex | Used For |
|---|---|---|---|---|
| `primary` | `192 67% 65%` | `192 67% 65%` | `#5BC8DC` | Main CTAs, active states, focus rings, links, active sidebar |
| `primary-foreground` | `0 0% 100%` | `0 0% 100%` | `#FFFFFF` | Text/icons on primary-colored backgrounds |

Primary teal is the same in both light and dark modes.

Hover on primary buttons uses `hover:brightness-90`. Active uses `active:brightness-75`.

### Backgrounds & Surfaces

| Token | Light HSL | Dark HSL | Light Hex | Dark Hex | Used For |
|---|---|---|---|---|---|
| `background` | `0 0% 100%` | `220 13% 9%` | `#FFFFFF` | `#141618` | Page-level canvas |
| `card` | `0 0% 98%` | `220 13% 11%` | `#FAFAFA` | `#191B1F` | Card / panel surfaces |
| `card-border` | `220 13% 94%` | `220 13% 14%` | `#ECEEF3` | `#1F2126` | Card border (slightly different from global border) |
| `sidebar` | `220 9% 96%` | `220 13% 13%` | `#F4F5F7` | `#1D2026` | Sidebar background |
| `popover` | `0 0% 96%` | `220 13% 15%` | `#F5F5F5` | `#212429` | Dropdowns, tooltips, popovers |
| `popover-border` | `220 13% 93%` | `220 13% 18%` | `#EDF0F5` | `#27292F` | Popover border |
| `muted` | `220 13% 95%` | `220 13% 17%` | `#EFF0F3` | `#252830` | Disabled bg, image placeholder bg |
| `accent` | `220 14% 95%` | `220 14% 17%` | `#F0F1F4` | `#23262E` | Hover/selected item backgrounds |
| `secondary` | `220 14% 93%` | `220 14% 18%` | `#EBEDF2` | `#272A31` | Secondary button bg, alternative surfaces |

### Text / Foreground

| Token | Light HSL | Dark HSL | Light Hex | Dark Hex | Used For |
|---|---|---|---|---|---|
| `foreground` | `220 9% 15%` | `220 9% 98%` | `#222529` | `#F8F9FA` | Primary body text, headings |
| `card-foreground` | `220 9% 15%` | `220 9% 98%` | same | same | Text inside cards |
| `muted-foreground` | `220 9% 40%` | `220 9% 72%` | `#5D6576` | `#AAB2BF` | Secondary labels, placeholder text, descriptions |

> **Note on dark `muted-foreground`**: This value was bumped from `65%` → `72%` lightness because the original rendered too dim for secondary labels. Always use `text-muted-foreground` — never hardcode gray values like `text-gray-300/80`.

### Interactive & Semantic

| Token | Light HSL | Dark HSL | Used For |
|---|---|---|---|
| `border` | `220 13% 91%` | `220 13% 18%` | Default borders on all elements |
| `border-2` | `2px` | `2px` | Selected/active card border (e.g. expanded deal card) |
| `input` | `220 13% 80%` | `220 13% 28%` | Input field borders |
| `ring` | `192 67% 65%` | `192 67% 65%` | Focus ring (same as primary) |
| `destructive` | `0 84% 42%` | `0 84% 42%` | Delete, error, warning states |
| `destructive-foreground` | `0 84% 98%` | `0 84% 98%` | Text on destructive backgrounds |
| `sidebar-border` | `220 13% 92%` | `220 13% 16%` | Sidebar dividers |
| `sidebar-accent` | `220 14% 93%` | `220 14% 16%` | Sidebar item hover/active |
| `sidebar-primary` | `192 67% 65%` | `192 67% 65%` | Active sidebar item (same as primary) |

### Status Colors

| Name | Token | Hex | Used For |
|---|---|---|---|
| Online | `status-online` | `#22C55E` | Green dot indicators |
| Away | `status-away` | `#F59E0B` | Yellow/amber dot indicators |
| Busy | `status-busy` | `#EF4444` | Red dot indicators |
| Offline | `status-offline` | `#9CA3AF` | Gray dot indicators |

### Financial / Data Colors

| Name | Token | Hex | Used For |
|---|---|---|---|
| Spread Positive | `spread-positive` | `#22C55E` | Positive P&L, profit, gains |
| Spread Negative | `spread-negative` | `#FF0000` | Negative P&L, losses |

### Chart Colors

| Token | Light HSL | Dark HSL | Used For |
|---|---|---|---|
| `chart-1` | `192 67% 65%` | `192 67% 70%` | Primary series (matches brand) |
| `chart-2` | `142 76% 36%` | `142 76% 65%` | Secondary series, positive |
| `chart-3` | `262 83% 48%` | `262 83% 68%` | Tertiary series |
| `chart-4` | `32 95% 44%` | `32 95% 65%` | Quaternary series |
| `chart-5` | `340 82% 52%` | `340 82% 68%` | Quinary series |

Dark mode chart colors are lightened ~5–20% for readability against dark backgrounds.

### Opaque / Derived Button Borders

The `--opaque-button-border-intensity` variable creates automatic border contrast using CSS relative color syntax:

```css
/* Light mode: -8 (slightly darker than bg) */
/* Dark mode:  +9 (slightly lighter than bg) */
--primary-border: hsl(from hsl(var(--primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
```

These derived borders (`primary-border`, `secondary-border`, etc.) give buttons a subtle edge without hard-coded colors.

---

## Elevation System

Shadows are **disabled** (opacity 0 on all shadow tokens). Depth is expressed through background overlays using pseudo-elements.

| Class | Effect | Trigger | Used On |
|---|---|---|---|
| `hover-elevate` | ~3% white/black overlay | `:hover` | Buttons, badges, list items |
| `hover-elevate-2` | ~8% overlay | `:hover` | Heavier hover states |
| `active-elevate-2` | ~8% overlay | `:active` | Button press state |
| `toggle-elevate` | ~8% overlay | `.toggle-elevated` class | Sidebar toggles, on/off states |

The overlay colors come from:
- Light mode: `--elevate-1: rgba(0,0,0,.03)`, `--elevate-2: rgba(0,0,0,.08)`
- Dark mode: `--elevate-1: rgba(255,255,255,.04)`, `--elevate-2: rgba(255,255,255,.09)`

**Important**: These utilities use `::before`/`::after` pseudo-elements. Elements with `overflow: hidden` will clip the overlay — use carefully on cards.

Escape hatches: `.no-default-hover-elevate`, `.no-default-active-elevate` — remove automatic interaction tint when you need custom hover behavior.

---

## Border Radius

| Token | Value | Used For |
|---|---|---|
| `rounded-sm` | 3px | Checkboxes, tight badges, small inline chips |
| `rounded-md` | 6px | **Default** — buttons, inputs, badges, selects, tooltips, dropdowns |
| `rounded-lg` | 9px | Dialogs, alerts, larger containers, sidebars |
| `rounded-xl` | 12px | Cards, panels |
| `rounded-2xl` | 16px | Large modals or special display elements |
| `rounded-full` | 9999px | Avatar circles, pill indicators |

The custom values override Tailwind defaults in `tailwind.config.ts`.

---

## Spacing Scale

Based on Tailwind's default scale with `--spacing: 0.25rem` (4px base unit).

| Class | Value | Common Use |
|---|---|---|
| `gap-1` / `p-1` | 4px | Tight icon gaps, minimal padding |
| `gap-1.5` / `p-1.5` | 6px | Badge padding, small icon gaps |
| `gap-2` / `p-2` | 8px | Button padding (small), icon-label pairs |
| `gap-3` / `p-3` | 12px | Component internal padding (compact) |
| `gap-4` / `p-4` | 16px | Standard card padding, form field spacing |
| `gap-5` / `p-5` | 20px | Card padding (comfortable) |
| `gap-6` / `p-6` | 24px | Section padding, dialog padding |
| `gap-8` / `p-8` | 32px | Large section spacing |
| `gap-10` / `p-10` | 40px | Page-level padding |

**Standard patterns:**
- Card body padding: `px-4 py-4` or `px-5 py-4`
- Dialog content padding: `p-6`
- Sidebar item padding: `px-3 py-2`
- Form field spacing: `space-y-4`
- Icon-to-label gap: `gap-1.5` or `gap-2`

---

## Borders

| Use | Class | Notes |
|---|---|---|
| Default element border | `border border-border` | Used on cards, inputs, separators |
| Card border | `border border-card-border` | Slightly lighter than `border` |
| Input border | `border border-input` | Slightly darker than `border-border` |
| Popover border | `border border-popover-border` | For dropdown containers |
| Sidebar border | `border border-sidebar-border` | Within sidebar only |
| Primary button border | `border border-primary-border` | Auto-derived from primary color |
| Divider (horizontal) | `border-t border-border` | Section separators |
| Divider (vertical) | `border-l border-border` | Column separators |

Default border width is `1px` (`border` class). Do not use `border-2` unless explicitly needed (e.g., focus outline alternatives).

---

## Icon Sizes

| Class | Size | Used For |
|---|---|---|
| `w-3 h-3` | 12px | Decorative micro-icons, tight spaces |
| `w-3.5 h-3.5` | 14px | Sub-icons in links/buttons (`deal-card-sub-icon`) |
| `w-4 h-4` | 16px | **Standard** — most inline icons, button icons |
| `w-5 h-5` | 20px | Slightly prominent icons, empty state icons |
| `w-6 h-6` | 24px | Section header icons, feature icons |
| `w-8 h-8` | 32px | Loading spinners, placeholder icons |

The `button.tsx` base class applies `[&_svg]:size-4` automatically — icons inside buttons are always 16px unless overridden.

Icon color is inherited from text color by default. Use `text-muted-foreground` for decorative/secondary icons, `text-foreground` for interactive icons that need to be clearly visible.

---

## Button Component

Defined in `client/src/components/ui/button.tsx`. All buttons use `hover-elevate active-elevate-2` from the elevation system plus `rounded-md` by default.

### Variants

| Variant | Background | Border | Text | Used For |
|---|---|---|---|---|
| `default` | `bg-primary` | `border-primary-border` | `text-primary-foreground` | Primary CTAs |
| `secondary` | `bg-secondary` | `border-secondary-border` | `text-secondary-foreground` | Alternative actions |
| `outline` | transparent | `var(--button-outline)` | inherited | Low-emphasis actions, contextual buttons |
| `ghost` | transparent | transparent | inherited | Icon buttons, sidebar items |
| `destructive` | `bg-destructive` | `border-destructive-border` | `text-destructive-foreground` | Delete, irreversible actions |

### Sizes

| Size | Min Height | Padding | Text | Used For |
|---|---|---|---|---|
| `sm` | 32px | `px-3` | `text-xs` | Compact UI, tight layouts |
| `base` | 32px | `px-3 py-1.5` | `text-xs` (mobile) / `text-sm` (lg+) | General use in card/content areas |
| `default` | 36px | `px-4 py-2` | `text-sm` | Standard CTA buttons |
| `lg` | 40px | `px-8` | `text-sm` | Hero/prominent CTAs |
| `icon` | 36×36px | — | — | Icon-only buttons |

Heights are `min-h-*` not `h-*` — buttons expand to fit content rather than truncating.

---

## Badge Component

Defined in `client/src/components/ui/badge.tsx`. Always `rounded-md`, always `text-xs font-semibold`, never wraps (`whitespace-nowrap`).

| Variant | Used For |
|---|---|
| `default` | Primary status, active states |
| `secondary` | Neutral/info labels |
| `destructive` | Error, critical status |
| `outline` | Low-emphasis tags, categories |

Padding: `px-2.5 py-0.5`

---

## Deal Card Utility Classes

Defined in `client/src/styles/deal.components.css`. These are `@layer components` classes for deal card elements specifically.

| Class | Definition | Used For |
|---|---|---|
| `.deal-card-label` | `text-sm text-muted-foreground` | Field label above a value |
| `.deal-card-value` | `text-lg font-bold text-foreground` | Primary financial value |
| `.deal-card-value-empty` | `text-xs font-bold text-muted-foreground` | Placeholder dash when value is absent |
| `.deal-card-icon` | `w-4 h-4 text-muted-foreground` | Spec row icons (bed, bath, sqft) |
| `.deal-card-sub-icon` | `w-3.5 h-3.5` | Icons inside link pills |
| `.deal-card-address` | `text-sm text-muted-foreground truncate` | City/state/zip line |
| `.deal-card-link` | `inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md border border-border bg-muted hover:bg-accent-border transition-colors capitalize` | Photo/link pill buttons |

No responsive size variants — all sizes are fixed. Always use `text-muted-foreground` for secondary text; never hardcode gray values.

---

## Interaction States

All interactive elements follow these patterns:

| State | Pattern |
|---|---|
| Focus (keyboard) | `focus-visible:ring-1 focus-visible:ring-ring` (teal ring) |
| Hover (buttons/badges) | `hover-elevate` utility (overlay tint via pseudo-element) |
| Active/press | `active-elevate-2` utility (stronger overlay) |
| Hover (primary button) | `hover:brightness-90` |
| Active (primary button) | `active:brightness-75` |
| Disabled | `disabled:opacity-50 disabled:pointer-events-none` |
| Selected/checked | `bg-primary text-primary-foreground` |
| Hover (list item / sidebar item) | `hover:bg-accent` |
| Active (sidebar item) | `bg-sidebar-accent` or `toggle-elevate toggle-elevated` |

---

## Forms & Inputs

- Input border: `border border-input rounded-md`
- Input text: `text-base` (16px mobile, shrinks to `text-sm` on desktop via autoscaling)
- Label: `text-sm font-medium text-foreground`
- Helper/error text: `text-xs text-muted-foreground` or `text-xs text-destructive`
- Form field spacing: `space-y-4` between fields, `mb-2` between label and input
- Focus: handled by shadcn/Radix input components via `ring`

---

## Cards

| Property | Value |
|---|---|
| Background | `bg-card` |
| Border | `border border-card-border` or `border border-border` |
| Border radius | `rounded-xl` (12px) |
| Padding | `p-4` or `p-5` |
| Shadow | None (elevation via background color layering) |
| Hover border (deal cards) | `hover:border-primary` |
| Selected border | `border-primary` |

---

## Dialogs / Modals

| Property | Value |
|---|---|
| Border radius | `rounded-lg` (9px) |
| Padding | `p-6` |
| Title | `text-lg font-semibold` |
| Description | `text-sm text-muted-foreground` |
| Overlay | `bg-background/80 backdrop-blur-sm` |
| Max width (standard) | `max-w-lg` |
| Max width (large) | `max-w-2xl` or `max-w-4xl` |

---

## Sidebar

| Property | Value |
|---|---|
| Background | `bg-sidebar` |
| Border | `border-r border-sidebar-border` |
| Width | `w-64` or `w-72` (desktop) |
| Item padding | `px-3 py-2` |
| Item text | `text-sm text-sidebar-foreground` |
| Item hover | `bg-sidebar-accent` |
| Active item | `bg-sidebar-accent text-sidebar-primary font-medium` |

---

## Responsive Patterns

### Layout Shift Points

| Pattern | Breakpoint | Notes |
|---|---|---|
| Sidebar collapses to mobile drawer | `lg` (1024px) | Primary nav collapse |
| Deal card: stacked → side-by-side | `tablet` (850px) | Image sidebar + content |
| Financial grid: 2-col → 3-col | `tablet` (850px) | Deal card financials |
| "Request More Info" button show/hide | `tablet` (850px) | Hidden below, shown inline above |

### Grid Patterns

| Pattern | Classes |
|---|---|
| Property grid (full page) | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` |
| Deal cards (single column) | `flex flex-col gap-3` or `gap-4` |
| Financial data grid (inside card) | `grid-cols-2 tablet:grid-cols-3 gap-x-6 gap-y-3` |
| Form layout (single column) | `flex flex-col space-y-4` |

---

## Dark Mode

The `dark` class on `<html>` swaps all CSS variable tokens. Key behavioral notes:

- Primary teal (`#5BC8DC`) is **identical** in both modes
- All background tokens darken significantly (9%–15% lightness)
- All foreground tokens flip to near-white (98% lightness)
- `muted-foreground` in dark mode is `220 9% 72%` — tuned for readability on dark backgrounds
- Chart colors are lightened 5–20% in dark mode for readability
- Elevation overlays use white-tinted rgba in dark mode (`rgba(255,255,255, .04/.09)`) vs black-tinted in light mode

---

## Deal Type Colors

Hardcoded in `DealCard2.tsx` — not tokenized. These are intentionally brand-specific:

| Type | Background | Label |
|---|---|---|
| `wholesale` | `#9333EA` (purple) | "Wholesale" |
| `sold` | `#FF0000` (red) | "Sold" |
| `agent` | `#F97316` (orange) | "Agent" |
| `reo` | `#6366F1` (indigo) | "REO" |

---

## Transaction Type Colors

Hardcoded in `PropertyTransactions.tsx` (`TYPE_COLORS`) — not tokenized, by the same rationale as Deal Type Colors: these are intentionally brand-specific categorical badge colors with no semantic token equivalent. Each badge renders as a translucent tinted background (`/15`), a saturated border (`/30`), and a darker same-hue text shade. Any unmapped type falls back to the `bg-muted text-muted-foreground border-border` tokens.

| Transaction Type | Hue (base) | Background / Border | Text |
|---|---|---|---|
| `arms length` | green `#22C55E` | `bg-[#22C55E]/15` · `border-[#22C55E]/30` | `text-[#16A34A]` |
| `non-arms length` | amber `#F59E0B` | `bg-[#F59E0B]/15` · `border-[#F59E0B]/30` | `text-[#D97706]` |
| `assignment` | purple `#9333EA` | `bg-[#9333EA]/15` · `border-[#9333EA]/30` | `text-[#7E22CE]` |
| `refinance` | blue `#3B82F6` | `bg-[#3B82F6]/15` · `border-[#3B82F6]/30` | `text-[#1D4ED8]` |
| `heloc` | cyan `#06B6D4` | `bg-[#06B6D4]/15` · `border-[#06B6D4]/30` | `text-[#0E7490]` |
| `new construction` | red `#EF4444` | `bg-[#EF4444]/15` · `border-[#EF4444]/30` | `text-[#DC2626]` |
| `acquisition` | brand cyan `#69C9E1` | `bg-[#69C9E1]/15` · `border-[#69C9E1]/30` | `text-[#0891B2]` |

> Like Deal Type Colors, these are an explicit, sanctioned exception to the "never hardcode hex" rule. Do **not** introduce new ad-hoc hex elsewhere — categorical palettes that need this treatment must be documented here first.

---

## Important Instruction
WHen updating or modifying any frontend UI code, look for repeat CSS that can be defined as a tailwind component like in `client/src/deal.components.css`. If found, then create this component. If it does not logically fit in any of the existing file names, then you MUST tell me and ask me if I want to create a new file. Suggest a name, but you MUST request a name suggestion from me and get a finalized response to confirm file name and creationg.

1. If repeat css is found then create the tailwind component using @apply
2. If no file exists that inferences the location of the css component then you MUST inform me and ask to create a new file.
3. If I give you permission to create a new file, you MUST ask me what to name it

### Rules
1. A css component is considered repeat if it is seen 2 or more times
2. If a css component can belong to multiple style files, then it should go in `client/src/index.css`
3. When naming a css component, make sure that the component is named with the file name (ie. `deal-title` would be titles in the deal page and would be put in the `deal.components.css` file)

### Example:
You modify or update a componet on `client/src/pages/Vendors.tsx` and notice the same css (ie. `w-fill mx-auto h-8 grid grid-cols-1`). There is no existing place for vendor specific css so you will request a to create a file. Then at this point await my instruction and go from there.

---

## File Reference

| File | Purpose |
|---|---|
| `tailwind.config.ts` | Token definitions, custom colors, border radius, screens, animations |
| `client/src/index.css` | CSS variable definitions (light + dark), elevation utilities, editor/post styles |
| `client/src/styles/deal.components.css` | Deal card component utility classes |
| `client/src/components/ui/button.tsx` | Button variants and sizes |
| `client/src/components/ui/badge.tsx` | Badge variants |
| `.claude/docs/design-guidelines.md` | This file — the canonical design reference |