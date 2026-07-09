# Typography

Font: `Inter` (Google Fonts, 300–700) → `sans-serif`, wired through `--font-sans` in `index.css`.
Rules owned here: `DS.FIXED-TYPE-SIZE`, `DS.TYPE-FLOOR`.

## Scale

| Class | Size | Line height | Used for |
|---|---|---|---|
| `text-xs` | 12px | 1rem | Timestamps, captions, deal-type badges, sub-labels |
| `text-sm` | 14px | 1.25rem | Secondary labels, descriptions, notes body, button text |
| `text-base` | 16px | 1.5rem | Primary body text, spec rows, form inputs, table cells |
| `text-lg` | 18px | 1.75rem | Card headings, deal values, dialog titles |
| `text-xl` | 20px | 1.75rem | Page section headers |
| `text-2xl` | 24px | 2rem | Page titles, large stat displays |
| `text-3xl`+ | 30px+ | — | Hero/marketing only. Not used in app UI. |

## Weights

| Weight | Class | Used for |
|---|---|---|
| 400 | `font-normal` | Body, descriptions, notes |
| 500 | `font-medium` | Labels, links, secondary headings |
| 600 | `font-semibold` | Card titles, dialog titles, section headers |
| 700 | `font-bold` | Financial values, key data points |

## Role assignments

Pick by role, not by eye. If the role isn't in this table, the closest row is the answer.

| Role | Size | Weight |
|---|---|---|
| Page title | `text-2xl` | `font-semibold` |
| Section header | `text-xl` | `font-semibold` |
| Card heading / address | `text-base` or `text-lg` | `font-semibold` |
| Financial value | `text-lg` | `font-bold` |
| Label / field name | `text-sm` | `font-medium` |
| Body / description | `text-sm` | `font-normal` |
| Caption / timestamp | `text-xs` | `font-normal` |
| Badge text | `text-xs` | `font-semibold` |
| Button text | `text-sm` | `font-medium` |
| Input text | `text-base` mobile / `text-sm` desktop | `font-normal` |

## Responsive scaling — `DS.FIXED-TYPE-SIZE`

Only two elements scale:

```tsx
<h1 className="text-xl lg:text-2xl font-semibold">Deals</h1>   {/* page title */}
<h3 className="text-base lg:text-lg font-semibold">{address}</h3> {/* card heading, growing card */}
```

Everything else picks its desktop-appropriate size and holds it. Scaling every element in a view
moves them all together, so the ratios between them never change — you pay tokens and reflow for
an illusion of hierarchy.

## The 12px floor — `DS.TYPE-FLOOR`

`text-xs` is the minimum for normal UI text. Two functional exceptions may use arbitrary
`text-[Npx]`, and only these:

- **Avatar initials**, sized to the circle. `text-[8px]` in `w-4`, `text-[10px]` in `w-6`
  (`UserAvatar.tsx`, `textClass`). The size scales with the avatar box, so it is a function of the
  container, not a typographic choice.
- **Dense tabular metadata** in the compact transaction list (`PropertyTransactions.tsx`):
  `text-[10px]` / `text-[11px]`.

Anywhere else, `text-[Npx]` is a bug. If text needs to be smaller than 12px to fit, the container
is too small.

## Placeholders

`text-muted-foreground`, always. Never a gray. See `DS.MUTED-FOREGROUND`.