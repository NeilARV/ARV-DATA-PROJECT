# TypeScript Standards

Authoritative rules for TypeScript **language** usage (strict mode, ES modules, Node + Vite). Each rule has a stable `TS.*` ID cited by the review skills (`/smell`, `/audit`, `/hunt`, `/doc-drift`); this file owns them. React → `react.md`; Express/Drizzle → `express.md`; live schema → `database.md`.

> One directive + a tiny good/bad. Prettier owns formatting — 4-space indent, single quotes (double for JSX attributes), semicolons, 100-col width, trailing commas — never a rule here.

---

## Strictness & `any`

- **TS.STRICT** — `"strict": true` stays on; never weaken compiler strictness to make code pass.
- **TS.NO-ANY** — Never `any`. Use `unknown` and narrow with a type guard, or define a real type.
- **TS.NO-AS-ANY** — `as any` is banned — it disables checking silently. If you must assert, assert to the narrowest correct type.
- **TS.PREFER-GUARD** — Prefer type guards over `as` casts: a cast asserts, a guard verifies.
  ```ts
  function isDeal(x: unknown): x is Deal { return typeof x === 'object' && x !== null && 'dealType' in x; }
  ```
- **TS.NO-NON-NULL** — Avoid the non-null assertion `!`; it silences a real nullable. Narrow it, or fix the type.
  ```ts
  const name = user!.firstName;                          // Bad
  if (!user) return null; const name = user.firstName;   // Good
  ```
- **TS.NO-TS-IGNORE** — Never `@ts-ignore`. If a suppression is unavoidable, use `@ts-expect-error` + a one-line reason — it fails the build once the error is gone, so it can't rot.

## Types vs interfaces

- **TS.INTERFACE-VS-TYPE** — `interface` for entities and extensible object shapes (DB rows, service inputs); `type` for React props (RX.PROPS-TYPE), unions, intersections, tuples, aliases. Interfaces give better errors and extend across the app; props are a closed shape.
  ```ts
  interface Company { id: string; name: string; isArvClient: boolean; }
  type Role = 'owner' | 'admin' | 'relationship-manager' | 'member';
  ```
- **TS.NO-HUNGARIAN** — No `I`-prefix or Hungarian notation: `User` not `IUser`, `Role` not `TRole`.
- **TS.DERIVE-TYPES** — Never hand-write a type that mirrors a Drizzle/Zod schema; derive it so it can't drift.
  ```ts
  type User = typeof users.$inferSelect;
  type InsertUser = z.infer<typeof insertUserSchema>;
  ```
- **TS.SIMPLE-TYPES** — Prefer simple constructs; reach for mapped/conditional/recursive types only when they don't hurt readability. If a teammate needs a minute to decode it, write the explicit version.
- **TS.READONLY** — Mark fields/arrays `readonly` when never reassigned after construction; use `readonly T[]` for inputs you don't mutate.
- **TS.ARRAY-SHORTHAND** — `T[]`, never `Array<T>`.
- **TS.AS-CONST** — `as const` for literal arrays/objects that must not widen (a fixed option set used as a union source).
  ```ts
  export const DEAL_TYPES = ['wholesale', 'agent', 'sold', 'reo'] as const;
  type DealType = (typeof DEAL_TYPES)[number];
  ```

## Naming

- **TS.NAME-CASE** — lowerCamelCase for values (vars, functions, params, properties); UpperCamelCase for types, interfaces, classes, enums, type params, components.
- **TS.CONST-NAME** — Module-level fixed scalar/literal constants use SCREAMING_SNAKE_CASE (`MAX_PROPERTIES_PER_MSA`); a `const` holding a function/object you call stays lowerCamelCase.
- **TS.BOOL-NAME** — Prefix booleans (vars and returns) with `is`/`has`/`can`/`should`.
- **TS.HANDLER-NAME** — `handleX` for an internal handler, `onX` for a callback passed to another unit (React surface: RX.HANDLER-PROP-NAME).
- **TS.REF-SUFFIX** — Names holding a ref end in `Ref`.
- **TS.DESCRIPTIVE-NAME** — Names reveal intent and scale with scope — short for a 2-line closure, fuller for a module export; no cryptic abbreviations.

## Variables & equality

