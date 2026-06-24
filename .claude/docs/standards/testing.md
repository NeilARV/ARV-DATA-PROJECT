# Testing Standards

Authoritative rules for tests in this codebase (Vitest + Supertest for unit/integration,
Playwright for E2E; Express + Drizzle/Neon services, React client). Every rule has a stable ID
(`TST.*`) so `/smell`, `/test`, and `/doc-drift` can reference it. This file owns `TST.*`.

Scope: **what to test, how to test it, and when a test is mandatory.** *Which* roles/tiers may
call a route is not decided here — that's `access-control.md` (canonical); this file says how to
prove the code matches it. Server architecture rules live in `express.md`, React rules in
`react.md`, TypeScript language rules in `typescript.md`.

> Format: one directive + a tiny good/bad. Prettier owns formatting. This file is the **rules**;
> the `/test` command is the **procedure** that applies them to a diff. When the two disagree,
> this file wins.

---

## Test layers & runners

The app already runs tests at several layers — this table is the canonical map so no one again
assumes a layer is missing. Test each unit where its logic lives; don't push a service assertion
up into an HTTP test or a pure-function assertion down into a render test.

| Layer | Model file | Runner | Env | DB |
|---|---|---|---|---|
| Pure function / formatter | `orderTransactions.test.ts` | `npm run test` | node | none |
| Zod validator | *(to add)* `validation/*.test.ts` | `npm run test` | node | none |
| Middleware guard | `requireRole.test.ts` (mocks `server/storage`) | `npm run test` | node | none |
| Service (pure-enough) | `tokens.services.test.ts` | `npm run test` | node | mocked |
| Lib | `realEstatePreview.test.ts` | `npm run test` | node | none |
| WebSocket | `auth.test.ts`, `registry.test.ts` | `npm run test` | node | mocked |
| Client pure logic | `mastermind-messages.test.ts` (`mergeMessages`) | `npm run test` | node | none |
| Route / service (integration) | `tests/server/api/**/*.integration.test.ts` | `npm run test:integration` | node | real Neon branch |
| Component / hook | *(to add)* `tests/client/**` | `npm run test` (jsdom project) | jsdom | none |
| End-to-end | *(to add)* `e2e/**` | `npm run test:e2e` | browser | seeded app |

- **TST.LAYER-MAP** — A function that touches `db` is an **integration** test; a pure function is
  a fast **unit** test with no HTTP and no DB; anything that renders JSX or calls a hook is a
  **jsdom** test. Don't blur these.

---

## Coverage policy

- **TST.BEHAVIOR-FIRST** — Chase **behavior** coverage, not a line percentage: every meaningful
  path of a new feature gets a test that asserts an outcome. A measured line % (see Running) is a
  backstop, never the target.
- **TST.ASSERT-OUTCOME** — Every `it()` ends in an `expect`. A test that runs code but asserts
  nothing is false confidence plus maintenance cost — finish it or delete it.
```ts
  // Bad — executes the path, proves nothing
  it("creates a deal", async () => { await createDeal(input); });
  // Good
  it("creates a deal", async () => {
      const deal = await createDeal(input);
      expect(deal.id).toBeDefined();
  });
```
- **TST.NO-TRIVIAL** — Don't write dedicated tests for logic-free wiring: thin controllers that
  only `req → service → res`, generated Drizzle row types, presentational-only components. They're
  covered incidentally; a bespoke test there is noise.

---

## Mandatory defaults

- **TST.MANDATORY** — These ship with every applicable change, no exceptions, because they're
  cheap, deterministic, and need no running app:
  1. a **Zod unit test** when you add/change a validator in `database/validation` (or an
     insert/update schema) — accept **and** reject;
  2. a **unit test** when you add a pure util/formatter in `shared/utils`, `server/utils`, or
     `client/src/lib`;
  3. a **middleware unit test** when you add a new guard;
  4. the **integration role + validation baseline** when you add a route.
- **TST.WHEN-APPLICABLE** — These are required only when the code carries the matching risk — not
  on every change — so the policy stays enforceable instead of getting routed around:
  - **service business/ownership/state** integration tests → when the route has an ownership check
    or a state transition (deals, offers, claims), **not** for plain CRUD;
  - **error-path** tests → when the code calls a fallible downstream or maps a conflict;
  - **component/hook** tests → for a new **shared or complex** component/hook, not a presentational
    tweak;
  - **E2E** → never per-route (see TST.E2E-THIN).
