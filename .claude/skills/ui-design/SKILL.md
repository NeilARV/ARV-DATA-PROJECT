---
name: ui-design
description: The design system for the ARV Finance Data App — color tokens, typography scale, spacing, breakpoints, elevation, and component variants. Use this whenever writing, modifying, or reviewing any frontend code, including .tsx components, Tailwind class strings, and CSS in client/. Consult it before choosing any color, font size, spacing, radius, or icon size — even for a one-line class change. Also use it when reviewing a diff that touches the UI, when deciding whether repeated CSS should become a Tailwind component, and whenever the words "design", "styling", "theme", "dark mode", "tokens", or "hardcoded color" come up.
argument-hint: "[topic]"
paths:
  - "client/src/**"
  - "tailwind.config.ts"
allowed-tools: Read, Grep, Glob, Bash(${CLAUDE_PROJECT_DIR}/.claude/skills/ui-design/scripts/*)
---

# UI Design System

The operational + enforcement layer for the design system. `react.md` RX.DESIGN-TOKENS and
RX.RESPONSIVE-RESTRAINT defer here.

**Division of labor.** `DESIGN.md` (project root) owns the *identity* ("The Insider's Desk", the
"trusted insider + sharp analyst" personality, `PRODUCT.md`'s anti-references) **and the canonical
statement of every `DS.*` rule** — each is a Named Rule in a DESIGN.md section. This skill owns the
*operational layer*: the which-token-when lookup tables (`references/`) and the machine enforcement
(`scripts/check-hex.sh`). `index.css` + `tailwind.config.ts` own the *values*. Design *work* —
building, redesigning, or auditing a surface — is driven through `/impeccable` (`DESIGN.md` +
`PRODUCT.md` are its context); reach for this skill when you need the exact token, size, or rule to
apply, or to run the hex check.

When any of these disagree, the code is right and the doc is stale; say so. `DESIGN.md` speaks in the
source's own HSL rather than asserting hex, so nothing drifts. Component utility classes live in
`client/src/styles/*.components.css`.

## The five invariants

These apply to every frontend change; everything else is lookup. Their canonical statement — the
*why* — lives in `DESIGN.md`; the one-liners here are the working reminder plus where this skill
enforces them. `DS.BREAKPOINT-DEFAULT` is defined here (DESIGN.md carries no layout section).

- **DS.NO-HARDCODED-COLOR** — Use a semantic token; never a hex literal, `rgb()`, or a Tailwind
  palette color (`text-gray-300`, `bg-slate-800`) in a component. Exactly four sanctioned exceptions
  (deal types, transaction types, badge variants, rank medals) live in `references/colors.md`; a
  fifth must be documented there and in `scripts/hex-allowlist.txt` first. Enforced on a diff by
  `scripts/check-hex.sh`. → canonical: DESIGN.md §2, *The Token-Only Rule*.

- **DS.MUTED-FOREGROUND** — Every piece of secondary text — labels, descriptions, timestamps,
  placeholders, decorative icons — is `text-muted-foreground`, never a hardcoded gray. The single
  most-violated rule in the codebase; the dark-mode value is tuned to 72% lightness and
  `text-gray-300/80` undoes that. → canonical: DESIGN.md §2, *The Muted-Foreground Rule*.

- **DS.NO-SHADOWS** — Shadow tokens are zero-opacity. Depth comes from the elevation utilities
  (`hover-elevate`, `active-elevate-2`, `toggle-elevate`), painted via `::before`/`::after`. A parent
  with `overflow: hidden` clips the overlay — use the escape hatch, not a shadow. → canonical:
  DESIGN.md §4, *The Flat-By-Default* / *Overlay-Not-Shadow* Rules.

- **DS.FIXED-TYPE-SIZE** — Text sizes are fixed. Responsively scale exactly two things: page titles
  (`text-xl lg:text-2xl`) and a card's primary heading when the card itself grows
  (`text-base lg:text-lg`). Scaling everything moves every element in lockstep — the appearance of
  hierarchy, none of the proportion. → canonical: DESIGN.md §3, *The Fixed-Scale Rule*.

- **DS.BREAKPOINT-DEFAULT** — `lg:` (1024px) is the default responsive breakpoint. `tablet:`
  (850px) exists for deal-card layout shifts only. Never stack `sm:`/`md:`/`lg:` on the same
  property — if you find yourself doing it, the layout wants restructuring, not more variants.
  Defined here; `references/layout.md` owns the breakpoint table.

## Where to look things up

Read the file you need. Do not read all four.

| You are choosing | Read |
|---|---|
| A color, a token, dark-mode behavior, or one of the sanctioned hex palettes | `references/colors.md` |
| A font size, weight, or the role a piece of text plays | `references/typography.md` |
| A breakpoint, spacing value, border radius, icon size, or grid pattern | `references/layout.md` |
| A button/badge/card/dialog/sidebar/input variant, or an interaction state | `references/components.md` |
| Whether repeated CSS should become a `@apply` component | `references/css-extraction.md` |

`scripts/check-hex.sh [path...]` greps a diff for unsanctioned color literals. It reads
`scripts/hex-allowlist.txt`. Run it rather than eyeballing — it is exact, it is instant, and it
is the same check the pre-commit hook runs, so a clean run means the commit will pass.

## Reaching for a value you can't find

If no token fits, that is information. Do not invent a hex. Say which token you considered, why
it fails, and stop. A missing token is a design decision, not a formatting problem, and it gets
made once, in `index.css`, rather than eleven times across eleven components.