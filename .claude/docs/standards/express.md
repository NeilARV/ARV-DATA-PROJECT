# Express / Backend Standards

Authoritative rules for the server: routes, controllers, services, middleware, Drizzle data access, Zod validation, and error handling (Express + express-session + Drizzle/Neon + Zod). Every rule has a stable ID (`EX.*` for the HTTP/server layer, `DB.*` for Drizzle/data access) so `/smell` and `/doc-drift` can reference it. This file owns `EX.*` and `DB.*`.

Scope: **server architecture and data access only.** TypeScript language rules live in `typescript.md`. *Which* roles/tiers may call a route is **not** here — that's `access-control.md` (canonical). This file governs *how* the layer is built, not the authorization policy.

> Format: one directive + a tiny good/bad. Prettier owns formatting. Import paths use `.js` (Node ESM resolves the compiled output; source files are `.ts`) — see `typescript.md` TS.JS-EXT.

---

## Layering (the core rule)

- **EX.LAYER-SEPARATION** — Three layers, one job each: **routes** wire endpoints to middleware + controllers; **controllers** handle HTTP (parse, validate, call a service, respond); **services** hold business logic and all DB access. A layer never reaches past its neighbor.
- **EX.NO-LOGIC-IN-ROUTES** — Route files contain no business logic and no inline handlers — only `router.method(path, ...middleware, controller)` and `export default router`.
- **EX.NO-DB-IN-CONTROLLER** — Controllers never touch the database or contain business logic. If a controller imports `db` or writes a query, it's doing a service's job.
- **EX.NO-HTTP-IN-SERVICE** — Services never reference `req`, `res`, or `next`. They take plain inputs and return plain data; HTTP lives one layer up.
```ts
  // Bad — service knows about res
  export async function getUser(id: string, res: Response) { ... }
  // Good — service returns data; controller responds
  export async function getUser(id: string): Promise<User | null> { ... }
```

## Routes

- **EX.ROUTE-FILE** — One route file per resource, named `resource.routes.ts`; nest sub-resources in their own file (`subscriptions.routes.ts` for `/api/users/:userId/subscriptions`).
- **EX.ROUTE-THIN** — A route line declares method, path, middleware chain, and the controller. Nothing else.
```ts
  // server/routes/users.routes.ts
  import { Router } from "express";
  import { requireAuth } from "../middleware/requireAuth.js";
  import { requireRole } from "../middleware/requireRole.js";
  import * as UsersController from "../controllers/users/users.controllers.js";

  const router = Router();

  router.get("/", requireAuth, requireRole("admin"), UsersController.getUsers);
  router.get("/:userId", requireAuth, UsersController.getUserById);
  router.delete("/:userId", requireAuth, requireRole("admin"), UsersController.deleteUser);

  export default router;
```
- **EX.AUTH-ORDER** — Always apply `requireAuth` before `requireRole`/`requireSub`/`requireMastermind`. Authentication precedes authorization; the chain reads outer→inner.
- **EX.ROUTE-DEFAULT-EXPORT** — Every route file ends with `export default router`.
- **EX.MIDDLEWARE-FROM-CANON** — The specific middleware on each route must match the route's row in `access-control.md`. If you change a route's auth, update that table first (its maintenance rule), then the code.

## Controllers

- **EX.CONTROLLER-EXPORT** — Controllers are named `async function` exports annotated `Promise<void>`. One controller per handler; never in the same file as routes.
```ts
  // server/controllers/users/users.controllers.ts
  export async function getUserById(req: Request, res: Response): Promise<void> {
      try {
          const { userId } = req.params;
          const user = await UserServices.getUserById(userId);
          if (!user) {
              res.status(404).json({ message: "User not found" });
              return;
          }
          res.json({ user });
      } catch (error) {
          console.error("getUserById error:", error);
          res.status(500).json({ message: "Failed to retrieve user" });
      }
  }
```
- **EX.CONTROLLER-TRY-CATCH** — The entire controller body is wrapped in `try/catch`. The catch logs with context and returns a generic 500.
- **EX.RETURN-AFTER-SEND** — `return` immediately after sending a response so the handler can't double-send. Never `throw` after `res.json()`.
```ts
  res.status(404).json({ message: "Not found" });
  return; // required
```
- **EX.VALIDATE-FIRST** — Validate `req.body`/`params`/`query` with Zod at the top of the handler before any work; on failure return 400 immediately (see EX.ZOD-SAFEPARSE).
- **EX.NEXT-FOR-GLOBAL** — Call `next(error)` only to hand off to a global error-handler middleware; otherwise handle the error inline. Don't mix both in one handler.
- **EX.RESPONSE-SHAPE** — Keep response shapes consistent: data routes return the named payload (`{ user }`, `{ properties, total, page }`); no-content returns `204`; errors return `{ message }` (+ `errors` for validation). Don't wrap success in `{ success: true, data }` unless the existing endpoint already does.