- **TS.CONST-DEFAULT** — `const` by default; `let` only where genuinely reassigned; never `var`.
- **TS.STRICT-EQ** — `===`/`!==` everywhere. The one exception: `== null` / `!= null` to test null-or-undefined together.
- **TS.NULLISH** — `??` for default-on-null/undefined and `?.` for optional access, over `||` chains that also swallow `0`/`''`/`false`.
  ```ts
  const county = input.county ?? 'San Diego'; // Good — only null/undefined fall through
  const county = input.county || 'San Diego'; // Bad — '' wrongly falls through
  ```
- **TS.NO-UNUSED** — No unused variables, params, imports, or types. Prefix an intentionally-unused param with `_`.

## Functions

- **TS.FN-DECLARATION** — Function declarations for top-level named/exported functions (hoisted, clearer traces); arrow functions for inline callbacks and handlers assigned to variables.
  ```ts
  export async function getUserById(id: string): Promise<User | null> { ... }
  const sorted = items.sort((a, b) => a.name.localeCompare(b.name));
  ```
- **TS.RETURN-TYPE** — Annotate the return type on **exported** functions; inferred returns are fine for internal ones when obvious.
- **TS.NAMED-PARAMS** — For 3+ params, take one named object and destructure in the signature; don't line up positional args.
  ```ts
  export async function createUser({ email, password, role }: CreateUserParams) { ... }
  ```
- **TS.ASYNC-AWAIT** — Always `async/await`, never raw `.then()/.catch()` chains. Use `Promise.all` only for genuinely independent, parallel work — don't bundle unrelated awaits to save lines.
- **TS.NO-PARAM-PROPS** — No constructor parameter properties (`constructor(private x: T)`); declare fields explicitly so the class shape is readable.

## Enums

- **TS.ENUM-CONSISTENT** — Match the existing approach: union-of-string-literal types (often `as const` + indexed, or `z.enum`) where values double as data/validation; runtime `enum` only where one already exists. Don't migrate enums wholesale. A runtime enum and its members are PascalCase.
  ```ts
  type DealType = 'wholesale' | 'agent' | 'sold' | 'reo';
  ```

## Modules

- **TS.ES-MODULES** — ES modules only: `import`/`export`, never `require()`/`module.exports`; no `namespace` — the file is the module boundary.
- **TS.JS-EXT** — Relative **server** import paths include the `.js` extension (Node ESM resolves compiled output, though source is `.ts`). Follow the resolver's convention for path-aliased/bundled imports.
  ```ts
  import { requireAuth } from '../middleware/requireAuth.js'; // source is requireAuth.ts
  ```
- **TS.TYPE-IMPORT** — `import type { … }` when importing only types (erased at compile time, signals intent); put type-only imports at the bottom of their group.
- **TS.IMPORT-ORDER** — Group imports with a blank line between: framework → third-party → `@/components` → `@/hooks` → `@/types` → `@/lib`/`@/utils`/`@/constants` → assets. (Server files use the same order minus React/asset groups.)

## Comments & docs

Canonical policy: CLAUDE.md → **Comments policy** (JSDoc = the caller's contract; `//` = the maintainer's why). These are its citable TS-side enforcement.

- **TS.JSDOC-EXPORT** — Every exported function gets a JSDoc whose default is a **single summary sentence** — what it does. The editor pairs it with the typed signature, so never restate types.
  ```ts
  /** Trims and lowercases an email for comparisons and lookups. */
  export function normalizeEmail(email: string): string { ... }
  ```
- **TS.JSDOC-BUDGET** — Escalate past the summary only for a contract the signature can't express, one line each, in order: `@param` (semantics not evident from name + type), `@returns` (semantics the type doesn't carry — null cases, formats, units), `Side effect:` (email, storage, WS event), one named cross-file invariant. Ceiling (whichever fails first): summary + one line per item, never longer than the body. **Banned:** caller enumerations, design rationale, restating the type/summary, re-explaining a canonical doc.
  ```ts
  /**
   * Trims and lowercases an email for comparisons and lookups.
   * Must match the SQL `lower(trim(email))` in getUserByEmail.
   */
  ```
- **TS.COMMENT-WHY** — Inline `//` (inside bodies, above module constants) explains **why** — a non-obvious constraint, workaround, or invariant — at the exact line, one sentence. No JSDoc tags in `//`. A why lives in exactly one place, never duplicated into the header.
  ```ts
  // SFR API rejects batch sizes > 50; split before calling
  const batches = chunk(propertyIds, 50);
  ```
- **TS.NO-DEAD-COMMENT** — Delete commented-out code and obsolete comments; git is the history. A stale comment that contradicts the code is worse than none.
