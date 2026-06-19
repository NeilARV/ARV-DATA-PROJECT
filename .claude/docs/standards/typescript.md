# TypeScript Standards

Authoritative rules for TypeScript **language** usage across the codebase (strict mode, ES modules, Node + Vite). Every rule has a stable ID (`TS.*`) so `/smell` and `/doc-drift` can reference it. This file owns the `TS.*` IDs.

Scope: **TypeScript language only** — types, interfaces, generics, naming, modules, functions, null/equality, enums. React-specific rules live in `react.md`; Express/controller/service/Drizzle patterns live in `express.md`; the live schema is `database.md`.

> Format: one directive + a tiny good/bad. Prettier owns all formatting (indentation, quotes as a *format*, semicolons, line width, trailing commas) — never a rule here. Quote *choice* as a semantic rule (single vs double) is TS.QUOTES below because it carries meaning beyond formatting.

---

## Strictness & `any`

- **TS.STRICT** — `"strict": true` is always on in `tsconfig.json`. Never weaken compiler strictness to make code pass.
- **TS.NO-ANY** — Never use `any`. Use `unknown` and narrow with a type guard, or define a real type.
```ts
  // Bad
  function parse(x: any) { return x.value; }
  // Good
  function parse(x: unknown) {
      if (typeof x === "object" && x !== null && "value" in x) return (x as { value: unknown }).value;
      throw new Error("unexpected shape");
  }
```
- **TS.NO-AS-ANY** — `as any` is banned outright; it disables checking silently. If you must assert, assert to the narrowest correct type.
- **TS.PREFER-GUARD** — Prefer type narrowing and user-defined type guards over `as` casts. A cast asserts; a guard verifies.
```ts
  // Good — guard verifies at runtime
  function isDeal(x: unknown): x is Deal { return typeof x === "object" && x !== null && "dealType" in x; }
```
- **TS.NO-NON-NULL** — Avoid the non-null assertion `!`. It silences a real nullable. Narrow it, or fix the type so it isn't nullable.
```ts
  // Bad
  const name = user!.firstName;
  // Good
  if (!user) return null;
  const name = user.firstName;
```
- **TS.NO-TS-IGNORE** — Never `@ts-ignore`. If a suppression is unavoidable, use `@ts-expect-error` with a one-line reason — it fails the build if the error disappears, so it can't rot.

## Types vs interfaces

- **TS.INTERFACE-VS-TYPE** — Use `interface` for **entities, domain models, and public/extensible object shapes** (DB rows, service inputs, shared shapes that may extend). Use `type` for **React props** (see `react.md` RX.PROPS-TYPE), unions, intersections, tuples, and aliases.
```ts
  // Entity → interface (extensible, better errors, declaration-merging where wanted)
  interface Company {
      id: string;
      name: string;
      isArvClient: boolean;
  }
  // Union / alias → type
  type Role = "owner" | "admin" | "relationship-manager" | "member";
```
  > Rationale: interfaces give better error messages and can extend from one spot across the app; props are a closed shape that benefits from `type` and the `.d.ts` organization we use.
- **TS.NO-HUNGARIAN** — No `I`-prefix or other Hungarian notation on interfaces/types. It's `User`, not `IUser`; `Role`, not `TRole`.
- **TS.DERIVE-TYPES** — Don't hand-write a type that mirrors a Drizzle schema or Zod schema. Derive it with `$inferSelect`/`$inferInsert` or `z.infer`, so the type can't drift from the source of truth.
```ts
  type User = typeof users.$inferSelect;
  type InsertUser = z.infer<typeof insertUserSchema>;
```
- **TS.SIMPLE-TYPES** — Prefer simple type constructs. Reach for mapped/conditional/recursive types only when they don't hurt readability; if a teammate needs a minute to decode the type, write the simpler explicit version.
```ts
  // Prefer explicit over clever when clarity suffers
  // Bad (gratuitous)
  type Keys = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };
  // Good
  type UserGetters = { getId: () => string; getName: () => string };
```
- **TS.READONLY** — Mark fields and arrays `readonly` when they're never reassigned after construction. Prefer `ReadonlyArray<T>` / `readonly T[]` for inputs you don't mutate.
```ts
  interface Config { readonly maxBatch: number; }
  function sum(xs: readonly number[]): number { ... }
```
- **TS.ARRAY-SHORTHAND** — Write array types as `T[]`, not `Array<T>` (one consistent form).
```ts
  const ids: string[] = [];      // Good
  const ids: Array<string> = []; // Bad (use T[])
```
- **TS.AS-CONST** — Use `as const` for literal arrays/objects that must not widen (e.g. a fixed option set used as a union source).
```ts
  export const DEAL_TYPES = ["wholesale", "agent", "sold", "reo"] as const;
  type DealType = (typeof DEAL_TYPES)[number];
```

## Naming

- **TS.NAME-CASE** — lowerCamelCase for variables, functions, parameters, methods, properties. UpperCamelCase (PascalCase) for types, interfaces, classes, enums, type parameters, and components.
```ts
  const searchQuery = "";          // value → lowerCamelCase
  interface FilterState { ... }    // type → UpperCamelCase
```
- **TS.CONST-NAME** — Module-level true constants that are fixed values use SCREAMING_SNAKE_CASE: `MAX_PROPERTIES_PER_MSA`. (A `const` that holds a function or object you call is still lowerCamelCase — SCREAMING is for fixed scalar/literal config.)
- **TS.BOOL-NAME** — Prefix booleans (vars and return values) with `is`/`has`/`can`/`should`.
```ts
  const isAuthenticated = true;
  const hasMore = results.length === pageSize;
```
- **TS.HANDLER-NAME** — `handleX` for an internal handler, `onX` for a callback passed to another unit. (React surface of this is `react.md` RX.HANDLER-PROP-NAME.)
- **TS.REF-SUFFIX** — Names holding a ref end in `Ref`.
- **TS.DESCRIPTIVE-NAME** — Names reveal intent and scale with scope: short for a 2-line closure, fuller for a module-level export. No cryptic abbreviations.