```ts
  // Bad policy reading: a one-line label change must add component + e2e + error tests
  // Good: a presentational tweak adds nothing; a new ownership-gated route adds ownership + state
```
- **TST.ASK-IF-UNKNOWN** — If a new route's access rules aren't yet in `access-control.md`, **ask
  before generating** its access tests. Never guess the policy into existence.

---

## Unit tests (`npm run test` — node env, no DB)

- **TST.UNIT-PURE** — Pure functions get exhaustive unit tests over their branches and
  boundaries. Model: `orderTransactions.test.ts`. Reach for `it.each` for tabular cases.
- **TST.UNIT-ZOD** — Each validator gets per-field accept/reject: a valid object passes; each
  required field missing, each wrong type, and each out-of-range value fails. High value, zero
  deps.
```ts
  it("submitOfferSchema — rejects amount <= 0", () => {
      expect(submitOfferSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
  });
```
- **TST.UNIT-MIDDLEWARE** — Each guard (`requireAuth`/`requireAccess`/`requireRole`/`requireSub`/
  `requireMastermind`) gets a unit test that mocks `server/storage` and asserts the 401/403/`next()`
  outcomes in isolation. Model: `requireRole.test.ts`.
- **TST.UNIT-SERVICE** — Service logic that can run without a real DB is unit-tested with the data
  layer mocked; reserve the real Neon branch for integration. Model: `tokens.services.test.ts`.
- **TST.UNIT-FORMATTER** — A formatter that backs a project rule gets a test that locks the rule —
  `formatCompanyName` (pins `ARV.RAW-COMPANY-NAME`), `formatPhoneNumber`, `formatAddress`.

---

## Integration tests (`npm run test:integration` — real Neon branch)

- **TST.INT-ACCESS** — Generate access tests from the route's row in `access-control.md` per its
  §6 recipe: each allowed role/tier → `2xx`; the boundary-blocked role → `403`; unauthenticated →
  `401`; for `requireSub`, a bypass-role user with **no** subscription → `2xx`. Mock the
  controller, run the **real** middleware.
- **TST.INT-VALIDATION** — Per validated field: missing required → `400`, wrong type → `400`,
  out-of-range → `400`. Assert the `{ message, errors }` shape once per resource so the client
  form contract can't drift silently.
- **TST.INT-OWNERSHIP** — Ownership lives in the service (`express.md` EX.OWNERSHIP-IN-SERVICE),
  so run the real service with seeded data: owner → ok, privileged role → ok, authenticated
  non-owner → `403`. Respect the per-action asymmetries (RM may **delete** a deal but not **edit**
  it; message edit is author-only even for an admin).
- **TST.INT-STATE** — Assert the state change **persisted** by reading it back from the DB, not by
  trusting the return value.
```ts
  // Good — proves it actually wrote
  await submitOffer(input);
  const rows = await db.select().from(dealBids).where(eq(dealBids.dealId, input.dealId));
  expect(rows).toHaveLength(1);
```
- **TST.INT-ERROR** — For fallible downstreams and conflicts: `404` not-found; `409`
  duplicate-key/illegal-transition (deleting a non-archived channel, re-reviewing a claim);
  external failure mapped (OpenCorporates → `502`); a forced `500` returns a generic `{ message }`
  with no stack or DB text (`EX.NO-LEAK-INTERNALS`).
- **TST.INT-SIDE-EFFECT** — Assert fire-and-forget effects fired with the right inputs by reading
  the **persisted result** (e.g. the `deal_bid` notification row for the poster), and that the
  effect's failure does not fail the response (signup still `201` when the verification email
  throws). Prefer testing the pure builder (companion-MSA merge, mention precedence) over racing
  the microtask.
- **TST.WEBSOCKET** — The Mastermind event protocol and the upgrade-auth handshake get tests at
  the WS layer. Models: `auth.test.ts`, `registry.test.ts`.

---

## Frontend: component & hook (jsdom env)

- **TST.CLIENT-ENV** — Tests that render JSX or call a hook run in the **jsdom** Vitest project
  (kept separate from the node server-unit project so server units stay fast), with
  `tests/client/setup.ts` wiring `@testing-library/jest-dom` matchers and auto-cleanup.
- **TST.COMPONENT** — Component tests render the component, drive it with `user-event`, and assert
  the rendered outcome — never internal state or implementation detail. Cover loading / empty /
  populated and access-gated states (e.g. the locked feed panel when `!canAccessApp`).
