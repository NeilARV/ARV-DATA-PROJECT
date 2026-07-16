# Colors

All tokens are CSS variables in `client/src/index.css`, mapped to Tailwind in `tailwind.config.ts`.
Rule: `DS.NO-HARDCODED-COLOR`. Sanctioned exceptions are at the bottom of this file and nowhere else.

## Contents

- [Brand](#brand)
- [Backgrounds & surfaces](#backgrounds--surfaces)
- [Text](#text)
- [Interactive & semantic](#interactive--semantic)
- [Charts](#charts)
- [Derived button borders](#derived-button-borders)
- [Dark mode](#dark-mode)
- [Sanctioned hex exceptions](#sanctioned-hex-exceptions)

---

## Brand

| Token | Light | Dark | Hex | Used for |
|---|---|---|---|---|
| `primary` | `192 67% 65%` | `192 67% 65%` | `#5BC8DC` | CTAs, active states, focus rings, links, active sidebar |
| `primary-foreground` | `0 0% 100%` | `0 0% 100%` | `#FFFFFF` | Text/icons on primary backgrounds |

Primary teal is identical in both modes. Primary-button hover is `hover:brightness-90`, press is
`active:brightness-75` — not an elevation utility, because a tint over a saturated fill reads muddy.

## Backgrounds & surfaces

| Token | Light HSL | Dark HSL | Light | Dark | Used for |
|---|---|---|---|---|---|
| `background` | `0 0% 100%` | `220 13% 9%` | `#FFFFFF` | `#141618` | Page canvas |
| `card` | `0 0% 98%` | `220 13% 11%` | `#FAFAFA` | `#191B1F` | Card / panel surfaces |
| `card-border` | `220 13% 94%` | `220 13% 14%` | `#ECEEF3` | `#1F2126` | Card border |
| `sidebar` | `220 9% 96%` | `220 13% 13%` | `#F4F5F7` | `#1D2026` | Sidebar background |
| `popover` | `0 0% 96%` | `220 13% 15%` | `#F5F5F5` | `#212429` | Dropdowns, tooltips, popovers |
| `popover-border` | `220 13% 93%` | `220 13% 18%` | `#EDF0F5` | `#27292F` | Popover border |
| `muted` | `220 13% 95%` | `220 13% 17%` | `#EFF0F3` | `#252830` | Disabled bg, image placeholders |
| `accent` | `220 14% 95%` | `220 14% 17%` | `#F0F1F4` | `#23262E` | Hover / selected item backgrounds |
| `secondary` | `220 14% 93%` | `220 14% 18%` | `#EBEDF2` | `#272A31` | Secondary button bg, alt surfaces |

`card-border` is deliberately lighter than `border`. `input` is deliberately darker. Don't
substitute one for another to save a character.

## Text

| Token | Light HSL | Dark HSL | Light | Dark | Used for |
|---|---|---|---|---|---|
| `foreground` | `220 9% 15%` | `220 9% 98%` | `#222529` | `#F8F9FA` | Body text, headings |
| `card-foreground` | `220 9% 15%` | `220 9% 98%` | same | same | Text inside cards |
| `muted-foreground` | `220 9% 40%` | `220 9% 72%` | `#5D6576` | `#AAB2BF` | Secondary labels, placeholders, descriptions |

Dark `muted-foreground` was raised from 65% to 72% lightness because the original rendered too dim.
See `DS.MUTED-FOREGROUND` — hardcoding a gray discards this.

## Interactive & semantic

| Token | Light HSL | Dark HSL | Used for |
|---|---|---|---|
| `border` | `220 13% 91%` | `220 13% 18%` | Default borders |
| `input` | `220 13% 80%` | `220 13% 28%` | Input field borders |
| `ring` | `192 67% 65%` | `192 67% 65%` | Focus ring (same as primary) |
| `destructive` | `0 84% 42%` | `0 84% 42%` | Delete, error, warning |
| `destructive-foreground` | `0 84% 98%` | `0 84% 98%` | Text on destructive backgrounds |
| `sidebar-border` | `220 13% 92%` | `220 13% 16%` | Sidebar dividers |
| `sidebar-accent` | `220 14% 93%` | `220 14% 16%` | Sidebar item hover/active |
| `sidebar-primary` | `192 67% 65%` | `192 67% 65%` | Active sidebar item |

Status dots use tokens, not raw hex: `status-online` `#22C55E`, `status-away` `#F59E0B`,
`status-busy` `#EF4444`, `status-offline` `#9CA3AF`. Financial deltas use `spread-positive`
`#22C55E` and `spread-negative` `#FF0000`. Reference them by token name.

## Charts

| Token | Light HSL | Dark HSL | Role |
|---|---|---|---|
| `chart-1` | `192 67% 65%` | `192 67% 70%` | Primary series (matches brand) |
| `chart-2` | `142 76% 36%` | `142 76% 65%` | Secondary / positive |
| `chart-3` | `262 83% 48%` | `262 83% 68%` | Tertiary |
| `chart-4` | `32 95% 44%` | `32 95% 65%` | Quaternary |
| `chart-5` | `340 82% 52%` | `340 82% 68%` | Quinary |

Dark values are lightened 5–20% for contrast against dark backgrounds.

## Derived button borders

`--opaque-button-border-intensity` generates border contrast from the fill via CSS relative color:

```css
/* light: -8 (darker than bg) · dark: +9 (lighter than bg) */
--primary-border: hsl(from hsl(var(--primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha);
```

So `primary-border`, `secondary-border`, and `destructive-border` are never written by hand. A new
button variant gets its border for free by following the same pattern.

## Dark mode

The `dark` class on `<html>` swaps every variable. Behavior worth knowing before you debug:

- Primary teal is unchanged across modes.
- Backgrounds land at 9–15% lightness; foregrounds flip to 98%.
- Elevation overlays flip tint: `rgba(0,0,0,.03/.08)` light, `rgba(255,255,255,.04/.09)` dark.
- Chart colors lighten. Nothing else in the chart config changes.

If a component looks right in one mode and wrong in the other, the cause is almost always a
hardcoded value that didn't get a dark variant — grep before you theorize.

---

## Sanctioned hex exceptions

These four palettes are categorical: they encode identity, not semantics, so no token exists or
should. They are the complete list. `scripts/hex-allowlist.txt` is the machine-readable copy —
**edit both together or the check will fail.**

### Deal types — `client/src/components/ui/badge.tsx` variants

The hexes live in the badge component's named variants; `DEAL_TYPE_META` in
`client/src/utils/deals.ts` maps each deal type to its variant (rendered by `DealListRow` /
`DealDetail`). The same palette colors the data-side status UI (`mapPins.constants.ts`,
`PropertyTable.tsx`, `UpdatePropertyDialog.tsx`, `FilterHeader.tsx`).

| Type | Badge variant | Fill | Label |
|---|---|---|---|
| `wholesale` | `purple` | `#9333EA` | Wholesale |
| `sold` | `red` | `#FF0000` | Sold |
| `agent` | `orange` | `#F97316` | Agent |
| `reo` | `indigo` | `#6366F1` | REO |

### Transaction types — `client/src/utils/transactionTypeBadge.ts`

Applied via `transactionTypeBadgeClass` in `PropertyTransactions.tsx` and `TransactionHistory.tsx`.
Each badge is a translucent fill (`/15`), a saturated border (`/30`), and a darker same-hue text
shade. Unmapped types fall back to `bg-muted text-muted-foreground border-border`.

| Type | Base | Fill / border | Text |
|---|---|---|---|
| `arms length` | green | `#22C55E` | `#16A34A` |
| `non-arms length` | amber | `#F59E0B` | `#D97706` |
| `assignment` | purple | `#9333EA` | `#7E22CE` |
| `refinance` | blue | `#3B82F6` | `#1D4ED8` |
| `heloc` | cyan | `#06B6D4` | `#0E7490` |
| `new construction` | red | `#EF4444` | `#DC2626` |
| `acquisition` | brand cyan | `#69C9E1` | `#0891B2` |

### Badge variants — `client/src/components/ui/badge.tsx`

Named variants reusing the palettes above, rendering `text-primary-foreground` on the fill:
`cyan` `#69C9E1`, `green` `#22C55E`, `red` `#FF0000`, `purple` `#9333EA`, `orange` `#F97316`,
`indigo` `#6366F1`.

### Rank medals — `BestBuyersDialog.tsx`, `CompanyDirectory.tsx`, `LeaderboardDialog.tsx`

Tailwind palette utilities, not hex literals. Ordinal placement has no semantic token.

| Rank | Fill | Left-border accent |
|---|---|---|
| 1st | `bg-amber-400 text-white` (dialogs/directory) · `bg-amber-600 text-amber-50` (leaderboard) | `border-l-amber-400` |
| 2nd | `bg-muted-foreground text-background` | `border-l-muted-foreground` |
| 3rd | `bg-amber-700 text-amber-100` | `border-l-amber-700` |

Trophy/rank icon: `text-amber-500`.

### Mention role accents — `MentionDropdownPortal.tsx`

Tints the `@` glyph by target type. Broadcast `text-amber-500`, vendor `text-violet-400`,
user `text-primary`.