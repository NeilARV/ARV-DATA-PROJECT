---
description: Scan git diff vs target branch for code smells (Clean Code + GoF + TypeScript/React/Express catalog)
argument-hint: "[target-branch]"
allowed-tools: Bash(bash .claude/scripts/smell-diff.sh:*), Read, Grep, Glob
---

# /smell — Code smell review

You are running a 5-step code-smell review. Follow the steps **in order**. Do not skip any. Do not invent findings. Cite catalog IDs verbatim from the lists below.

---

## Step 1 — Ingest

The diff below has already been collected. Read it carefully before proceeding. It contains both the committed changes vs the base (3-dot `base...HEAD`) **and** the working-tree changes (staged + unstaged).

!`bash .claude/scripts/smell-diff.sh "$ARGUMENTS"`

---

## Step 2 — Classify

Pick **exactly one** category for the overall change and justify in **one sentence**:

- `feature` — new user-visible behavior, endpoints, UI, or capability
- `refactor` — internal restructure, no behavior change
- `bugfix` — corrects incorrect behavior
- `test` — tests-only
- `docs` — docs/comments only
- `config` — config / build / infra only
- `mixed` — multiple of the above; name the dominant one

---

## Step 3 — Weight the lens

Decide whether to emphasize **Clean Code**, **Gang of Four**, or **Mixed**. State your choice and a one-sentence rationale.

Heuristic:
- Diff introduces new classes / hierarchies / abstractions / extension points → **Gang of Four lens**.
- Diff is mostly inline edits, naming, function shape, duplication → **Clean Code lens**.
- Both → **Mixed**.

### Clean Code reminder (Robert C. Martin, 2008)
- **Functions**: small, do one thing, one level of abstraction (G34), ≤3 args (F1), no boolean flag args (F3), no output args (F2).
- **Names**: reveal intent (N1), unambiguous (N4), longer for longer scopes (N5), describe side effects (N7).
- **Comments**: explain *why* not *what*; delete obsolete (C2), redundant (C3), commented-out (C5).
- **General**: duplication is the worst smell (G5); polymorphism over switch (G23); encapsulate conditionals (G28); avoid Law-of-Demeter violations (G36); replace magic numbers with named constants (G25).
- **Tests**: F.I.R.S.T. — Fast, Independent, Repeatable, Self-validating, Timely; test boundary conditions (T5).

### Gang of Four reminder (Gamma/Helm/Johnson/Vlissides, 1994; design smells from Martin)
- **23 patterns** in three groups:
  - **Creational**: Abstract Factory, Builder, Factory Method, Prototype, Singleton.
  - **Structural**: Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy.
  - **Behavioral**: Chain of Responsibility, Command, Interpreter, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor.
- **Two core rules**: *program to an interface, not an implementation*; *favor object composition over class inheritance*.
- **SOLID**: SRP, OCP, LSP, ISP, DIP.
- **Seven design smells (Martin)**: rigidity, fragility, immobility, viscosity, needless complexity, needless repetition, opacity.
- **Pattern-missing signals** (most useful as scanner heuristics):
  - Long if/elif/match on a type-code or enum repeated across methods → **Strategy** or **State**.
  - Client directly instantiates concrete classes from a hierarchy → **Factory Method** or **Abstract Factory**.
  - Subclass explosion combining orthogonal traits (`RedBoldButton`, `BlueBoldButton`…) → **Decorator** or **Bridge**.
  - Polling another object for state changes; hand-rolled listener loops → **Observer**.
  - Two near-identical methods differing in 1–2 steps → **Template Method**.
  - Recursive container handled with `isinstance(x, list)` branches → **Composite**.
  - Inline call-translation to a foreign API surface → **Adapter**.
  - Ad-hoc tuples/dicts representing deferred actions, ad-hoc undo stacks → **Command**.
  - Index-based traversal of a custom collection (`for i in range(c.size())`) → **Iterator**.
  - Clients reach into many internals of one subsystem → **Facade**.

---

## Step 4 — Analyze

Walk every hunk. For each issue you find, cite **exactly one** catalog ID from the lists below. Quote the smallest possible code excerpt. One-sentence *why*. One-sentence *fix*. Don't invent IDs that aren't in this list.

