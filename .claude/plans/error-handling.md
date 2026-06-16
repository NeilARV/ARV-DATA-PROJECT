# Error Handling Migration — Status, Plan & Reference

> **Status: Phase 0 (infrastructure built, wiring not finished).**
> The plumbing for a global, secure error-handling architecture is in place and the
> service layer is partly using it, but **no request currently flows through the intended
> path**. Controllers still catch locally and the `asyncHandler` wrapper is used in zero
> routes. This document explains what exists, why, and how to finish it.

---

## 1. The problem we are solving

The original error handling had two defects:

1. **Information leak.** The old inline error handler in `app.ts` trusted any `err.statusCode`
   and echoed `err.message` for **every** error. That sends Postgres error text, internal
   assertions, and stack details straight to the client. Anything internal could leak.
2. **Duplication.** Every controller re-implemented the same try/catch → `console.error` →
   `res.status(500)` block by hand, and every validation re-implemented the same
   `safeParse` → `res.status(400).json({ message, errors })` block.

The fix is the standard Express architecture:

- A central error type (`ServiceError`) that carries an HTTP status.
- Thin controllers that **throw** instead of catching.
- **One** global error handler that translates errors into HTTP responses and **never leaks
  internals** — it only exposes messages it has explicitly opted into.

---

## 2. The pieces (what each file does)

### `server/lib/error.ts` — `ServiceError`
Base `Error` subclass carrying an HTTP `statusCode` and optional `details`.

```ts
new ServiceError(404, 'Property not found');
new ServiceError(400, 'Invalid input', zodIssues); // details → client `errors` field
```

- `this.name = new.target.name` auto-fills the name for subclasses (no boilerplate).
- Domain subclasses exist for readability and future type-matching:
  - `MessageServiceError` — `server/services/messages/messages.services.ts`
  - `ReactionServiceError` — `server/services/messages/reactions.services.ts`
  - `AttachmentServiceError` — `server/services/messages/attachments.services.ts`

### `server/middleware/errorHandler.ts` — the global handler
The **single place errors become HTTP responses**. Registered dead-last in `app.ts`
(after all routes). Order of handling:

