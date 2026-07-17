# Components

Variants, sizes, and interaction states for shared primitives. `DS.INTERACTION-STATES` is defined
here; `DS.NO-SHADOWS` (elevation) has its canonical statement in `DESIGN.md` §4 — this file owns the
elevation-utility and interaction-state tables that apply it.

## Contents

- [Elevation](#elevation)
- [Interaction states](#interaction-states)
- [Button](#button)
- [Badge](#badge)
- [Card](#card)
- [Dialog](#dialog)
- [Sidebar](#sidebar)
- [Forms & inputs](#forms--inputs)
- [Deal card utility classes](#deal-card-utility-classes)

---

## Elevation

Shadows are disabled (zero opacity on every shadow token). Depth is an overlay painted by
`::before`/`::after` pseudo-elements.

| Class | Effect | Trigger | Used on |
|---|---|---|---|
| `hover-elevate` | ~3% overlay | `:hover` | Buttons, badges, list items |
| `hover-elevate-2` | ~8% overlay | `:hover` | Heavier hover states |
| `active-elevate-2` | ~8% overlay | `:active` | Button press |
| `toggle-elevate` | ~8% overlay | `.toggle-elevated` class | Sidebar toggles, on/off states |

Overlay values: light `--elevate-1: rgba(0,0,0,.03)` / `--elevate-2: rgba(0,0,0,.08)`;
dark `rgba(255,255,255,.04)` / `rgba(255,255,255,.09)`.

**The pseudo-element trap:** an ancestor with `overflow: hidden` clips the overlay, so the element
silently loses its hover state. This bites on cards with rounded images. Escape hatches:
`.no-default-hover-elevate`, `.no-default-active-elevate` — use them when you need custom hover
behavior, not to work around the clip. Fix the clip.

## Interaction states

`DS.INTERACTION-STATES` — these are the whole vocabulary. A new interactive element picks from
this table; it does not invent a hover.

| State | Pattern |
|---|---|
| Focus (keyboard) | `focus-visible:ring-1 focus-visible:ring-ring` |
| Hover (buttons/badges) | `hover-elevate` |
| Active / press | `active-elevate-2` |
| Hover (primary button) | `hover:brightness-90` |
| Active (primary button) | `active:brightness-75` |
| Disabled | `disabled:opacity-50 disabled:pointer-events-none` |
| Selected / checked | `bg-primary text-primary-foreground` |
| Hover (list / sidebar item) | `hover:bg-accent` |
| Active (sidebar item) | `bg-sidebar-accent` or `toggle-elevate toggle-elevated` |

## Button

`client/src/components/ui/button.tsx`. Base class applies `hover-elevate active-elevate-2` and
`rounded-md`.

| Variant | Background | Border | Text | Used for |
|---|---|---|---|---|
| `default` | `bg-primary` | `border-primary-border` | `text-primary-foreground` | Primary CTAs |
| `secondary` | `bg-secondary` | `border-secondary-border` | `text-secondary-foreground` | Alternative actions |
| `outline` | transparent | `var(--button-outline)` | inherited | Low-emphasis, contextual |
| `ghost` | transparent | transparent | inherited | Icon buttons, sidebar items |
| `destructive` | `bg-destructive` | `border-destructive-border` | `text-destructive-foreground` | Delete, irreversible |

| Size | Min height | Padding | Text |
|---|---|---|---|
| `sm` | 32px | `px-3` | `text-xs` |
| `base` | 32px | `px-3 py-1.5` | `text-xs` mobile / `text-sm` lg+ |
| `default` | 36px | `px-4 py-2` | `text-sm` |
| `lg` | 40px | `px-8` | `text-sm` |
| `icon` | 36×36px | — | — |

Heights are `min-h-*`, not `h-*` — buttons grow to fit rather than truncating. Preserve that when
adding a size.

## Badge

`client/src/components/ui/badge.tsx`. Always `rounded-md`, always `text-xs font-semibold`, never
wraps (`whitespace-nowrap`). Padding `px-2.5 py-0.5`.

| Variant | Used for |
|---|---|
| `default` | Primary status, active states |
| `secondary` | Neutral / info labels |
| `destructive` | Error, critical status |
| `outline` | Low-emphasis tags, categories |

Named categorical variants (`cyan`, `green`, `red`, `purple`, `orange`, `indigo`) reuse the
sanctioned palettes in `colors.md`. Do not add a hex-backed variant without documenting it there
and in `scripts/hex-allowlist.txt`.

## Card

| Property | Value |
|---|---|
| Background | `bg-card` |
| Border | `border border-card-border` (or `border-border`) |
| Radius | `rounded-xl` |
| Padding | `p-4` or `p-5` |
| Shadow | none — see [Elevation](#elevation) |
| Hover border (deal cards) | `hover:border-primary` |
| Selected border | `border-primary` |

## Dialog

| Property | Value |
|---|---|
| Radius | `rounded-lg` |
| Padding | `p-6` |
| Title | `text-lg font-semibold` |
| Description | `text-sm text-muted-foreground` |
| Overlay | `bg-background/80 backdrop-blur-sm` |
| Max width | `max-w-lg` standard · `max-w-2xl` / `max-w-4xl` large |

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

## Forms & inputs

- Border: `border border-input rounded-md`
- Text: `text-base` (16px on mobile — below this iOS zooms on focus), shrinking to `text-sm` on desktop
- Label: `text-sm font-medium text-foreground`
- Helper text: `text-xs text-muted-foreground` · error: `text-xs text-destructive`
- Spacing: `space-y-4` between fields, `mb-2` between label and input
- Focus: handled by the shadcn/Radix input primitives via `ring` — don't add your own

## Deal card utility classes

`client/src/styles/deal.components.css`, an `@layer components` block. Fixed sizes, no responsive
variants.

| Class | Definition |
|---|---|
| `.deal-card-label` | `text-sm font-medium text-muted-foreground` |
| `.deal-card-value` | `text-lg font-bold text-foreground` |
| `.deal-card-value-empty` | `text-lg font-bold text-muted-foreground` |
| `.deal-card-icon` | `w-4 h-4 text-muted-foreground` |
| `.deal-card-sub-icon` | `w-3.5 h-3.5` |
| `.deal-card-address` | `text-sm text-muted-foreground truncate` |
| `.deal-card-link` | `inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md border border-border bg-muted hover:bg-accent-border transition-colors capitalize` |

These are the model for extraction. See `css-extraction.md`.