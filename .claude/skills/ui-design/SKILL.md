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

Owns the `DS.*` rule IDs. `react.md` RX.DESIGN-TOKENS and RX.RESPONSIVE-RESTRAINT defer here.

Token definitions live in `tailwind.config.ts` and `client/src/index.css`. Component utility
classes live in `client/src/styles/deal.components.css`. This skill is the reference for what
those files mean and when to reach for each value — it is not a copy of them. When they disagree,
the code is right and this skill is stale; say so.

## The five invariants

These apply to every frontend change. Everything else is lookup.

- **DS.NO-HARDCODED-COLOR** — Never write a hex literal, `rgb()`, or a Tailwind palette color
  (`text-gray-300`, `bg-slate-800`) in a component. Use a semantic token. There are exactly four
  sanctioned exceptions (deal types, transaction types, badge variants, rank medals), all listed
  in `references/colors.md`. Adding a fifth requires documenting it there first.
  `scripts/check-hex.sh` enforces this on a diff.

- **DS.MUTED-FOREGROUND** — Every piece of secondary text — labels, descriptions, timestamps,
  placeholders, decorative icons — is `text-muted-foreground`. This is the single most-violated
  rule in the codebase; the dark-mode value was specifically tuned (72% lightness) so that it
  works, and hardcoding `text-gray-300/80` undoes that tuning.

- **DS.NO-SHADOWS** — Shadow tokens are set to zero opacity. Depth comes from the elevation
  utilities (`hover-elevate`, `active-elevate-2`, `toggle-elevate`), which paint an overlay via
  `::before`/`::after`. Consequence worth remembering: a parent with `overflow: hidden` clips the
  overlay, so a card that needs both needs the escape hatch, not a shadow.

- **DS.BREAKPOINT-DEFAULT** — `lg:` (1024px) is the default responsive breakpoint. `tablet:`
  (850px) exists for deal-card layout shifts only. Never stack `sm:`/`md:`/`lg:` on the same
  property — if you find yourself doing it, the layout wants restructuring, not more variants.

- **DS.FIXED-TYPE-SIZE** — Text sizes are fixed. Responsively scale exactly two things: page
  titles (`text-xl lg:text-2xl`) and card primary headings when the card itself grows
  (`text-base lg:text-lg`). Scaling everything moves every element in lockstep, which produces
  the appearance of hierarchy while changing none of the actual proportions.

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