## Services

- **EX.SERVICE-EXPORT** — Services are named `async function` exports. No HTTP types, no `req/res/next`.
- **EX.SERVICE-RAW-DATA** — Return data directly, not `{ success, data }`. The controller decides the envelope.
```ts
  // Good
  export async function getUserById(id: string): Promise<User | null> {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return user ?? null;
  }
```
- **EX.SERVICE-NULL-NOT-UNDEFINED** — A function that may return nothing returns `T | null`, never `undefined`. (`?? null` on a destructured single-row result.)
- **EX.SERVICE-FOCUSED** — One logical unit of work per service function. If it does two unrelated things, split it (mirrors `typescript.md` TS naming/SRP intent).
- **EX.OWNERSHIP-IN-SERVICE** — Resource-ownership checks (is this the owner, or a privileged role?) live in the service and return the right status to the controller, not scattered in middleware. (Per `access-control.md`, middleware gates role/tier; the service gates ownership.)

## Middleware

- **EX.MW-ONE-FN** — A middleware file exports one function. Simple `(req, res, next)` when not configurable; a **factory** that returns the middleware when it needs config.
```ts
  // Factory — name the inner fn for readable stack traces
  export function requireRole(roleOrRoles: Role | Role[]) {
      const allowed = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
      return async function requireRoleMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
          if (!req.session.userId) {
              res.status(401).json({ message: "Unauthorized — please log in" });
              return;
          }
          const userRoles = await getUserRoles(req.session.userId);
          if (!userRoles.some((r) => allowed.includes(r))) {
              res.status(403).json({ message: "Forbidden" });
              return;
          }
          next();
      };
  }
```
- **EX.MW-NEXT-OR-SEND** — Call `next()` **or** send a response — never both, never neither. Always `return` after sending.
- **EX.MW-NAMED-INNER** — Name a factory's inner function (e.g. `requireRoleMiddleware`) so stack traces are legible.
- **EX.MW-ROLE-SEMANTICS** — `requireRole` is membership-based, not hierarchical: it passes if the caller has ANY listed role. Don't encode a single-`session.role` model — query `user_roles`. Canonical semantics in `access-control.md`.

## Drizzle / data access

- **DB.DRIZZLE-ONLY** — All DB access goes through Drizzle. No raw SQL strings unless the query API genuinely can't express it, in which case use the `sql` template tag (never string-concatenate values).
```ts
  // Good
  const rows = await db.select().from(properties).where(eq(properties.msaId, msaId));
  // Bad — raw concatenation (injection risk + unindexed)
  db.execute(`SELECT * FROM properties WHERE msa_id = ${msaId}`);
```
- **DB.SINGLE-CLIENT** — Import the `db` client from its single export location. Never instantiate a Drizzle/Neon client inline in a service.
- **DB.LIMIT1-DESTRUCTURE** — For an expected single row, chain `.limit(1)` and destructure: `const [user] = await db.select()...`. Don't fetch a full array to take `[0]`.
- **DB.DERIVE-ROW-TYPES** — Type rows from the schema (`typeof users.$inferSelect`), never hand-written (see `typescript.md` TS.DERIVE-TYPES). Schema is the source of truth; the live reference is `database.md`.
- **DB.SNAKE-CAMEL** — Columns are declared with both names (`text("first_name")` → `.firstName`); rely on Drizzle's mapping, don't hand-snake-case in TS.
- **DB.NO-NPLUS1** — Don't query inside a loop. Batch with `inArray`/joins/aggregate queries; enrich lists in parallel batch queries, not per-row.
```ts
  // Bad — N+1
  for (const d of deals) { d.bids = await getBids(d.id); }
  // Good — one query, grouped in memory
  const bids = await db.select().from(dealBids).where(inArray(dealBids.dealId, deals.map(d => d.id)));
```
- **DB.UPSERT-ONCONFLICT** — Use `onConflictDoUpdate`/`onConflictDoNothing` for idempotent writes rather than read-then-write races.
- **DB.SCHEMA-LOCATION** — Schemas live in `database/schemas/*.schema.ts`, one file per table or closely-related group. Any schema change must also update `database.md` (its maintenance rule).

