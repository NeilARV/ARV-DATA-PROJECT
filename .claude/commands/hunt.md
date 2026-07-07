---
description: Hunt a file or folder for real bugs and issues — logic, runtime, data-flow, and robustness (plus security/perf/config on request) — and resolve the blast radius (callers, routes, frontend consumers, tests) so findings and fixes are impact-aware. Also runs an always-on standards & design-compliance pass against the canonical TypeScript/Express/React (and, for frontend, design-guidelines) docs. Reports up to 5 real bugs (severity-ordered) plus any standards/design drift, or none.
argument-hint: "<file-or-folder> [categories] [focus]"
allowed-tools: Read, Grep, Glob, Bash(ls:*), Bash(find:*)
---

# /hunt — Bug & issue hunt

You are hunting for **real bugs and issues** in the given code: logic errors, runtime failures, broken data flow, and robustness gaps — and, when asked, security, performance, and config problems. A "bug" here is anything that makes the code behave wrong, crash, corrupt data, leak resources, or perform badly — not just a mismatch with intent. Alongside the bug hunt you **always** run a second, lighter pass: a **standards & design-compliance** check that flags where the in-scope code drifts from the project's canonical standards — `typescript.md`, `express.md`, `react.md` — and, for frontend code, `design-guidelines.md`. This is still narrower than `/smell` (a full Clean-Code + GoF review of a whole diff) and `/audit` (a repo-wide drift scan), and it is **not** `/security-review` (that's a dedicated security pass): the standards pass here is scoped to the hunted target plus its blast radius, and it **defers to** those docs — cite the rule, don't re-teach it. Formatting proper (quotes, semicolons, indentation, import order) is owned by Prettier and auto-enforced by the `PostToolUse` hook — **never flag it**; this pass checks *semantic* standards only.

A bug is only half the job. Because most real bugs live at a boundary (a service its callers depend on, a route the frontend consumes), you must also resolve the **blast radius** — who depends on the target — so every finding names the sites it breaks and every fix is scoped to match. A fix that silences the target but breaks its callers or their tests is a failure, not a success.

Follow the steps **in order**. Two honesty rules, one per output stream. For **bugs**: **finding nothing is a success, not a failure — never pad the report to reach 5.** A confabulated bug is worse than a missed one because it wastes the reader's trust. For **standards & design**: report only *real* drift you can tie to a named rule — never invent a violation to fill the section, and "no standards drift in scope" is a perfectly good result. Cite bug category IDs verbatim from the catalog in Step 3, and standards IDs verbatim from the standards docs.

Raw arguments: `$ARGUMENTS`

---

## Step 1 — Resolve scope and blast radius

Parse `$ARGUMENTS`:

