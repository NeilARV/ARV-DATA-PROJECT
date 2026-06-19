---
description: Audit the whole codebase (.ts/.tsx) against the project standards and report drift, grouped by rule
argument-hint: "[client|server|<path>|<file>] [--clean-code] [--gof]   # keyword, dir, or a single .ts/.tsx file; defaults to whole repo"
allowed-tools: Glob, Grep, Read
---

# /audit — Full codebase drift audit

You are auditing the codebase against the project standards. Unlike `/smell` (which reviews a single diff), this scans **all `.ts`/`.tsx` source files** and reports where the code has drifted from canon. Follow the steps **in order**. Cite catalog IDs **verbatim** from the standard files referenced below — never invent an ID.

## Catalog (single source of truth — same as `/smell`)

The authoritative rule definitions live in these files. Read them and cite IDs from them verbatim:

@.claude/docs/standards/typescript.md
@.claude/docs/standards/react.md
@.claude/docs/standards/express.md
@.claude/docs/standards/database.md

> The grep patterns in Step 2 are **detection heuristics**, not the source of truth. If a pattern's label and the canonical file disagree on an ID name, the canonical file wins — cite that.

---

## Step 1 — Scope & inventory

Read `$ARGUMENTS` and resolve the scope yourself (don't shell out for this). The first non-`--` token is the scope; `--clean-code`/`--gof` are flags handled in Step 3.

Map the scope token to glob roots:

| Scope token | Glob roots to inventory |
|---|---|
| `client` | `client/**/*.ts`, `client/**/*.tsx` |
| `server` | `server/**/*.ts`, `database/**/*.ts` |
| *(empty)* / `all` / `repo` | `**/*.ts`, `**/*.tsx` |
| a directory, e.g. `server/services` | `<dir>/**/*.ts`, `<dir>/**/*.tsx` |
| a single file ending in `.ts`/`.tsx` | the file itself |

Then inventory with the **Glob** tool (not Bash):

- **Single file** — if the scope token ends in `.ts`/`.tsx`, treat it as the only file in scope; skip the layer breakdown and go straight to Step 2 on that one file. If it ends in any other extension, stop and report that only `.ts`/`.tsx` files are audited.
- **Directory / keyword / whole repo** — run the Glob roots above. Ignore `node_modules`, `dist`, `build`, `.next`, `*.d.ts`, and `*.gen.ts`. Report the file count and a per-layer breakdown (count of files under `server/routes`, `server/controllers`, `server/services`, `server/middleware`, `database`, `client/src/components`, `client/src/hooks`, `client/src/pages` — list only the non-empty ones).
- If the Glob roots match **zero** files, stop and report that nothing was found for the given scope, suggesting a keyword (`client`/`server`), a directory, or a single file.

> The scope determines which rule families matter: a **`client`** run only meaningfully triggers `RX.*` and `TS.*`; a **`server`** run triggers `EX.*`, `DB.*`, `TS.*`, and `ARV.*`. For a **single file**, infer the relevant families from its path and extension (a `.tsx` under `client/` → `RX.*`/`TS.*`; a `.ts` under `server/` or `database/` → `EX.*`/`DB.*`/`TS.*`/`ARV.*`). Skip families that can't apply rather than reporting them as clean.

**If the file count is large (say >150),** do **not** attempt to read every file. State that, and proceed with Step 2 (mechanical, scales to any size) for the whole scope, then run Step 3 (semantic) **one layer at a time**, noting that the user can re-run scoped (`/audit server/services`) for a deeper pass on any layer.

---

## Step 2 — Mechanical sweep (deterministic)

Run these targeted searches across the in-scope `.ts`/`.tsx` files. Each row maps a textual signature to a canonical rule. Run them, collect `file:line` hits, and discard obvious false positives (note when you do). These are the high-signal, high-confidence findings.

> Run each search with the **Grep** tool (not Bash). Use its `glob` filter to stay in scope (`*.ts`, `*.tsx`) and its `path` filter for layer-specific rules (e.g. restrict `EX.NO-HTTP-IN-SERVICE` to `server/services`). Use output mode with line numbers so each hit is a `file:line`. Patterns are starting points — tighten per hit and discard false positives.

### TypeScript
| Rule | Pattern (heuristic) | Notes |
|---|---|---|
| `TS.NO-ANY` | `:\s*any\b` , `<any>` | exclude `// eslint` lines; each hit is a real finding |
| `TS.NO-AS-ANY` | `\bas any\b` | banned outright |
| `TS.NO-NON-NULL` | `[\w\)\]]!\.` , `[\w\)\]]!\)` | filter out `!==`/`!=` by hand |
| `TS.NO-TS-IGNORE` | `@ts-ignore` | `@ts-expect-error` is allowed; don't flag it |
| `TS.ES-MODULES` | `\brequire\(` , `module\.exports` | should be zero |
| `TS.ARRAY-SHORTHAND` | `\bArray<` | prefer `T[]` |
| `TS.NO-PARAM-PROPS` | `constructor\((private\|public\|readonly)` | |

### React (client only)
| Rule | Pattern | Notes |
|---|---|---|
| `RX.FUNCTION-COMPONENT` | `extends (React\.)?Component` , `createReactClass` | no class components |
| `RX.NO-RAW-FETCH` | `\bfetch\(` in `client/` | must go through `apiRequest`/TanStack |
| `RX.STABLE-KEY` | `key=\{.*\bindex\b` , `key=\{i\}` | index-as-key |
| `RX.NO-SPREAD-PROPS` | `\{\.\.\.props\}` | blind spread |
| `RX.DESIGN-TOKENS` | `text-gray-` , `bg-gray-` , `#[0-9a-fA-F]{3,6}` in `className` | hardcoded color |

### Express / services / controllers
| Rule | Pattern | Notes |
|---|---|---|
| `EX.NO-HTTP-IN-SERVICE` | in `services/`: `\b(req\|res\|next)\b` , `from "express"` | services must be HTTP-free |
| `EX.NO-DB-IN-CONTROLLER` | in `controllers/`: `\bdb\.` , `import .*\bdb\b` , `drizzle` | DB belongs in services |
| `EX.NO-LOGIC-IN-ROUTES` | in `*.routes.ts`: `\b(await\|db\.\|if\s*\()` | routes wire only |
| `EX.ZOD-SAFEPARSE` | in `controllers/`: `\.parse\(` (without `safe`) | should be `safeParse` |
| `EX.NO-EMPTY-CATCH` | `catch\s*\([^)]*\)\s*\{\s*\}` , `catch\s*\{\s*\}` | swallowed errors |
| `EX.AUTH-ORDER` | router lines with `requireRole`/`requireSub` but no preceding `requireAuth` | review each hit |

### Drizzle / DB
| Rule | Pattern | Notes |
|---|---|---|
| `DB.SINGLE-CLIENT` | `drizzle\(` , `neon\(` , `new Pool` outside the canonical `db` module | inline client |
| `DB.DRIZZLE-ONLY` | `db\.execute\(` , string-concatenated `sql` | raw SQL |
| `DB.LIMIT1-DESTRUCTURE` | `await db[^\n]*\)\[0\]` , `rows\[0\]` after a select | should be `.limit(1)` + destructure |

### Project-specific
| Rule | Pattern | Notes |
|---|---|---|
| `ARV.SECRET-ACCESS` | `process\.env\.` outside config , `readFile.*\.env` | review each — some config reads are legitimate |
| `ARV.RAW-COMPANY-NAME` | company-name render/return without `formatCompanyName` | semantic — confirm in Step 3 |

**Explicitly do NOT flag** rules that Prettier/ESLint already enforce: import order (`TS.IMPORT-ORDER`), self-closing tags (`RX.SELF-CLOSE`), boolean props (`RX.BOOL-PROP`), JSX quote style (`RX.JSX-QUOTES`), unused vars (`TS.NO-UNUSED`), and exhaustive-deps/rules-of-hooks (`RX.EFFECT-DEPS`, `RX.HOOKS-RULES`) **if** an ESLint config owns them. Note that the linter owns these rather than reporting them.

---

## Step 3 — Semantic pass (read, scoped & batched)

Some canonical rules can't be grepped — they need reading. **If the scope is a single file, read it in full and apply every relevant rule.** Otherwise do this **one layer at a time**, and **only for layers that exist in the resolved scope** (a `client` run skips the Express/DB layers entirely; a `server` run skips the React layers). Within scope, cover the highest-risk layers first: `services/` → `controllers/` → `hooks/` → `components/`.

For each layer, check the rules grep can't confirm:

- **Layering** (`EX.LAYER-SEPARATION`, `EX.NO-DB-IN-CONTROLLER`, `EX.NO-HTTP-IN-SERVICE`): confirm each controller delegates to a service and each service is HTTP-free (beyond the grep signal).
- **Controllers** (`EX.CONTROLLER-TRY-CATCH`, `EX.RETURN-AFTER-SEND`, `EX.NO-LEAK-INTERNALS`): whole body wrapped in try/catch; `return` after every send; 500s return a generic `{ message }`.
- **Validation** (`EX.ZOD-ALL-INPUT`): every external input validated before use.
- **Services** (`EX.SERVICE-RAW-DATA`, `EX.SERVICE-NULL-NOT-UNDEFINED`, `DB.NO-NPLUS1`): raw data not `{success,data}`; `T | null` not `undefined`; no `await db` inside a loop.
- **React** (`RX.SERVER-STATE-QUERY`, `RX.NO-DERIVED-STATE`, `RX.PROVIDER-GUARD`, `RX.EFFECT-CLEANUP`, `RX.NO-NESTED-COMPONENTS`): server data in TanStack Query not `useState`; no prop→state mirroring; context hooks throw outside Provider; subscriptions/timers cleaned up; no components declared inside components.
- **Types** (`TS.RETURN-TYPE`, `TS.DERIVE-TYPES`): exported fns annotate return type; row/insert types derived via `$inferSelect`/`z.infer`, not hand-written.

> Optional secondary lens (off by default): if the user passes `--clean-code` or `--gof` in `$ARGUMENTS`, also apply the Clean Code / Gang-of-Four reminders from `/smell`. Skipped otherwise to keep repo-scale signal high.

---

## Step 4 — Aggregate & report

Group findings **by rule** (not by file) so systemic drift is visible, then list a per-file worst-offenders rollup. Use the same severity ladder as `/smell`:

- **BLOCKER** — security, correctness, data-loss, or crash risk
- **HIGH** — clearly wrong; regresses maintainability or behavior
- **MEDIUM** — design weakness worth fixing
- **LOW** — minor
- **NIT** — style; no real cost

Emit **exactly this structure**:

````markdown
# Audit Report
**Scope:** `<path or "whole repo">`
**Files scanned:** N (.ts/.tsx)

## Summary
- Total findings: X blocker, Y high, Z medium, W low, V nit
- Rules violated: K distinct
- Systemic drift (rule violated in ≥5 files): <list rule IDs, or "none">
- Top risk: <one sentence>

## Findings by rule
Sorted by severity (desc), then violation count (desc).

### [BLOCKER] `EX.NO-LEAK-INTERNALS` — 4 occurrences
- `server/controllers/deals/deals.controllers.ts:88`
- `server/controllers/users/users.controllers.ts:142`
- ...
**Why:** <one sentence>
**Fix:** <one sentence — note if a single codemod covers all occurrences>

### [HIGH] `RX.SERVER-STATE-QUERY` — 11 occurrences
...

## Worst-offender files
| File | Findings | Highest severity |
|---|---|---|
| `server/controllers/deals/...` | 6 | BLOCKER |
| ... | | |

## Clean rules
Rules with **zero** violations in scope (confirms these conventions are holding): <comma-separated IDs>.

## Synthesis
<one paragraph: the dominant drift themes, which are systemic (codemod-worthy) vs one-off, and the top 3 actions in priority order. Note any layer that needs a deeper scoped re-run.>
````

If no findings: emit the same structure with empty Findings, an explicit "No catalog drift found in scope." line, the Clean-rules list, and the Synthesis paragraph.

Begin now with Step 1.