## Validation (Zod)

- **EX.ZOD-ALL-INPUT** — Validate every external input — request body, params, query — with Zod before use. Treat anything off the wire as untyped.
- **EX.ZOD-SAFEPARSE** — Use `safeParse` (not `parse`) in controllers so a failure becomes a 400 instead of a thrown 500.
```ts
  const result = insertUserSchema.safeParse(req.body);
  if (!result.success) {
      res.status(400).json({ message: "Invalid input", errors: result.error.errors });
      return;
  }
  const { firstName, email } = result.data;
```
- **EX.ZOD-SCHEMA-LOCATION** — Zod schemas live under `database/` (`inserts/`, `updates/`, `validation/`). Derive types with `z.infer` — never keep a hand-written type beside the schema (see `typescript.md` TS.DERIVE-TYPES).

## Error handling & status codes

- **EX.LOG-WITH-CONTEXT** — Log server errors as `console.error("<context>:", error)` so searches are meaningful. Never log secrets or full request bodies that may contain credentials.
- **EX.NO-LEAK-INTERNALS** — On a 500, return a generic `{ message }`. Never send the error object, stack trace, or DB error text to the client. Validation 400s **do** include the Zod `errors` so forms can surface them.
- **EX.NO-EMPTY-CATCH** — Never swallow an error with an empty `catch`. Handle it, log it, or rethrow — silence hides bugs.
- **EX.STATUS-CODES** — Use the standard contract:

  | Situation | Code |
  |---|---|
  | Success with data | 200 |
  | Resource created | 201 |
  | Success, no content | 204 |
  | Bad input / validation failed | 400 |
  | Not authenticated | 401 |
  | Authenticated but not authorized | 403 |
  | Resource not found | 404 |
  | Conflict (duplicate / illegal state transition) | 409 |
  | Server error | 500 |

  > 409 is used in this codebase for duplicate-key writes and illegal state transitions (e.g. deleting a non-archived channel, re-reviewing a claim). Match `access-control.md` / `api.md` for a given route.

## Side effects & async work

- **EX.FIRE-AND-FORGET** — Fire-and-forget side effects (notification emails, deal alerts) run **after** the response is sent and must not block or fail it. Catch their errors internally so a failed email never turns a 201 into a 500.
```ts
  res.status(201).json({ deal });
  void sendDealNotification(deal).catch((e) => console.error("deal notification failed:", e));
```
- **EX.AWAIT-INDEPENDENT** — Parallelize genuinely independent awaits with `Promise.all`; don't serialize them. But don't bundle dependent/unrelated work into one `Promise.all` just to shorten code (see `typescript.md` TS.ASYNC-AWAIT).

## Comments

- **EX.JSDOC-EXPORT** — Exported controllers and service functions get a short JSDoc with `@param`/`@returns` describing what they do, what they return, and any non-obvious side effect (e.g. "sends an email"). Inline `//` explains *why*.
```ts
  /**
   * Create a deal and notify MSA subscribers.
   * @param input validated deal fields (userId must match the session user)
   * @returns the created deal row
   * Side effect: fires deal-alert emails after the response (best-effort).
   */
  export async function createDeal(input: InsertDeal): Promise<Deal> { ... }
```