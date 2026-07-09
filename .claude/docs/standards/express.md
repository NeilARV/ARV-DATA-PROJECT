# Express / Backend Standards

Authoritative rules for the server: routes, controllers, services, middleware, Drizzle, Zod, error handling (Express + express-session + Drizzle/Neon + Zod). `EX.*` = HTTP/server layer, `DB.*` = Drizzle/data access — both cited by the review skills (`/smell`, `/audit`, `/hunt`, `/doc-drift`) and owned here. TypeScript language rules → `typescript.md`. *Which* roles/tiers may call a route is **not** here — that's `access-control.md` (canonical). This file governs *how* the layer is built, not the authorization policy.

> One directive + a tiny good/bad. Prettier owns formatting. Relative server import paths use `.js` (TS.JS-EXT).

---

## Layering (the core rule)

- **EX.LAYER-SEPARATION** — Three layers, one job each: **routes** wire endpoints to middleware + controllers; **controllers** handle HTTP (parse, validate, call a service, respond); **services** hold business logic and all DB access. A layer never reaches past its neighbor.
- **EX.NO-LOGIC-IN-ROUTES** — Route files hold no business logic and no inline handlers — only `router.method(path, ...middleware, controller)` and `export default router`.
- **EX.NO-DB-IN-CONTROLLER** — Controllers never touch the DB or hold business logic. A controller that imports `db` or writes a query is doing a service's job.
- **EX.NO-HTTP-IN-SERVICE** — Services never reference `req`/`res`/`next`; they take plain inputs and return plain data.
  ```ts
  export async function getUser(id: string, res: Response) { ... }        // Bad — service knows res
  export async function getUser(id: string): Promise<User | null> { ... } // Good
  ```

## Routes

- **EX.ROUTE-FILE** — One route file per resource, `resource.routes.ts`; nest sub-resources in their own file (`subscriptions.routes.ts` for `/api/users/:userId/subscriptions`).
- **EX.ROUTE-THIN** — A route line declares method, path, middleware chain, and controller — nothing else.
  ```ts
  router.get('/', requireAuth, requireRole('admin'), UsersController.getUsers);
  router.delete('/:userId', requireAuth, requireRole('admin'), UsersController.deleteUser);
  ```
- **EX.AUTH-ORDER** — Apply `requireAuth` before `requireRole`/`requireSub`/`requireMastermind`; authentication precedes authorization, chain reads outer→inner.
- **EX.ROUTE-DEFAULT-EXPORT** — Every route file ends with `export default router`.
- **EX.MIDDLEWARE-FROM-CANON** — Middleware on each route must match that route's row in `access-control.md`. Change the table first, then the code.

## Controllers

- **EX.CONTROLLER-EXPORT** — Controllers are named `async function` exports annotated `Promise<void>`; one per handler, never in the route file.
- **EX.CONTROLLER-TRY-CATCH** — The whole controller body is wrapped in `try/catch`; the catch logs with context and returns a generic 500.
  ```ts
  export async function getUserById(req: Request, res: Response): Promise<void> {
      try {
          const user = await UserServices.getUserById(req.params.userId);
          if (!user) { res.status(404).json({ message: 'User not found' }); return; }
          res.json({ user });
      } catch (error) {
          console.error('getUserById error:', error);
          res.status(500).json({ message: 'Failed to retrieve user' });
      }
  }
  ```
- **EX.RETURN-AFTER-SEND** — `return` immediately after sending a response so the handler can't double-send; never `throw` after `res.json()`.
- **EX.VALIDATE-FIRST** — Validate `req.body`/`params`/`query` with Zod at the top of the handler before any work; on failure return 400 (EX.ZOD-SAFEPARSE).
- **EX.NEXT-FOR-GLOBAL** — Call `next(error)` only to hand off to a global error handler; otherwise handle inline. Don't mix both in one handler.
- **EX.RESPONSE-SHAPE** — Consistent shapes: data routes return the named payload (`{ user }`, `{ properties, total, page }`); no-content returns `204`; errors return `{ message }` (+ `errors` for validation). Don't wrap success in `{ success, data }` unless the endpoint already does.

## Services

- **EX.SERVICE-EXPORT** — Services are named `async function` exports; no HTTP types, no `req/res/next`.
- **EX.SERVICE-RAW-DATA** — Return data directly, not `{ success, data }`; the controller decides the envelope.
  ```ts
  export async function getUserById(id: string): Promise<User | null> {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return user ?? null;
  }
  ```
- **EX.SERVICE-NULL-NOT-UNDEFINED** — A function that may return nothing returns `T | null`, never `undefined` (`?? null` on a destructured single row).
- **EX.SERVICE-FOCUSED** — One logical unit of work per service function; split it if it does two unrelated things.
- **EX.OWNERSHIP-IN-SERVICE** — Resource-ownership checks (owner, or a privileged role?) live in the service and return the right status to the controller — not in middleware. (Middleware gates role/tier; the service gates ownership.)

## Middleware

- **EX.MW-ONE-FN** — A middleware file exports one function: a plain `(req, res, next)` when not configurable, or a **factory** returning the middleware when it needs config.
  ```ts
  export function requireRole(roleOrRoles: Role | Role[]) {
      const allowed = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
      return async function requireRoleMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
          if (!req.session.userId) { res.status(401).json({ message: 'Unauthorized — please log in' }); return; }
          const userRoles = await getUserRoles(req.session.userId);
          if (!userRoles.some((r) => allowed.includes(r))) { res.status(403).json({ message: 'Forbidden' }); return; }
          next();
      };
  }
  ```