## Variables & equality

- **TS.CONST-DEFAULT** — `const` by default. Use `let` only where the binding is genuinely reassigned. Never `var`.
```ts
  const total = a + b;     // Good
  let page = 1;            // Good — reassigned later
  var x = 1;               // Bad — never var
```
- **TS.STRICT-EQ** — Use `===` / `!==`. The **one** allowed exception is `== null` / `!= null` to test null-or-undefined together.
```ts
  if (value == null) return; // allowed: catches null AND undefined
  if (a === b) { ... }       // everything else strict
```
- **TS.NULLISH** — Use `??` for default-on-null/undefined and `?.` for optional access, instead of `||` chains that also swallow `0`/`""`/`false`.
```ts
  const county = input.county ?? "San Diego"; // Good — only null/undefined fall through
  const county = input.county || "San Diego"; // Bad — "" would wrongly fall through
```
- **TS.NO-UNUSED** — No unused variables, parameters, imports, or types. Prefix an intentionally-unused parameter with `_`.

## Functions

- **TS.FN-DECLARATION** — Use **function declarations** for top-level, named, exported functions (hoisted, clearer stack traces). Use arrow functions for inline callbacks and handlers assigned to variables.
```ts
  export async function getUserById(id: string): Promise<User | null> { ... }  // exported → declaration
  const sorted = items.sort((a, b) => a.name.localeCompare(b.name));            // inline → arrow
```
- **TS.RETURN-TYPE** — Annotate the return type on **exported** functions. Inferred returns are fine for internal/private functions when obvious.
- **TS.NAMED-PARAMS** — For 3+ parameters, take a single named object and destructure in the signature; don't line up positional args.
```ts
  // Good
  export async function createUser({ email, password, role }: CreateUserParams) { ... }
  // Bad
  export async function createUser(email: string, password: string, role: string) { ... }
```
- **TS.ASYNC-AWAIT** — Always `async/await`; never raw `.then()/.catch()` chains. Use `Promise.all` only when the operations are truly independent and parallel — don't bundle unrelated awaits into one just to save lines.
- **TS.NO-PARAM-PROPS** — Don't use constructor parameter properties (`constructor(private x: T)`) as a shorthand. Declare fields explicitly so the class shape is readable at a glance.

## Enums

- **TS.ENUM-CONSISTENT** — Keep the existing project approach: union-of-string-literal types (often `as const` + indexed, or `z.enum`) where the values double as data/validation, and runtime `enum` only where one is already in use. Don't migrate existing enums wholesale; match the surrounding pattern. When you do write a runtime enum, it and its members are PascalCase.
```ts
  // Preferred for data-shaped values (matches Drizzle/Zod usage)
  type DealType = "wholesale" | "agent" | "sold" | "reo";
```

## Modules

- **TS.ES-MODULES** — ES modules everywhere: `import`/`export`. Never `require()`/`module.exports`. No `namespace`/internal modules — a file is the module boundary.
```ts
  import { db } from "@/lib/db";   // Good
  const db = require("./db");       // Bad
```
- **TS.JS-EXT** — In server-side import paths, include the **`.js`** extension even though the source is `.ts` — Node ESM resolves the compiled output and requires it.
```ts
  import { requireAuth } from "../middleware/requireAuth.js"; // Good (source is requireAuth.ts)
  import { requireAuth } from "../middleware/requireAuth";    // Bad — unresolved under Node ESM
```
  > If a path-alias or bundler resolver is configured to omit extensions, follow that for aliased imports — but relative server imports use `.js`.
- **TS.TYPE-IMPORT** — Use `import type { … }` when importing only types; it's erased at compile time and signals intent. Put type-only imports at the bottom of their import group.
```ts
  import type { Request, Response } from "express";
```
- **TS.IMPORT-ORDER** — Group imports (blank line between groups): framework → third-party → `@/components` → `@/hooks` → `@/types` → `@/lib`/`@/utils`/`@/constants` → assets. (Client-facing detail; server files use the same ordering minus the React/asset groups.)

## Comments & docs (Option A — defer to code-standards.md §18)

- **TS.JSDOC-EXPORT** — Exported functions get a short JSDoc describing **what** they do and return, and any non-obvious parameter or constraint. This is encouraged for reviewability and doubles as editor tooltips.
```ts
  /**
   * Look up a user by id.
   * @returns the user, or null if no row matches.
   */
  export async function getUserById(id: string): Promise<User | null> { ... }
```
- **TS.COMMENT-WHY** — Inline `//` comments explain **why** (a non-obvious constraint, a workaround, a subtle invariant), not what the code plainly does. A comment that restates the code is noise; a comment that prevents a future mistake earns its place.
```ts
  // SFR API rejects batch sizes > 50; split before calling
  const batches = chunk(propertyIds, 50);
```
- **TS.NO-DEAD-COMMENT** — Delete commented-out code and obsolete comments. Version control is the history; a stale comment that contradicts the code is worse than none.