- **TST.HOOK** — Hooks are tested with `renderHook`. A provider-backed hook must throw when used
  outside its Provider (`RX.PROVIDER-GUARD`); URL-state hooks assert URL ↔ state sync. Targets:
  `useFilters`, `useDealsNav`, `useView`.
- **TST.CLIENT-PURE** — Pure client logic lives in `tests/client/lib` and runs in node. Model:
  `mastermind-messages.test.ts` (`mergeMessages`).

---

## End-to-end (Playwright — not Vitest)

- **TST.E2E-THIN** — E2E is a small, maintained set of smoke flows (login → browse data, post a
  deal, send a Mastermind message), **never** a per-route requirement. It catches wiring failures
  unit/integration miss; mandating it per feature is a flakiness-and-maintenance trap.
- **TST.E2E-ISOLATED** — E2E lives in `e2e/` with its own `playwright.config.ts`, **outside** the
  Vitest globs, run only by `npm run test:e2e`. It needs a running app + seeded DB; keep it out of
  the default `test:all` gate.

---

## Mocking & fixtures

- **TST.MOCK-THE-EDGE** — Mock only the boundary you are **not** testing: external APIs (Postmark,
  SFR, OpenCorporates), `resolveMsaId`, the WS registry, or `server/storage` for a middleware
  unit. Never mock the unit under test.
```ts
  // Bad — mocking the service you're trying to prove
  vi.mock("server/services/deals/deals.services.js");
  // Good — mock only the external email side-effect
  vi.mock("server/lib/postmark.js");
```
- **TST.REAL-GATE** — In access tests, mock the controller but let the **real** guard hit the test
  branch, so a change to the gate breaks the test (otherwise the test can't regress).
- **TST.SEED-OWN** — Each test seeds and tears down its own rows via `getTestDb()` / the helpers;
  never rely on another test's leftover data.

---

## Conventions

- **TST.LOCATION** — Mirror the source tree. Integration files end `.integration.test.ts`;
  everything else is a unit test.
```
  tests/server/{api,middleware,services,utils,validation}/   e2e/
  tests/client/{components,hooks,lib}/   tests/helpers/
```
- **TST.UNIQUE-UUID** — Every integration file uses its **own** UUID suffixes for acting/target
  users; files run in parallel and shared ids collide.
- **TST.SETUP-HELPER** — Use `setupIntegrationUsers` + the `x-test-user-id` header to simulate
  login, and `assignRole`/`assignSubscription` to arrange the caller. Don't hand-roll the login
  flow.
- **TST.NAME** — Name tests `METHOD /route — <condition> — <outcome>` for HTTP, or
  `fn — <condition> — <outcome>` for units.
```
  POST /api/deals/:id/offers — basic subscriber — returns 201
  submitOffer — unknown deal — throws 404
  formatCompanyName — strips trailing entity suffix
```
- **TST.FIRST** — F.I.R.S.T.: Fast, Independent, Repeatable, Self-validating, Timely (the `/smell`
  CC.T9 lens). No ordering dependencies between tests.

---

## Running

| Command | Scope |
|---|---|
| `npm run test` | unit only (node env; excludes `*.integration.test.ts`) |
| `npm run test:watch` | unit, watch mode |
| `npm run test:integration` | integration only (needs `.env.test` → Neon branch) |
| `npm run test:all` | unit + integration, sequential |
| `npm run test:e2e` | *(to add)* Playwright smoke flows |
| `npx vitest run <path>` | a single file |

- **TST.RUN-LAYER** — Run the layer you changed: units with `npm run test`, route/service changes
  with `npm run test:integration`, both with `npm run test:all`. E2E is always run explicitly,
  never in the default gate.
- **TST.COVERAGE-BACKSTOP** — Coverage measurement is optional and advisory (`@vitest/coverage-v8`,
  not yet installed). Treat a sudden drop as a smoke alarm for an untested path, not a target;
  exclude `*.routes.ts`, `database/schemas/**`, and generated types.

> **Tooling to install for the new layers:** component/hook — `@testing-library/react`,
> `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` (or `happy-dom`), plus a
> jsdom Vitest project + `tests/client/setup.ts`. E2E — `@playwright/test`, `playwright.config.ts`,
> and a `test:e2e` script.

---

## Maintenance

- **TST.MAINT** — When a route, service, validator, or util changes: update the canonical doc
  first (`access-control.md` / `api.md` / `database.md`), then bring its tests up to this standard.
  A changed behavior with no test is a blocker, not a follow-up.