1. `res.headersSent` → bail to `next(err)` (response already streaming; can't send twice).
2. `ServiceError` → use its `statusCode` + message; attach `errors` when `details` present.
3. Exposable http-errors (`expose: true`, from body-parser) → malformed JSON (400),
   payload-too-large (413). Safe to show.
4. Everything else → `console.error` with context + generic `500 Internal Server Error`.

This file also contains `handleServiceError(res, err, fallbackMessage)` — the **transitional**
helper (see §4). It runs the same translation logic but is called manually from inside a
controller's catch block. It is meant to be **deleted** once every controller is migrated.

### `server/utils/asyncHandler.ts`
Wraps an async route handler so a rejected promise is forwarded to `next` → the global handler.

```ts
router.get('/:id', asyncHandler(getPropertyController));
```

- Needed **only because we are on Express 4**, which does not auto-forward async rejections.
- On Express 5 this becomes a no-op → delete the wrapper and unwrap routes.
- **Currently used in zero routes.**

### `server/utils/validate.ts`
Zod glue. `validate(schema, data, message?)` returns typed data or throws
`ServiceError(400, message, zodIssues)`. Replaces the repeated `safeParse` + manual 400 block.

- **Client contract:** `{ message, errors }` where `errors` is the raw Zod `error.errors`
  array. `serviceErrorBody()` in the handler must keep producing exactly this shape.

---

## 3. Target architecture (how the layers divide responsibility)

```
ROUTE        wraps the controller in asyncHandler, attaches middleware (requireAuth, etc.)
              router.post('/', requireAuth, asyncHandler(createDealController))

CONTROLLER   HTTP adapter only. NO try/catch.
              - validate(schema, req.body)  → throws 400 on bad input
              - call the service
              - shape the HTTP response (res.status(201).json(...))
              - let any throw bubble to the global handler

SERVICE      business logic + the ONLY place that decides "this is a 404 / 409 / 429".
              - throw new XServiceError(status, msg) for EXPECTED failures
              - let UNEXPECTED errors (DB, etc.) bubble as-is → become a generic 500

errorHandler  catches everything, translates to the safe HTTP response
```

A fully-migrated controller has **no try/catch**:

```ts
export async function createDealController(req: Request, res: Response): Promise<void> {
    const data = validate(createDealSchema, req.body);
    const deal = await createDeal({ ...data, userId: req.session.userId! });
    res.status(201).json({ deal });
}
```

…and its route wraps it:

```ts
router.post('/', requireAuth, asyncHandler(createDealController));
```

### Rule of thumb: who throws what
- **Service** throws `ServiceError`/subclass for *expected* business failures (not found,
  forbidden, conflict, rate-limited, invalid state).
- **Controller** throws only via `validate()` (bad request shape). Otherwise it just calls
  the service and shapes the response.
- **Unexpected** errors (DB down, null deref, bug) are never thrown deliberately — they
  bubble untyped and the handler turns them into a blind 500. This is the safety guarantee.

---

## 4. Where we actually are vs. the target

| Layer | State |
|---|---|
| `errorHandler` registered globally | ✅ done — `server/app.ts` (final middleware) |
| `ServiceError` + domain subclasses | ✅ done — messages / reactions / attachments |
| Services throw `ServiceError` | ✅ partly — messages, channels, posts, deals, notifications, claims |
| Controllers use `throw` + no try/catch | ❌ **not done** — even "migrated" domains still try/catch + `handleServiceError` |
| Routes use `asyncHandler` | ❌ **not done anywhere** |
| `validate()` used in controllers | ❌ barely — messages controllers still inline `safeParse` |
| Old domains (properties, auth, admin, companies, users, geocoding…) | ❌ bare try/catch + inline `console.error` + 500 |

**Honest status:** Phase 0. The service layer is ahead of the controllers. The messages
domain is furthest along but still uses the transitional `handleServiceError` rather than
throwing to the global handler. Properties/auth/admin/etc. are fully on the old pattern.

Two error paths are live simultaneously today (global handler **and** per-controller
`handleServiceError` / raw try/catch). That is expected mid-migration, but the
"internals never leak" guarantee only fully holds once a route routes through the global
handler. (The old bare-catch controllers also return generic 500s, so they don't leak
either — they just duplicate the logic by hand, which is what we're removing.)

---

## 5. Is this best practice?

Yes. A central error class with an HTTP status → thin controllers that throw → one global
handler that translates and never leaks is **the** standard Express error-handling
architecture, and the allowlist security posture (only expose what you opted into) is
correct. Two caveats:

1. **It's only a win once the wiring is finished.** Until then we maintain two paths.
2. **`MulterError` is a known hole.** File-upload size-limit errors carry no `status` and no
   `expose`, so they currently fall through to a generic 500. **Not a regression** (the old
   handler also returned 500; no per-route multer handling exists). When the attachments
   domain is migrated, add a `MulterError → 413/400` branch to `errorHandler`. The
   Mastermind bucket enforces ≤10 MB — keep the handler in sync with the server allowlist in
   `server/services/messages/attachments.services.ts`.

---

## 6. Jobs are a separate story — do NOT apply this pattern there

`server/jobs` (`clean-cache.ts`, `data_v2`, `email`, `enrich-companies.ts`) are **not HTTP
requests**. There is no `res`, no Express, no global handler in their path.
`ServiceError` / `errorHandler` / `asyncHandler` are all HTTP concepts and do **not** apply.

Jobs need their own discipline:
- Wrap each run in a top-level try/catch so one failure doesn't crash the scheduler.
- Log with context (`console.error`) — same as the handler's fallback branch.
- Decide retry/skip semantics per job.

**Shared services** (called by both a controller and a job) may still throw `ServiceError`.
The controller path translates it to HTTP; the job path simply catches and logs and ignores
the status code. That is fine and expected.

---

## 7. How to finish the migration (where to apply, in order)

Do it **one domain at a time**, lowest-risk order. Messages is the natural first domain since
its services already throw `ServiceError`.

Per domain:

1. **Route file** → wrap each async controller in `asyncHandler(...)`.
2. **Controller file** → delete the try/catch; replace `safeParse` blocks with `validate(...)`;
   let throws bubble; remove the `handleServiceError` import.
3. **Service file** → ensure expected failures `throw new XServiceError(status, msg)` rather
   than returning `null`/`false` that the controller turns into a status.
4. **Tests** → run the access-control + validation integration tests (`.claude/docs/testing.md`)
   to prove the error-response shape (`{ message }` / `{ message, errors }`) did not change.

Global cleanup, after **all** controllers are converted:

5. Delete `handleServiceError` from `server/middleware/errorHandler.ts`.
6. When upgrading to Express 5: delete `asyncHandler` and unwrap the routes.

---

## 8. Tips, gotchas & conventions

- **Never widen what's exposed.** Only `ServiceError` and `expose: true` http-errors surface
  a message. Don't add a branch that echoes arbitrary `err.message` — that reintroduces the
  original leak.
- **Validation shape is a contract.** Keep `{ message, errors }` with `errors` = raw Zod
  `error.errors`. The client depends on it; `serviceErrorBody()` must keep producing it.
- **Status decisions live in the service**, not the controller. The controller's only error
  responsibility is input validation via `validate()`.
- **Don't catch just to re-throw.** Once a route uses `asyncHandler`, a bare `throw` in the
  controller is the correct, complete pattern. Local try/catch is only for the transitional
  period or for genuinely secondary work that must not fail the request (e.g. the
  notification fan-out in `createMessageController`, which is intentionally caught and logged
  so a notification failure never fails a delivered message).
- **One-directional imports.** `errorHandler` and `validate` import from `lib/error`; nothing
  imports back. No circular imports — keep it that way.
- **body-parser 400/413** carry `expose: true` and correctly surface as 4xx. Do not flag this
  as a regression.

---

## 9. Key file index

| File | Role |
|---|---|
| `server/lib/error.ts` | `ServiceError` base class |
| `server/middleware/errorHandler.ts` | Global handler + transitional `handleServiceError` |
| `server/utils/asyncHandler.ts` | Forwards async rejections (Express 4 only) |
| `server/utils/validate.ts` | Zod → `ServiceError(400, …)` |
| `server/app.ts` | Registers `errorHandler` as final middleware |
| `server/services/messages/*.services.ts` | Reference: services that already throw `ServiceError` |
| `server/controllers/messages/messages.controllers.ts` | Reference: furthest-along (but still transitional) controller |