### Clean Code IDs (language-agnostic)
- **CC.C1** Inappropriate Information (non-technical info in comments)
- **CC.C2** Obsolete Comment (doesn't match the code)
- **CC.C3** Redundant Comment (restates what the code says)
- **CC.C5** Commented-Out Code
- **CC.F1** Too Many Arguments (>3)
- **CC.F2** Output Arguments (params mutated as outputs)
- **CC.F3** Flag Arguments (boolean param → function does >1 thing)
- **CC.F4** Dead Function (never called)
- **CC.G5** Duplication (most important smell)
- **CC.G6** Code at Wrong Level of Abstraction
- **CC.G8** Too Much Information (overly wide interface)
- **CC.G9** Dead Code (unreachable branches / unused symbols)
- **CC.G11** Inconsistency (same idea expressed two ways)
- **CC.G12** Clutter (empty ctors, unused vars, useless comments)
- **CC.G14** Feature Envy (method uses another class's data more than its own)
- **CC.G15** Selector Arguments (magic flags that change behavior)
- **CC.G16** Obscured Intent (magic numbers, dense expressions, cryptic names)
- **CC.G19** Use Explanatory Variables (break dense expressions into named intermediates)
- **CC.G20** Function Names Should Say What They Do
- **CC.G23** Prefer Polymorphism to If/Else or Switch/Case
- **CC.G25** Replace Magic Numbers with Named Constants
- **CC.G28** Encapsulate Conditionals (extract booleans into named predicates)
- **CC.G29** Avoid Negative Conditionals
- **CC.G30** Functions Should Do One Thing (SRP at function level)
- **CC.G34** Functions Should Descend Only One Level of Abstraction
- **CC.G36** Avoid Transitive Navigation (Law of Demeter)
- **CC.N1** Choose Descriptive Names
- **CC.N4** Unambiguous Names
- **CC.N5** Use Long Names for Long Scopes
- **CC.N7** Names Should Describe Side-Effects
- **CC.T1** Insufficient Tests
- **CC.T5** Test Boundary Conditions
- **CC.T9** Tests Should Be Fast

### Gang of Four IDs — missing-pattern signals
- **GOF.STRATEGY-MISSING** — long if/elif/match on type-code or enum, repeated across methods.
- **GOF.FACTORY-MISSING** — client `new`s concrete classes from a hierarchy.
- **GOF.DECORATOR-MISSING** — subclass explosion combining orthogonal traits.
- **GOF.OBSERVER-MISSING** — polling, or hand-rolled `for listener in listeners`.
- **GOF.TEMPLATE-MISSING** — two near-identical methods differing in 1–2 steps.
- **GOF.COMPOSITE-MISSING** — recursive container w/ `isinstance(x, list)` branches.
- **GOF.ADAPTER-MISSING** — inline call-translation to a foreign API.
- **GOF.COMMAND-MISSING** — ad-hoc tuples/dicts as deferred actions; ad-hoc undo stacks.
- **GOF.ITERATOR-MISSING** — `for i in range(c.size())` over a custom collection.
- **GOF.FACADE-MISSING** — clients touch many internals of one subsystem.

### Gang of Four IDs — design smells (Martin, *Agile Software Development*)
- **DS.RIGIDITY** — one change cascades widely
- **DS.FRAGILITY** — changes break unrelated parts
- **DS.IMMOBILITY** — components hard to extract for reuse
- **DS.VISCOSITY** — hacks are easier than correct fixes
- **DS.NEEDLESS-COMPLEXITY** — infrastructure not justified by current need
- **DS.NEEDLESS-REPETITION** — same logic in multiple places
- **DS.OPACITY** — hard to understand

### TypeScript / React / Express / Drizzle IDs Stack Catalog (cite IDs verbatim — do not invent)
Apply to `.ts` / `.tsx` files.

- `@.claude/docs/standards/typescript.md`
- `@.claude/docs/standards/react.md`
- `@.claude/docs/standards/express.md`
- `@.claude/docs/standards/database.md`

When scanning a diff, prioritize rules that are *detectable from changed lines*:
type safety (TS.NO-ANY, TS.NO-AS-CAST, TS.NO-NON-NULL), layering
(EX.NO-DB-IN-CONTROLLER, EX.NO-HTTP-IN-SERVICE), data-access
(DB.LIMIT1-DESTRUCTURE, DB.NO-NPLUS1), effects/keys
(RX.EFFECT-DEPS, RX.EFFECT-CLEANUP, RX.STABLE-KEY), and validation/error
(EX.ZOD-SAFEPARSE, EX.NO-LEAK-INTERNALS). Don't flag what Prettier/ESLint
already enforce (import order, self-closing tags, boolean props).

**Project-specific**
- **ARV.RAW-COMPANY-NAME** — company name rendered/returned without `formatCompanyName` (§20)
- **ARV.SECRET-ACCESS** — code reads `.env` / a secret file directly (security rules)

---

## Step 5 — Prioritize & report

### Severity definitions
- **BLOCKER** — security, correctness, data-loss, or runtime-crash risk
- **HIGH** — clearly wrong; will regress maintainability or behavior
- **MEDIUM** — design weakness worth fixing now
- **LOW** — minor; in-passing fix
- **NIT** — style preference, no real cost

Sort findings by severity (desc), then by file path. Emit **exactly this structure** as your final response:

````markdown
# Smell Report
**Base:** `<BASE>`
**Classification:** `<feature|refactor|bugfix|test|docs|config|mixed>`
**Primary lens:** `<Clean Code | Gang of Four | Mixed>`

## Summary
- Files changed: N
- Findings: X blocker, Y high, Z medium, W low, V nit
- Top risk: <one sentence>

## Findings

### [BLOCKER] `TS.ASYNC-AWAIT` — `path/file.ts:142`
```ts
<smallest meaningful excerpt>
```
**Why:** <one sentence>
**Fix:** <one sentence>

### [HIGH] `GOF.STRATEGY-MISSING` — `path/file.tsx:55-90`
...

## Synthesis
<one paragraph: dominant theme of the diff and the top 3 actions to take before merge>
````

If the diff has no findings, emit the same structure with an empty Findings section and an explicit "No catalog findings on this diff." line, plus the Synthesis paragraph.

Begin now with Step 2.