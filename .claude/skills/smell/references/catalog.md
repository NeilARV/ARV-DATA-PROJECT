# Smell catalog

The rule catalog for the `smell` skill. Cite IDs **verbatim** — do not invent IDs that aren't
here. Loaded on demand (Step 5), not up front.

---

## Lens reminders

Decide whether to emphasize **Clean Code**, **Gang of Four**, or **Mixed** (Step 4). Heuristic:

- Diff introduces new classes / hierarchies / abstractions / extension points → **Gang of Four**.
- Diff is mostly inline edits, naming, function shape, duplication → **Clean Code**.
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

## Clean Code IDs (language-agnostic)
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

## Gang of Four IDs — missing-pattern signals
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

## Gang of Four IDs — design smells (Martin, *Agile Software Development*)
- **DS.RIGIDITY** — one change cascades widely
- **DS.FRAGILITY** — changes break unrelated parts
- **DS.IMMOBILITY** — components hard to extract for reuse
- **DS.VISCOSITY** — hacks are easier than correct fixes
- **DS.NEEDLESS-COMPLEXITY** — infrastructure not justified by current need
- **DS.NEEDLESS-REPETITION** — same logic in multiple places
- **DS.OPACITY** — hard to understand

> Note: `DS.*` here are the Gang-of-Four **design smells** above. They are unrelated to the
> `DS.*` design-token rule IDs owned by the `ui-design` skill (see the Frontend design row below).
> Context makes which one you mean unambiguous; never cross-cite them.

---

## TypeScript / React / Express / Drizzle / Testing stack catalog (cite IDs verbatim)
Apply to `.ts` / `.tsx` files. The authoritative definitions live in the standards docs:

- `.claude/docs/standards/typescript.md`  (`TS.*`)
- `.claude/docs/standards/react.md`        (`RX.*`)
- `.claude/docs/standards/express.md`      (`EX.*`, `DB.*`)
- `.claude/docs/standards/testing.md`      (`TST.*`)

> `DB.*` is owned by `express.md`. The schema reference `.claude/docs/database.md` is **data, not
> a rules file** — consult it for context (does a column/enum exist?) but never cite it as a rule
> source.

When scanning a diff, prioritize rules *detectable from changed lines*: type safety
(`TS.NO-ANY`, `TS.NO-AS-ANY`, `TS.NO-NON-NULL`), layering (`EX.NO-DB-IN-CONTROLLER`,
`EX.NO-HTTP-IN-SERVICE`), data-access (`DB.LIMIT1-DESTRUCTURE`, `DB.NO-NPLUS1`), effects/keys
(`RX.EFFECT-DEPS`, `RX.EFFECT-CLEANUP`, `RX.STABLE-KEY`), validation/error (`EX.ZOD-SAFEPARSE`,
`EX.NO-LEAK-INTERNALS`), and comments (`TS.JSDOC-EXPORT`, `TS.JSDOC-BUDGET`, `TS.COMMENT-WHY`).
Don't flag what Prettier/ESLint already enforce (import order, self-closing tags, boolean props).

### Frontend design tokens → the `ui-design` skill (owns `DS.*`)
When a hunk touches `client/` UI (a `.tsx` component, a Tailwind class string, CSS under
`client/`), the design-token rules are owned by the **`ui-design` skill**, and react.md's
`RX.DESIGN-TOKENS` / `RX.RESPONSIVE-RESTRAINT` defer to it. **Invoke the `ui-design` skill** for
the token rules and cite its `DS.*` IDs (e.g. `DS.NO-HARDCODED-COLOR` for a hex/`text-gray-*`
literal, `DS.MUTED-FOREGROUND` for secondary text). Do **not** read the retired
`design-guidelines.md` — it no longer exists; the skill replaced it.

### Missing-test smells (`TST.*`) — diff-detectable, but verify before flagging
The diff may not contain a test that already exists elsewhere — so **Grep for an existing test
first** (`tests/server/api/<resource>/`, `tests/server/{validation,middleware,utils}/`,
`tests/client/`). Only when none exists, cite one of:
- **TST.MANDATORY** — the diff adds a route, a Zod validator, a new middleware guard, or a pure
  util/formatter with no matching test (the always-required tier).
- **TST.WHEN-APPLICABLE** — the diff adds a service with an ownership check or a state transition
  (deals, offers, claims) but no integration test exercising it.
- **TST.ASSERT-OUTCOME** — a test in the diff executes code without an `expect`.

`smell` only *flags* the gap; the `/test` command *fills* it — **do not write tests here.**

### Project-specific
- **ARV.RAW-COMPANY-NAME** — company name rendered/returned without `formatCompanyName`
  (CLAUDE.md → Project-specific rules; helper at `@shared/utils/formatCompanyName`).
- **ARV.SECRET-ACCESS** — code reads `.env` / a secret file directly (CLAUDE.md → Security Rules).
