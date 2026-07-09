# Layout

Breakpoints, spacing, radius, borders, icon sizes, grids. Rules owned here: `DS.BREAKPOINT-DEFAULT`,
`DS.NO-STACKED-VARIANTS`, `DS.BORDER-WIDTH`.

## Breakpoints

| Name | Min width | Notes |
|---|---|---|
| `sm` | 640px | Rarely used — avoid unless truly needed |
| `md` | 768px | Mobile → tablet transition |
| `tablet` | 850px | Deal card layout shifts, financial grid columns |
| `lg` | 1024px | **Primary desktop breakpoint** |
| `xl` | 1280px | Wide desktop |
| `2xl` | 1536px | Ultrawide, rarely needed |

`DS.NO-STACKED-VARIANTS` — never put `sm:`, `md:`, and `lg:` on the same property. Three
breakpoints on one value means the element is doing three different jobs and wants to be
restructured, not tuned.

### Where the layout actually shifts

| Pattern | Breakpoint |
|---|---|
| Sidebar → mobile drawer | `lg` (1024px) |
| Deal card: stacked → side-by-side | `tablet` (850px) |
| Financial grid: 2-col → 3-col | `tablet` (850px) |
| "Request More Info" show/hide | `tablet` (850px) |

## Spacing

Tailwind default scale, `--spacing: 0.25rem` (4px base).

| Class | Value | Common use |
|---|---|---|
| `1` | 4px | Tight icon gaps |
| `1.5` | 6px | Badge padding, small icon gaps |
| `2` | 8px | Small button padding, icon-label pairs |
| `3` | 12px | Compact internal padding |
| `4` | 16px | Standard card padding, form field spacing |
| `5` | 20px | Comfortable card padding |
| `6` | 24px | Section padding, dialog padding |
| `8` | 32px | Large section spacing |
| `10` | 40px | Page-level padding |

Standing patterns: card body `px-4 py-4` or `px-5 py-4` · dialog content `p-6` · sidebar item
`px-3 py-2` · form fields `space-y-4` · icon-to-label `gap-1.5` or `gap-2`.

## Border radius

Custom values override Tailwind defaults in `tailwind.config.ts`.

| Token | Value | Used for |
|---|---|---|
| `rounded-sm` | 3px | Checkboxes, tight badges, inline chips |
| `rounded-md` | 6px | **Default** — buttons, inputs, badges, selects, tooltips, dropdowns |
| `rounded-lg` | 9px | Dialogs, alerts, larger containers, sidebars |
| `rounded-xl` | 12px | Cards, panels |
| `rounded-2xl` | 16px | Large modals, special display elements |
| `rounded-full` | 9999px | Avatars, pill indicators |

## Borders

| Use | Class |
|---|---|
| Default element | `border border-border` |
| Card | `border border-card-border` |
| Input | `border border-input` |
| Popover | `border border-popover-border` |
| Sidebar | `border border-sidebar-border` |
| Primary button | `border border-primary-border` |
| Horizontal divider | `border-t border-border` |
| Vertical divider | `border-l border-border` |

`DS.BORDER-WIDTH` — default width is 1px (`border`). `border-2` is reserved for the
selected/active card state (e.g. an expanded deal card). Don't use it as a focus outline
substitute; focus is `focus-visible:ring-1 focus-visible:ring-ring`.

## Icon sizes

| Class | Size | Used for |
|---|---|---|
| `w-3 h-3` | 12px | Decorative micro-icons |
| `w-3.5 h-3.5` | 14px | Sub-icons in links/buttons (`deal-card-sub-icon`) |
| `w-4 h-4` | 16px | **Standard** — inline and button icons |
| `w-5 h-5` | 20px | Prominent icons, empty-state icons |
| `w-6 h-6` | 24px | Section header icons, feature icons |
| `w-8 h-8` | 32px | Loading spinners, placeholder icons |

`button.tsx` applies `[&_svg]:size-4` to its base class, so icons inside buttons are 16px without
you asking. Overriding that is usually a sign the icon doesn't belong in a button.

Icon color inherits from text. `text-muted-foreground` for decorative, `text-foreground` for
interactive icons that must be legible.

## Grid patterns

| Pattern | Classes |
|---|---|
| Property grid (full page) | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` |
| Deal cards (single column) | `flex flex-col gap-3` or `gap-4` |
| Financial data grid (in card) | `grid-cols-2 tablet:grid-cols-3 gap-x-6 gap-y-3` |
| Form layout | `flex flex-col space-y-4` |