- **Arg 1 = path** (required) — a file or a folder, relative to repo root. Strip a leading `@` if present (Claude Code's file-mention autocomplete adds one, e.g. `@server/services/` → `server/services/`).
- **Remaining args** — optional. Any that match a **category keyword** (Step 3) or a bare **catalog ID** narrow the scan. Everything else is **free-text focus** ("focus on the offer submission flow") that biases *which* findings matter, not which tiers run.

Resolve scope as **three rings, in two directions.** Downstream tells you what the target *relies on* (so a finding is accurate). Upstream tells you what *relies on the target* (so a finding — and its fix — is impact-aware). Skipping the upstream ring is the classic failure: you "fix" the target and break every caller and test that depended on the old behavior.

**Ring 0 — Target(s).** Decide **file vs folder** (`ls`/`find`/`Glob` if unsure).
- **File** → the target set is that one file.
- **Folder** → every `.ts`/`.tsx` file directly under it. **Recurse into subfolders only if the target folder holds ≤ 10 files total; otherwise stay one level deep and say so** in the scope line.
Ring 0 is **fully hunted.**

**Classify each target's layer** — it gates which standards apply in the Step-3 standards pass. A **backend** file (`.ts` under `server/` or `database/`) is checked against `typescript.md` + `express.md`; a **frontend** file (`.tsx`, or anything under `client/`) against `typescript.md` + `react.md` + `design-guidelines.md`. Design-guidelines and `RX.*` don't apply to backend targets — skip them there rather than reporting them clean. A mixed folder is classified per file.

**Ring 1 — Downstream deps (imports, one level).** For each target file, read the **project-local** modules it imports and actually uses (helpers, utils, services, shared/database types). **Stop at `node_modules`, framework code, and one level of depth.** Read for contract accuracy; flag a Ring-1 file **only** if its bug changes behavior in the target.

**Ring 2 — Upstream callers + wire consumers + tests.** Find what depends on the target, using `Grep` for the target's module path and its exported symbol names. Trace it **role-aware**:
- **Backend service target** → its **controller** and **route**, plus any **other backend module that imports it** (e.g. a plural `properties.service` importing a shared `maps.service`). From the route path, **cross the wire**: grep `client/` for that path string and the API-client function name to reach the `*.api.ts` wrapper, the query hook, and the component that renders the data.
- **Frontend component/hook target** → the reverse: where it's **rendered** (who passes its props) and where its **data loads** (the hook / `*.api.ts` call / the backend route behind it). Follow that route back into the controller/service if a finding points there.
- **Tests are Ring-2 consumers.** Grep `**/*.test.ts(x)` / `**/*.spec.ts(x)` for the target's path and exported symbols; a behavior/shape/signature change that breaks a test is a finding, and every such test is a fix site.

Ring 2 is **read for context and hunted only along the surface the target changes** — contract mismatches, broken callers, stale client cache/state, now-failing tests. Do **not** run a full independent hunt of every consumer; stay on the flow that touches the target.

**Proportionality.** A purely *local* finding (empty catch, dead code, a guard used nowhere else, formatting-adjacent slips) needs no Ring-2 work — narrow is correct there. Ring 2 matters for **logic, contract, signature, and behavior** changes, which ripple. Don't inflate the blast radius for trivia.

State the resolved scope in one line before hunting: `path` · file-or-folder · **layer** (backend / frontend / mixed) · `N` target files · `R1` deps read · `R2` callers/consumers/tests read (name the key ones). If the path doesn't exist, stop and say so — don't guess.

---

## Step 2 — Determine active tiers

- **No category given → Tiers 1–3** (Correctness, Data & Contract, Robustness). This is the default: security/perf/config are covered by `/security-review` and other tools.
- **Category keyword(s) given →** only those tiers/categories.
- **`all` →** every tier.
- **Standards & Design pass → always on.** Independent of the bug tiers and their category selection, every run also performs the Standards & Design compliance pass (Step 3's final section) over the in-scope targets. No category keyword toggles it and none switches it off; it only narrows by **layer** (backend vs frontend, per Ring 0). Before running it, Read only the standards docs the resolved layer needs — always `typescript.md`; backend adds `express.md`; frontend adds `react.md` + `design-guidelines.md` — so a backend-only hunt never loads the design guide.

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

**Scan** tiers **top-down**: fully exhaust Tier 1 before considering Tier 2, and so on. Scanning order is about *finding* bugs efficiently — it is **not** how the 5 report slots are allocated. Slot allocation is by **severity** (see Step 4), because the catalog's worst bug (`DATA.DB-WHERE`, a whole-table mutation) lives in Tier 2, not Tier 1.

The **cross-wire** categories below (`DATA.CONTRACT`, `X.REGRESSION`) now have real teeth: because Ring 2 is read, you can cite the actual consumer, not just guess at one.

### Tier 1 — Correctness / Runtime  (`CORR.*`)
- **CORR.LOGIC** — wrong operator, inverted condition, wrong business rule. *e.g. `count || 10` drops a legitimate `0`; `>` where `>=` was meant.*
- **CORR.NULL-DEREF** — property/method access on a possibly-`undefined` value; `.find()` / `[0]` result used unchecked. *e.g. `deals[0].price` when `deals` may be empty.*
- **CORR.UNSAFE-CAST** — `as any`, `as X`, or `!` masking a real type mismatch that will be wrong at runtime. *e.g. `(req.body as CreateDeal)` with no validation.*
- **CORR.THROW** — an unhandled path that throws on realistic input. *e.g. `JSON.parse(raw)`, `new URL(x)`, `Number(x)` feeding math.*
- **CORR.ASYNC** — missing `await` (floating promise), unhandled rejection, `await` in a loop that should be `Promise.all`, forgotten `return await`, race on shared mutable state.
- **CORR.BOUNDARY** — off-by-one / fencepost / bad slice / pagination math. *e.g. `page * size` where `(page - 1) * size` was meant.*

### Tier 2 — Data & Contract  (`DATA.*`)
- **DATA.CONTRACT** — client/server shape mismatch across the wire: field name, nesting, type, or status code differ between producer and consumer. *e.g. server sends `{ items }`, client reads `data.results`.* **(cross-file — cite both sites)**
- **DATA.DB-WHERE** — Drizzle `update`/`delete` missing `.where(...)` → whole-table mutation. **(always BLOCKER)**
- **DATA.DB-NPLUS1** — a query inside a `.map`/loop instead of one query or a join.
- **DATA.DB-LIMIT1** — single-row query not `.limit(1)` and/or not destructured `[row]`; an array used where one row is expected.
- **DATA.DB-DRIFT** — query/insert references a column, enum, or table that doesn't match the schema.
- **DATA.VALIDATION** — `req.body` / params / query used without Zod `safeParse`; client input trusted.
- **DATA.STATE** — React stale closure, missing/incorrect `useEffect` dependency, direct state mutation, derived state that can desync, or a client cache (TanStack Query) not invalidated after a mutation changes the underlying data.

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
- **X.REGRESSION** — the code plausibly breaks an existing consumer or behavior elsewhere. **Name the caller/site at risk** (you have read Ring 2 — cite the real one). **(cross-file — cite both sites)**

**How to cite X.* IDs.** In **Findings**, an X.* ID never stands alone — it is appended to the concrete tier ID it sharpens, e.g. `` `CORR.NULL-DEREF` + `X.ASSUMPTION` ``. An X.* ID may appear **alone only under "Worth a look,"** where the point is precisely that you couldn't pin it to a concrete tier bug.

### Standards & Design compliance  (always-on pass — cite canonical IDs, do not invent)

Separate from the bug tiers above and reported in its **own Step-5 section** — it never competes for the 5 bug slots. It flags where the in-scope code **drifts from the canonical standards docs**, scoped by each target's layer (Ring 0). **Cite the rule's real ID verbatim from the owning doc**; never coin an ID here, and **defer to the docs** — name the rule, don't re-teach it. Read only the docs the layer needs first (Step 2).

**Which docs apply, by layer:**
- **Any `.ts`/`.tsx`** → `.claude/docs/standards/typescript.md` (`TS.*`) — e.g. `TS.NO-ANY`, `TS.NO-AS-ANY`, `TS.NO-NON-NULL`, `TS.NULLISH`, `TS.DERIVE-TYPES`, `TS.RETURN-TYPE`, `TS.FN-DECLARATION`, `TS.JSDOC-EXPORT`, `TS.JSDOC-BUDGET`, `TS.COMMENT-WHY`.
- **Backend target** (`server/`, `database/`) → `.claude/docs/standards/express.md` (`EX.*`, `DB.*`) — e.g. `EX.LAYER-SEPARATION`, `EX.NO-DB-IN-CONTROLLER`, `EX.NO-HTTP-IN-SERVICE`, `EX.CONTROLLER-TRY-CATCH`, `EX.ZOD-SAFEPARSE`, `EX.NO-LEAK-INTERNALS`, `EX.SERVICE-NULL-NOT-UNDEFINED`, `DB.LIMIT1-DESTRUCTURE`, `DB.NO-NPLUS1`.
- **Frontend target** (`.tsx`, `client/`) → `.claude/docs/standards/react.md` (`RX.*`) **and** `.claude/docs/design-guidelines.md`. **Design-guidelines only matters when the target actually touches frontend UI** — on a backend-only hunt it does not apply, so skip it (don't report it clean). In a component/page/style file, do check the design system: tokens over hardcoded colors/hex, the documented type scale, spacing/radius, and the sanctioned component patterns. Where a React rule owns the concern (`RX.DESIGN-TOKENS`) cite the `RX.*` ID; otherwise cite the guideline by section name (e.g. `design-guidelines → Color System` for a hardcoded gray instead of `text-muted-foreground`), since that doc uses sections, not short IDs.
- **Both layers** (project-specific, from CLAUDE.md) → `ARV.RAW-COMPANY-NAME` (name rendered/returned without `formatCompanyName`) and `ARV.SECRET-ACCESS` (reads a secret/`.env`).

**Do NOT flag** anything Prettier/ESLint already enforce — quote/semicolon/indentation formatting, import order (`TS.IMPORT-ORDER`), self-closing tags, unused vars. The `PostToolUse` Prettier hook guarantees these; "formatting is correct" is already solved. This pass checks **semantic** standards, not whitespace.

---

## Step 4 — Hunt rules (the part that keeps this honest)

For every candidate finding, it is only a **finding** if it clears the **evidence gate**:

1. **Quote the exact code** (smallest meaningful excerpt) with a `path:line`.
2. **Write the concrete failure:** a real input or state → the wrong output, crash, or corrupted data. If you cannot write the triggering input, it is **not a finding** — drop it.
3. **Confidence must be Confident or Likely.** Anything you'd label *Speculative* does not go in Findings. Note: this gate is a *static* argument — you are asserting the failure path by reading, not executing it. Hold yourself to "I can trace this input to that line" before writing Confident.

**Impact-bearing vs local.** A finding is **impact-bearing** if fixing it changes an exported signature, a response/DB shape, or an observable behavior — anything a Ring-2 site relies on. For each impact-bearing finding, you must have read the callers and name them (see Impact, Step 5). A finding is **local** if its fix is fully contained in the target; it needs no Ring-2 accounting. Do not treat a contract/behavior change as local just because it looks small.

**Fix discipline (fix scope = impact scope).** When you propose a fix, the fix must account for *every* Ring-2 site the change touches: update the callers/route/controller/frontend in the same breath, or, if you are only reporting, **enumerate every site that now needs to change — tests included** — so the follow-up pass doesn't break them. A fix that changes the target's contract without listing its consumers is incomplete and must not be presented as done.

**Slot allocation — severity first (this is the ordering that matters):**

- Assign each surviving finding a severity: **BLOCKER** (crash / data-loss / wrong result users hit), **HIGH** (clearly wrong on a real path), **MEDIUM** (wrong on an edge case), **LOW** (minor, real, in-passing).
- **Fill the 5 slots by severity, highest first.** Within the same severity band, break ties by tier (lower tier number wins), then by path. A HIGH Tier-3 finding outranks a MEDIUM Tier-1 finding — severity beats tier for the slots, even though scanning ran top-down.
- **BLOCKERs are never evicted by the cap.** If more than 5 real findings exist and any are BLOCKERs, every BLOCKER is reported even if that pushes the total past 5; the cap only trims MEDIUM/LOW.

Hard constraints:

- **Cap at 5 findings** total (BLOCKER overflow excepted, per above).
- **Zero is a valid, common, good result.** If the code is correct, say "No correctness issues found in scope." Do **not** invent a nit to avoid an empty report.
- **No style/design nits in the numbered bug Findings** (that's `/smell`) — genuine standards/design *drift* isn't dropped, though; it goes in the separate **Standards & Design Compliance** section instead. **No security unless Tier 4 is active** (that's `/security-review`).
- A Ring-1 helper may be flagged **only** when its bug changes behavior in the target scope; a Ring-2 consumer may be flagged **only** along the surface the target changes.
- If the free-text focus was given, rank findings that touch that flow first **within their severity band** (severity still wins overall).

**Standards & Design is a separate stream.** The evidence gate, the 5-slot cap, and severity ordering above govern **bug findings only**. Standards/design drift does **not** consume bug slots and is **not** capped at 5 — report it in its own Step-5 section. Still hold it to a bar: each item needs a `path:line`, the exact canonical rule ID it violates, and a one-line why; skip anything Prettier owns and anything you can't tie to a specific documented rule. Cap the standards section at a sane **8**, worst-first (a BLOCKER/HIGH drift like `EX.NO-DB-IN-CONTROLLER` or `DB.NO-NPLUS1` outranks a LOW/NIT one like a missing JSDoc summary); if more exist, say so and point to a scoped `/audit` for the full sweep.

You may list up to **2** genuinely uncertain items under a separate **"Worth a look"** heading — clearly marked unverified, never counted toward the 5, never dressed up as confirmed.

---

## Step 5 — Report

Output is **GitHub-flavored markdown** and must render cleanly in the terminal. Follow this structure **exactly** — same headings, same order, same labels — so every run looks identical. Findings are numbered `1..N` in priority order: **severity, then tier, then path** (the same order used to allocate slots in Step 4).

> The paths in the template below are **illustrative placeholders** to show the shape of a finding — they are not real targets. Replace them with the actual `path:line` you found.

````markdown
# 🎯 Hunt Report

| | |
|---|---|
| **Scope** | `<path>` — <file \| folder>, N target files |
| **Layer** | <backend \| frontend \| mixed> |
| **Blast radius** | R1 deps · R2 callers/consumers/tests read (e.g. `x.controller`, `x.routes`, `client/api/x.api.ts`, `x.test.ts`) |
| **Categories** | <tiers/keywords scanned, e.g. Tiers 1–3 (default)> · Standards & Design (always on) |
| **Focus** | <free-text focus, or —> |
| **Result** | Bugs: **A** blocker · **B** high · **C** medium · **D** low · Standards: **E** issues |

> **Top risk:** <one sentence>   ← or, if clean: **No correctness issues found in scope.**

---

## Findings

### 1. <Plain-English title of the bug>

`server/services/example.service.ts:41-55` · **BLOCKER** · `CORR.NULL-DEREF`

```ts
const [user] = await db.select()...where(eq(users.id, id));
return user.email.toLowerCase();          // ← user is undefined when id misses
```

**Why it's a bug.** <One tight paragraph tracing the mechanism → the triggering input/state → the concrete consequence a user hits. Name the specific lines and the intent it contradicts. Make the failure path explicit — not "this could be risky.">

**Impact.** <Only for impact-bearing findings. The Ring-2 sites a fix touches, each as `path:line`: e.g. `example.controller.ts:28` (calls it, assumes non-null), `client/src/api/example.api.ts:14` (consumes the response), `example.service.test.ts:33` (asserts old shape). Omit this line entirely for local findings.>

**Fix.** <One paragraph: the concrete change, plus every caller/test update it forces (fix scope = impact scope). Reference the exact call/line to change or guard.>

---

### 2. <next title — a cross-wire example>

Producer `server/routes/example.routes.ts:20-27` · Consumer `client/src/api/example.api.ts:14-19` · **HIGH** · `DATA.CONTRACT`

```ts
// producer
res.json({ items });                 // ← server sends `items`
// consumer
const rows = data.results;           // ← client reads `results` — always undefined
```

**Why it's a bug.** <…>

**Impact.** <the component/hook that renders `rows`, plus any test asserting either shape>

**Fix.** <…>

---

## Standards & Design Compliance

> Drift from the canonical standards/design docs — separate from the bug findings above, **not** counted toward the 5. Omit this whole section when the in-scope code is clean of drift (and say so in Synthesis). Cite the canonical rule ID; for a design rule with no short ID, the guideline section name.

### `EX.NO-DB-IN-CONTROLLER` — `server/controllers/example/example.controllers.ts:34`

```ts
const [row] = await db.select().from(deals)...   // ← DB access belongs in a service, not the controller
```

**Drift.** <one sentence: the rule, what the code does instead, why it violates the doc.>  **Fix.** <one-line concrete change.>

### design-guidelines → Color System — `client/src/components/example/Example.tsx:22`

```tsx
<span className="text-gray-400">…</span>          // ← hardcoded gray; use text-muted-foreground
```

**Drift.** <…>  **Fix.** <…>

---

## 🔍 Worth a look — unverified, not counted toward the 5

- **`X.ASSUMPTION`** `path:LN` — <one line: the assumption and why it might not hold>.

## Synthesis

<One paragraph: the dominant risk in this scope, the top 1–3 things to fix first, and — if any finding is impact-bearing — a one-line reminder of the total blast radius (how many caller/test sites a fix touches). Close with one clause on the standards/design posture (clean, or the dominant drift theme). If fully clean, say what you checked across all rings and why you're confident it holds.>
````

**Formatting rules (do not deviate):**

- Every finding is a numbered `### N.` heading with a **plain-English title** — not the bare ID.
- The metadata line under the title is `` `path:line-range` · **SEVERITY** · `CATEGORY.ID` `` in that order. For **cross-file categories** (`DATA.CONTRACT`, `X.REGRESSION`) cite **both** sites, labeled — e.g. `` Producer `a.ts:20-27` · Consumer `b.ts:14-19` · **HIGH** · `DATA.CONTRACT` ``. When an X.* lens sharpens a tier finding, append it: `` **SEVERITY** · `CORR.NULL-DEREF` + `X.ASSUMPTION` ``.
- Always include a fenced code block with a language tag (` ```ts ` / ` ```tsx `), showing the **smallest meaningful excerpt** and a `// ←` inline marker pointing at the offending line(s). For cross-file findings, show both excerpts with a `// producer` / `// consumer` comment.
- **Why it's a bug.**, **Impact.** (impact-bearing only), and **Fix.** are bold-labeled prose paragraphs. Keep each to 1–3 sentences of real substance. **Impact.** lists Ring-2 sites as `path:line`; omit it for local findings.
- Separate findings with a `---` rule.
- Severity meaning: **BLOCKER** (crash/data-loss/wrong result users hit), **HIGH** (clearly wrong on a real path), **MEDIUM** (wrong on an edge case), **LOW** (minor, real, in-passing).
- The **Standards & Design Compliance** section is separate from the numbered bug findings: each item is a level-3 heading naming the canonical rule ID (or, for design, the guideline section name) with a `path:line`, a fenced excerpt with a `// ←` marker, and bold **Drift.** / **Fix.** lines. Sort worst-first, cap at 8, and never count it toward the bug total.

If there are **no bug findings**, still emit the header table (with `**No correctness issues found in scope.**` as the Top risk), skip the empty Findings section, and always write the Synthesis paragraph (what you checked across all rings and why it's clean). Independently: omit the **Standards & Design Compliance** section when there's no drift (note "standards/design clean" in Synthesis), and omit "Worth a look" when it's empty. The two streams are reported independently — a hunt can find zero bugs but real standards drift, or vice versa.

Begin with Step 1.