- **EX.MW-NEXT-OR-SEND** — Call `next()` **or** send a response — never both, never neither; always `return` after sending.
- **EX.MW-NAMED-INNER** — Name a factory's inner function (`requireRoleMiddleware`) for legible stack traces.
- **EX.MW-ROLE-SEMANTICS** — `requireRole` is membership-based, not hierarchical: it passes if the caller has ANY listed role. Query `user_roles`, don't encode a single-`session.role` model. (Canonical: `access-control.md`.)

## Drizzle / data access

- **DB.DRIZZLE-ONLY** — All DB access goes through Drizzle. No raw SQL unless the query API genuinely can't express it — then the `sql` template tag, never string-concatenated values.
  ```ts
  const rows = await db.select().from(properties).where(eq(properties.msaId, msaId)); // Good
  db.execute(`SELECT * FROM properties WHERE msa_id = ${msaId}`);                     // Bad — injection + unindexed
  ```
- **DB.SINGLE-CLIENT** — Import `db` from its single export location; never instantiate a Drizzle/Neon client inline.
- **DB.LIMIT1-DESTRUCTURE** — For an expected single row, chain `.limit(1)` and destructure: `const [user] = await db.select()...`. Don't fetch an array to take `[0]`.
- **DB.DERIVE-ROW-TYPES** — Type rows from the schema (`typeof users.$inferSelect`), never hand-written (TS.DERIVE-TYPES). Live reference: `database.md`.
- **DB.SNAKE-CAMEL** — Columns declare both names (`text('first_name')` → `.firstName`); rely on Drizzle's mapping, don't hand-snake-case in TS.
- **DB.NO-NPLUS1** — Don't query inside a loop; batch with `inArray`/joins/aggregates, enrich lists in parallel batch queries.
  ```ts
  for (const d of deals) { d.bids = await getBids(d.id); }                              // Bad — N+1
  const bids = await db.select().from(dealBids).where(inArray(dealBids.dealId, ids));   // Good
  ```
- **DB.UPSERT-ONCONFLICT** — Use `onConflictDoUpdate`/`onConflictDoNothing` for idempotent writes over read-then-write races.
- **DB.SCHEMA-LOCATION** — Schemas live in `database/schemas/*.schema.ts`, one file per table/related group. Any schema change also updates `database.md`.

## Validation (Zod)

- **EX.ZOD-ALL-INPUT** — Validate every external input — body, params, query — with Zod before use; treat anything off the wire as untyped.
- **EX.ZOD-SAFEPARSE** — Use `safeParse` (not `parse`) in controllers so a failure becomes a 400, not a thrown 500.
  ```ts
  const result = insertUserSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ message: 'Invalid input', errors: result.error.errors }); return; }
  const { firstName, email } = result.data;
  ```
- **EX.ZOD-SCHEMA-LOCATION** — Zod schemas live under `database/` (`inserts/`, `updates/`, `validation/`); derive types with `z.infer`, never a hand-written type beside the schema (TS.DERIVE-TYPES).

## Error handling & status codes

- **EX.LOG-WITH-CONTEXT** — Log server errors as `console.error('<context>:', error)`. Never log secrets or full request bodies that may hold credentials.
- **EX.NO-LEAK-INTERNALS** — On a 500, return a generic `{ message }` — never the error object, stack, or DB error text. Validation 400s **do** include the Zod `errors`.
- **EX.NO-EMPTY-CATCH** — Never swallow an error with an empty `catch`; handle, log, or rethrow.
- **EX.STATUS-CODES** — Standard contract:

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

  > 409 = duplicate-key writes and illegal state transitions (deleting a non-archived channel, re-reviewing a claim). Match `access-control.md` / `api.md` per route.

## Side effects & async work

- **EX.FIRE-AND-FORGET** — Fire-and-forget side effects (notification emails, deal alerts) run **after** the response and must not block or fail it; catch their errors internally so a failed email never turns a 201 into a 500.
  ```ts
  res.status(201).json({ deal });
  void sendDealNotification(deal).catch((e) => console.error('deal notification failed:', e));
  ```
- **EX.AWAIT-INDEPENDENT** — Parallelize genuinely independent awaits with `Promise.all`; don't serialize them, and don't bundle dependent/unrelated work into one just to shorten code (TS.ASYNC-AWAIT).

## Comments

Canonical policy: CLAUDE.md → **Comments policy**; budget + banned list: TS.JSDOC-BUDGET.

- **EX.JSDOC-EXPORT** — Exported controllers and services get a JSDoc whose default is a **single sentence**. Escalate per TS.JSDOC-BUDGET only for contracts the signature can't express — in services usually a `Side effect:` line or non-obvious `@param`. Inline `//` explains *why* (TS.COMMENT-WHY).
  ```ts
  /** Marks a deal sold; null when no deal matches. */
  export async function markDealSold(dealId: string): Promise<Deal | null> { ... }

  /**
   * Creates a deal and notifies MSA subscribers.
   * @param input userId must match the session user
   * Side effect: fires deal-alert emails after the response (best-effort).
   */
  export async function createDeal(input: InsertDeal): Promise<Deal> { ... }
  ```
