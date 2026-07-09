---
name: smell
description: Code-smell review (Clean Code + Gang of Four + the project's TS/React/Express/Testing catalog) of COMMITTED work, in two modes. `commit` reviews the unpushed commits plus the blast radius of the files they touch — the pre-push check. `pr` reviews the whole branch vs main (the three-dot merge-base diff, identical to the GitHub PR diff) — the pre-merge check. Use when asked to smell-check / code-smell-review a commit or PR, before pushing or opening a PR, or when a workflow should self-review committed changes for smells. Working tree is never included. Not a bug hunt (use /hunt) or a repo-wide audit (use /audit).
argument-hint: "commit | pr [base-or-ref]"
allowed-tools: Bash(bash .claude/skills/smell/scripts/smell-diff.sh:*), Read, Grep, Glob
---

# smell — code-smell review

Two modes, **committed changes only** (the working tree is never reviewed — both modes ask "is
what's *committed* clean?"):

- **`commit`** — the **unpushed commits** (`@{upstream}..HEAD`) plus the **blast radius** of the
  files they touch. Answers _"is what I'm about to push clean?"_
- **`pr`** — the **whole branch vs `main`** (the three-dot merge-base diff, byte-for-byte what
  GitHub shows as the PR). Answers _"is this branch clean to open/merge as a PR?"_

Follow the steps **in order**. Do not skip any. Do not invent findings. Cite catalog IDs verbatim
from [references/catalog.md](references/catalog.md).

---

## Step 1 — Resolve the mode & collect the diff

Parse `$ARGUMENTS`: the first token is the mode (`commit` or `pr`); an optional second token
overrides the base/ref. **If no mode is given, default to `commit`** (the pre-push check) and say
so in the report.

Run the collector with the Bash tool and read its full output before proceeding:

```
bash .claude/skills/smell/scripts/smell-diff.sh <mode> [base-or-ref]
```

It prints the mode, the resolved range, the changed-file list, and the committed diff (`-U10`). In
`commit` mode with nothing unpushed (or no upstream) it falls back to the latest commit
(`HEAD~1..HEAD`) and labels that — carry the label into the report. If it prints an error (unknown
base/mode), stop and surface it.

---

## Step 2 — Blast radius (`commit` mode only — skip for `pr`)

`pr` already spans the whole branch, so its blast radius is itself: **skip this step in `pr`
mode.** In `commit` mode the goal is to catch smells the commit pushes *into its neighbours*, not
only the changed lines:

- For each changed **source** file, use **Grep** to find its **importers** (files that import its
  module path or exported symbols) and read the **project-local modules it imports** — one level
  out, stop at `node_modules` and framework code.
- Pull a neighbour into scope **only** when the commit's change plausibly affects it — a changed
  exported signature, a response/DB shape, a renamed export. A purely local change (a rename
  inside one function, a comment, a self-contained tweak) needs no expansion — say so and move on.
- This mirrors `/hunt`'s rings but stays lighter: you're looking for **smells the change causes**,
  not running an independent review of every caller.

State the resolved scope in one line: `N changed files · M neighbours pulled in` (name the key
ones), or `no blast radius — change is local`.

---

## Step 3 — Classify

Pick **exactly one** category for the overall change and justify in **one sentence**:
`feature` · `refactor` · `bugfix` · `test` · `docs` · `config` · `mixed` (name the dominant one).

---

## Step 4 — Weight the lens

Choose **Clean Code**, **Gang of Four**, or **Mixed**, with a one-sentence rationale. The heuristic
and both reminder sets live in [references/catalog.md](references/catalog.md) — read it now.

---

## Step 5 — Analyze

Walk every hunk in the diff **and** every in-scope neighbour from Step 2. For each issue:

- cite **exactly one** catalog ID from [references/catalog.md](references/catalog.md),
- quote the **smallest** meaningful excerpt,
- one-sentence **why**, one-sentence **fix**.

For hunks that touch **frontend UI** (`.tsx`, Tailwind classes, `client/` CSS), the design-token
rules are owned by the **`ui-design` skill** — invoke it and cite its `DS.*` IDs
(`DS.NO-HARDCODED-COLOR`, `DS.MUTED-FOREGROUND`, …). Do **not** read the retired
`design-guidelines.md`. Don't flag anything Prettier/ESLint already enforce.

---

## Step 6 — Prioritize & report

### Severity ladder
- **BLOCKER** — security, correctness, data-loss, or runtime-crash risk
- **HIGH** — clearly wrong; will regress maintainability or behavior
- **MEDIUM** — design weakness worth fixing now
- **LOW** — minor; in-passing fix
- **NIT** — style preference, no real cost

Sort findings by severity (desc), then by file path. Emit **exactly this structure**:

````markdown
# Smell Report
**Mode:** `<commit | pr>` · **Range:** `<resolved range from Step 1>`
**Classification:** `<feature|refactor|bugfix|test|docs|config|mixed>`
**Primary lens:** `<Clean Code | Gang of Four | Mixed>`
**Blast radius:** `<commit: N changed · M neighbours (key ones); pr: — whole branch>`

## Summary
- Files changed: N `<+ M neighbours in scope, commit mode only>`
- Findings: X blocker, Y high, Z medium, W low, V nit
- Top risk: <one sentence>

## Findings

### [BLOCKER] `TS.NO-AS-ANY` — `path/file.ts:142`
```ts
<smallest meaningful excerpt>
```
**Why:** <one sentence>
**Fix:** <one sentence>

### [HIGH] `GOF.STRATEGY-MISSING` — `path/file.tsx:55-90`
...

## Synthesis
<one paragraph: the dominant theme of the change and the top 3 actions before push/merge>
````

If the diff has no findings, emit the same structure with an empty Findings section and an explicit
"No catalog findings on this diff." line, plus the Synthesis paragraph.

Begin now with Step 1.
