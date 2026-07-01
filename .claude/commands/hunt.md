---
description: Hunt a file or folder (plus its local helpers) for real bugs and issues — logic, runtime, data-flow, and robustness (plus security/perf/config on request). Reports up to 5 real findings, tier-ordered, or none.
argument-hint: "<file-or-folder> [categories] [focus]"
allowed-tools: Read, Grep, Glob, Bash(ls:*), Bash(find:*)
---

# /hunt — Bug & issue hunt

You are hunting for **real bugs and issues** in the given code: logic errors, runtime failures, broken data flow, and robustness gaps — and, when asked, security, performance, and config problems. A "bug" here is anything that makes the code behave wrong, crash, corrupt data, leak resources, or perform badly — not just a mismatch with intent. This is **not** `/smell` (style/design) and **not** `/security-review` (that's a dedicated security pass). Stay in your lane: things that are actually *wrong*, not things that are merely written differently than you'd prefer.

Follow the steps **in order**. The single most important rule: **finding nothing is a success, not a failure. Never pad the report to reach 5.** A confabulated bug is worse than a missed one because it wastes the reader's trust. Cite category IDs verbatim from the catalog in Step 3.

Raw arguments: `$ARGUMENTS`

---

## Step 1 — Resolve scope

Parse `$ARGUMENTS`:

- **Arg 1 = path** (required) — a file or a folder, relative to repo root.
- **Remaining args** — optional. Any that match a **category keyword** (Step 3) or a bare **catalog ID** narrow the scan. Everything else is **free-text focus** ("focus on the offer submission flow") that biases *which* findings matter, not which tiers run.

Then:

1. Decide **file vs folder** (`ls`/`find`/`Glob` if unsure).
   - **File** → the target set is that one file.
   - **Folder** → the target set is every `.ts`/`.tsx` file directly under it (recurse subfolders only if the folder is small; otherwise stay one level and say so).
2. **Resolve local helpers, one level deep.** For each target file, read the **project-local** modules it imports and actually uses (helpers, utils, services, shared/database types). **Stop at `node_modules`, framework code, and one level of depth.** You read helpers so a finding in the target is *accurate* (you know the helper's real contract) — and you may flag a helper itself if its bug affects the target.
3. State the resolved scope in one line before hunting: path, file-or-folder, `N` target files, `M` helper files read.

If the path doesn't exist, stop and say so — don't guess.

---

## Step 2 — Determine active tiers

- **No category given → Tiers 1–3** (Correctness, Data & Contract, Robustness). This is the default: security/perf/config are covered by `/security-review` and other tools.
- **Category keyword(s) given →** only those tiers/categories.
- **`all` →** every tier.

Category keywords → tiers:

| Keyword(s) | Tier |
|---|---|
| `logic` `null` `async` `runtime` `correctness` | **1** |
| `data` `contract` `db` `state` `validation` | **2** |
| `robustness` `leak` `errors` | **3** |
| `security` `sec` | **4** (opt-in) |
| `perf` `performance` | **5** (opt-in) |
| `config` `cfg` `infra` | **6** (opt-in) |
| `all` | 1–6 |

A bare catalog ID (e.g. `CORR.NULL-DEREF`) scopes to just that check.

---

## Step 3 — Catalog (cite IDs verbatim; do not invent)

Scan tiers **top-down**: fully exhaust Tier 1 before considering Tier 2, and so on. A Tier-1 bug always outranks a Tier-3 one for the 5 slots.

### Tier 1 — Correctness / Runtime  (`CORR.*`)
- **CORR.LOGIC** — wrong operator, inverted condition, wrong business rule. *e.g. `count || 10` drops a legitimate `0`; `>` where `>=` was meant.*
- **CORR.NULL-DEREF** — property/method access on a possibly-`undefined` value; `.find()` / `[0]` result used unchecked. *e.g. `deals[0].price` when `deals` may be empty.*
- **CORR.UNSAFE-CAST** — `as any`, `as X`, or `!` masking a real type mismatch that will be wrong at runtime. *e.g. `(req.body as CreateDeal)` with no validation.*
- **CORR.THROW** — an unhandled path that throws on realistic input. *e.g. `JSON.parse(raw)`, `new URL(x)`, `Number(x)` feeding math.*
- **CORR.ASYNC** — missing `await` (floating promise), unhandled rejection, `await` in a loop that should be `Promise.all`, forgotten `return await`, race on shared mutable state.
- **CORR.BOUNDARY** — off-by-one / fencepost / bad slice / pagination math. *e.g. `page * size` where `(page - 1) * size` was meant.*

### Tier 2 — Data & Contract  (`DATA.*`)
- **DATA.CONTRACT** — client/server shape mismatch across the wire: field name, nesting, type, or status code differ between producer and consumer. *e.g. server sends `{ items }`, client reads `data.results`.*
- **DATA.DB-WHERE** — Drizzle `update`/`delete` missing `.where(...)` → whole-table mutation. **(BLOCKER)**
- **DATA.DB-NPLUS1** — a query inside a `.map`/loop instead of one query or a join.
- **DATA.DB-LIMIT1** — single-row query not `.limit(1)` and/or not destructured `[row]`; an array used where one row is expected.
- **DATA.DB-DRIFT** — query/insert references a column, enum, or table that doesn't match the schema.
- **DATA.VALIDATION** — `req.body` / params / query used without Zod `safeParse`; client input trusted.
- **DATA.STATE** — React stale closure, missing/incorrect `useEffect` dependency, direct state mutation, or derived state that can desync from its source.

### Tier 3 — Robustness / Lifecycle  (`ROB.*`)
- **ROB.LEAK** — missing `useEffect` cleanup, uncleared `setInterval`/`setTimeout`, unremoved listener, un-closed subscription/connection.
- **ROB.SWALLOW** — empty `catch {}` or a catch that neither logs nor surfaces the error.
- **ROB.LEAK-INTERNAL** — internal error text, stack, or SQL returned to the client (see `EX.NO-LEAK-INTERNALS`).
- **ROB.DEAD** — unreachable code (after `return`/`throw`), an impossible branch, or an unused export that looks load-bearing.
- **ROB.LOOP** — infinite loop, recursion with no base case, or an effect that re-triggers itself.

### Tier 4 — Security  (`SEC.*`) — opt-in
- **SEC.INJECTION** — raw string interpolation into a SQL/DB query.
- **SEC.XSS** — `dangerouslySetInnerHTML` (or equivalent) with unsanitized user data.
- **SEC.AUTHZ** — route/action missing `requireAuth`/`requireAccess`/`requireRole` or an ownership check.
- **SEC.SECRET** — a secret or `.env` value read, logged, or returned.

### Tier 5 — Performance  (`PERF.*`) — opt-in
- **PERF.RERENDER** — new object/array/function identity each render used as a prop or effect dep where it forces re-renders.
- **PERF.BLOCKING** — synchronous/blocking work on the request path or a hot render path.
- **PERF.UNBOUNDED** — a query or list with no limit/pagination that grows unbounded.

### Tier 6 — Config / Infra  (`CFG.*`) — opt-in
- **CFG.ENV** — wrong/missing env var or Supabase bucket selection; a `NODE_ENV` branch that's inverted.
- **CFG.MERGE** — leftover conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
- **CFG.DEP** — call that doesn't match the installed dependency's actual API/version.

### Cross-cutting lens  (`X.*`) — apply *within* every active tier
These are the "broad" ones. They rarely stand alone; they sharpen the tiers above.
- **X.ASSUMPTION** — code relies on a guarantee that isn't proven: array non-empty, field present, results ordered, exactly-one row, uniqueness. **Name the unproven assumption.**
- **X.INTENT** — code does something different from what its name, JSDoc, or surrounding intent says (miscommunication between what was meant and what was written).
- **X.REGRESSION** — the code plausibly breaks an existing consumer or behavior elsewhere. **Name the caller/site at risk.**

---

## Step 4 — Hunt rules (the part that keeps this honest)

For every candidate finding, it is only a **finding** if it clears the **evidence gate**:

1. **Quote the exact code** (smallest meaningful excerpt) with a `path:line`.
2. **Write the concrete failure:** a real input or state → the wrong output, crash, or corrupted data. If you cannot write the triggering input, it is **not a finding** — drop it.
3. **Confidence must be Confident or Likely.** Anything you'd label *Speculative* does not go in Findings.

Hard constraints:

- **Tier order.** Exhaust higher tiers first; fill the 5 slots from the top down.
- **Cap at 5 findings**, total, across all tiers.
- **Zero is a valid, common, good result.** If the code is correct, say "No correctness issues found in scope." Do **not** invent a nit to avoid an empty report.
- **No style/design nits** (that's `/smell`), **no security unless Tier 4 is active** (that's `/security-review`).
- A helper file may be flagged **only** when its bug changes behavior in the target scope.
- If the free-text focus was given, rank findings that touch that flow first (still within tier order).

You may list up to **2** genuinely uncertain items under a separate **"Worth a look"** heading — clearly marked unverified, never counted toward the 5, never dressed up as confirmed.

---

## Step 5 — Report

Output is **GitHub-flavored markdown** and must render cleanly in the terminal. Follow this structure **exactly** — same headings, same order, same labels — so every run looks identical. Findings are numbered `1..N` in priority order (severity, then tier, then path).

````markdown
# 🎯 Hunt Report

| | |
|---|---|
| **Scope** | `<path>` — <file \| folder>, N target files (+M helpers read) |
| **Categories** | <tiers/keywords scanned, e.g. Tiers 1–3 (default)> |
| **Focus** | <free-text focus, or —> |
| **Result** | **A** blocker · **B** high · **C** medium · **D** low |

> **Top risk:** <one sentence>   ← or, if clean: **No correctness issues found in scope.**

---

## Findings

### 1. <Plain-English title of the bug>

`server/services/emailUpdates.ts:473-514` · **BLOCKER** · `CORR.NULL-DEREF`

```ts
if (sentPropertyIdSet.size > 0) {
    await db.insert(sentPropertyIdsTable)...      // ← marks everything sent HERE
}
...
const { sent, failed } = await sendTemplateToUsers({...});  // ← actual send happens AFTER
```

**Why it's a bug.** <One tight paragraph tracing the mechanism → the triggering input/state → the concrete consequence a user hits. Name the specific lines and the intent it contradicts. This is where the reader is convinced it's real, so make the failure path explicit — not "this could be risky.">

**Fix.** <One paragraph: the concrete change to make, plus any secondary cleanup. Reference the exact call/line to move or guard.>

---

### 2. <next title>

`client/src/api/deals.api.ts:20-27` · **HIGH** · `DATA.CONTRACT`

```ts
<excerpt with a // ← marker on the offending line>
```

**Why it's a bug.** <…>

**Fix.** <…>

---

## 🔍 Worth a look — unverified, not counted toward the 5

- **`X.ASSUMPTION`** `path:LN` — <one line: the assumption and why it might not hold>.

## Synthesis

<One paragraph: the dominant risk in this scope and the top 1–3 things to fix first. If clean, say what you checked and why you're confident it holds.>
````

**Formatting rules (do not deviate):**

- Every finding is a numbered `### N.` heading with a **plain-English title** — not the bare ID.
- The metadata line under the title is always `` `path:line-range` · **SEVERITY** · `CATEGORY.ID` `` in that order.
- Always include a fenced code block with a language tag (` ```ts ` / ` ```tsx `), showing the **smallest meaningful excerpt** and a `// ←` inline marker pointing at the offending line(s).
- **Why it's a bug.** and **Fix.** are always bold-labeled prose paragraphs — the two things the reader actually reads. Keep each to 1–3 sentences of real substance.
- Separate findings with a `---` rule.
- Severity meaning: **BLOCKER** (crash/data-loss/wrong result users hit), **HIGH** (clearly wrong on a real path), **MEDIUM** (wrong on an edge case), **LOW** (minor, real, in-passing).

If there are **no findings**, still emit the header table (with `**No correctness issues found in scope.**` as the Top risk), skip the empty Findings section, omit "Worth a look" when it's empty, and always write the Synthesis paragraph (what you checked and why it's clean).

Begin with Step 1.
