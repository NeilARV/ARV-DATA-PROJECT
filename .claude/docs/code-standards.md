# Coding Standards — ARV Data Project

This document is the authoritative reference for coding conventions across the entire codebase. All new code and code reviews should be held against these standards. When in doubt, follow the patterns already established in the codebase rather than inventing new ones.

---

## Table of Contents

1. [General Principles](#1-general-principles)
2. [TypeScript](#2-typescript)
3. [Naming Conventions](#3-naming-conventions)
4. [File & Folder Organization](#4-file--folder-organization)
5. [Import Order](#5-import-order)
6. [Functions](#6-functions)
7. [React Components](#7-react-components)
8. [React Hooks](#8-react-hooks)
9. [State Management](#9-state-management)
10. [Data Fetching (TanStack Query)](#10-data-fetching-tanstack-query)
11. [Express Routes](#11-express-routes)
12. [Controllers](#12-controllers)
13. [Services](#13-services)
14. [Middleware](#14-middleware)
15. [Database (Drizzle ORM)](#15-database-drizzle-orm)
16. [Validation (Zod)](#16-validation-zod)
17. [Error Handling](#17-error-handling)
18. [Comments & Documentation](#18-comments--documentation)
19. [Formatting & Style](#19-formatting--style)

---

## 1. General Principles

- **Clarity over cleverness.** Code is read far more often than it is written. Optimize for the next developer reading it.
- **Consistency over preference.** Follow the established pattern in the surrounding code, even if you personally prefer something different.
- **One responsibility.** Functions, components, and modules should do one thing well. If you need to say "and" to describe what something does, consider splitting it.
- **No dead code.** Remove unused variables, imports, functions, and commented-out blocks. Version control is the history.
- **No speculative abstraction.** Don't build abstractions for hypothetical future uses. Three similar lines is better than a premature helper.
- **Fail loudly.** Prefer explicit errors and early returns over silent fallbacks that hide bugs.

---

## 2. TypeScript

- Strict mode is always on — `"strict": true` in `tsconfig.json`.
- Never use `any`. Use `unknown` and narrow with type guards, or define a proper type.
- Prefer `interface` for object shapes that describe entities or component props. Use `type` for unions, intersections, and aliases.
- Prefer `type` imports when importing only a type — `import type { Foo } from "..."`.
- Use `$inferSelect` and `z.infer` to derive types from Drizzle schemas and Zod schemas rather than writing them by hand.
- Always annotate function return types on exported functions; infer return types on internal/private functions when they are obvious.
- Use `as const` for literal arrays and objects that should not be widened.

```ts
// Good
interface UserProps {
    userId: string;
    role: Role;
}

type Role = "admin" | "owner" | "user";

// Bad
const role: any = getRole();
```

---

## 3. Naming Conventions

### General

| Thing | Convention | Example |
|---|---|---|
| Variables | `camelCase` | `searchQuery`, `userList` |
| Functions | `camelCase` | `getUserById`, `handleSubmit` |
| Constants (module-level) | `SCREAMING_SNAKE_CASE` | `MAX_PROPERTIES_PER_MSA` |
| Classes | `PascalCase` | `DatabaseError` |
| Interfaces | `PascalCase` | `UserProps`, `FilterState` |
| Types | `PascalCase` | `Role`, `PropertyStatus` |
| Enums | `PascalCase` (members `PascalCase` too) | `Status.Active` |

### Booleans

Prefix boolean variables and return values with `is`, `has`, `can`, or `should`:

```ts
const isAuthenticated = true;
const hasMore = results.length === pageSize;
const canAccessAdmin = user.role === "admin";
const shouldRefetch = staleness > threshold;
```

### Event Handlers

Prefix with `handle` for internal handlers, `on` for prop/callback names passed to children:

```tsx
// Internal handler defined in the component
function handleSubmit(e: FormEvent) { ... }

// Prop name passed down to a child component
<Button onClick={onSave} />
```

### Refs

Suffix with `Ref`:

```ts
const searchInputRef = useRef<HTMLInputElement>(null);
const menuRef = useRef<HTMLDivElement>(null);
```

### Server Constructs

- Route files: `resource.routes.ts` (e.g., `auth.routes.ts`)
- Controller files: `resource.controller.ts` (e.g., `users.controller.ts`)
- Service files: `resource.services.ts` (e.g., `users.services.ts`)
- Middleware files: `camelCase.ts` (e.g., `requireAuth.ts`, `requireRole.ts`)

---

## 4. File & Folder Organization

### Client

```
client/src/
├── components/
│   ├── ui/             # Radix/shadcn primitive wrappers — no business logic
│   └── <feature>/      # Feature-grouped components (admin/, data/, modals/, etc.)
├── pages/              # One file per route; default export only
├── hooks/              # Custom hooks; one hook per file
├── lib/                # Third-party integrations, query client, API helpers
├── utils/              # Pure utility functions
├── types/              # Shared TypeScript types and interfaces
└── constants/          # App-wide constants
```

### Server

```
server/
├── routes/             # Express routers; wire up middleware and controllers only
├── controllers/        # Request/response handling; delegates to services
│   └── <domain>/       # Grouped by domain (auth/, users/, etc.)
├── services/           # Business logic and database access
├── middleware/         # Express middleware functions
├── jobs/               # Cron jobs and background tasks
│   └── processes/      # Individual pipeline step functions
├── lib/                # External service integrations (email, maps, etc.)
├── utils/              # Pure server-side utilities
└── constants/          # Server-wide constants
```

### Database

```
database/
├── schemas/            # Drizzle table definitions (*.schema.ts)
├── types/              # Type definitions derived from schemas (*.d.ts)
├── inserts/            # Zod schemas for insert operations
├── updates/            # Zod schemas for update operations
└── validation/         # Shared Zod validation schemas
```

---

## 5. Import Order

Group imports in this order, with a blank line between each group:

1. React and core framework (`react`, `react-dom`)
2. Third-party libraries (`wouter`, `@tanstack/react-query`, `lucide-react`, etc.)
3. Internal components (`@/components/...`)
4. Internal hooks (`@/hooks/...`)
5. Internal types (`@/types/...`)
6. Internal utilities and libraries (`@/lib/...`, `@/utils/...`, `@/constants/...`)
7. Assets (`@assets/...`)

```tsx
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Map, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useAuth } from "@/hooks/use-auth";
import { useFilters } from "@/hooks/useFilters";

import type { HeaderProps } from "@/types/general";

import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/utils/format";

import darkLogoUrl from "@assets/arv-data-logo-dark.png";
```

Type-only imports (`import type`) should go at the bottom of their group.

---

## 6. Functions

### Declarations vs Expressions

- Use **function declarations** for top-level, named, exported functions. They are hoisted and read clearly.
- Use **arrow functions** for inline callbacks, event handlers assigned to variables, and anonymous functions passed as arguments.

```ts
// Top-level exported function — use declaration
export async function getUserById(id: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
}

// Inline callback — use arrow function
const sorted = items.sort((a, b) => a.name.localeCompare(b.name));

// Event handler variable — use arrow function
const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    doSomething();
};
```

### Parameters

- Prefer named object parameters over positional parameters when a function takes more than two arguments.
- Always destructure in the signature for clarity.

```ts
// Good
export async function createUser({ email, password, role }: CreateUserParams) { ... }

// Avoid for 3+ args
export async function createUser(email: string, password: string, role: string) { ... }
```

### Async / Await

- Always use `async/await`. Never use raw `.then()` / `.catch()` chains.
- `await` each async call individually — don't bundle unrelated async work into a single `await Promise.all` just to save lines. Use `Promise.all` intentionally when the operations are truly parallel.

---

## 7. React Components

### File Naming

Component files use **PascalCase** and match the name of the component they export:

```
UserContactForm.tsx   → export function UserContactForm(...)
PropertyCard.tsx      → export function PropertyCard(...)
NotificationPreferencesPanel.tsx → export function NotificationPreferencesPanel(...)
```

Util files use **camelCase** and match the same name of the component they export:

```
formatPhoneNumber.ts → export function formatPhoneNumber(...) 
merge.ts --> export function merge(...)
```

One component per file. The file name and the exported function name must be identical.

### Structure

Use **function declarations** with `export` for feature components:

```tsx
export function UserProfile({ userId }: UserProfileProps) {
    const { user, isLoading } = useUser(userId);

    if (isLoading) return <Spinner />;
    if (!user) return <NotFound />;

    return (
        <div className="...">
            <h1>{user.firstName}</h1>
        </div>
    );
}
```

Use **function declarations** with `export default` for page components:
```tsx
export default function Home() {
    return (
        <>
        </>
    )
}

Use **named exports** for UI primitive wrappers and shared utility components:

```tsx
export function StatusBadge({ status }: StatusBadgeProps) { ... }
```

### Props

- Define props with an `type`, not an inline type or `interface` alias.
- Name the interface `<ComponentName>Props`.
- Keep prop interfaces in the same file as the component unless they are shared across multiple components, in which case they go in `client/src/types/`.

```tsx
type UserCardProps = {
    userId: string;
    showActions?: boolean;
    onSelect?: (userId: string) => void;
}

export default function UserCard({ userId, showActions = false, onSelect }: UserCardProps) { ... }
```

### Component Organization (top to bottom)

1. Props destructuring (in the signature)
2. Hook calls (state, context, queries, custom hooks)
3. Derived values and memos
4. Event handler functions
5. Early return conditions (loading, error, empty)
6. JSX return

```tsx
export default function PropertyList({ msaId }: PropertyListProps) {
    // 1. Hooks
    const { filters } = useFilters();
    const [page, setPage] = useState(1);
    const { data, isLoading } = useProperties({ msaId, filters, page });

    // 2. Derived values
    const hasResults = (data?.properties.length ?? 0) > 0;

    // 3. Handlers
    function handlePageChange(next: number) {
        setPage(next);
    }

    // 4. Early returns
    if (isLoading) return <Spinner />;
    if (!hasResults) return <EmptyState />;

    // 5. Render
    return (
        <ul>
            {data.properties.map((p) => (
                <PropertyCard key={p.id} property={p} />
            ))}
        </ul>
    );
}
```

### JSX Rules

- One component per file.
- Self-close elements with no children: `<Input />` not `<Input></Input>`.
- Boolean props omit the value when `true`: `<Button disabled />` not `<Button disabled={true} />`.
- Ternaries in JSX are fine for simple conditions. For complex branching, extract to a variable or a helper component before the return.
- Do not use index as `key` when the list can be reordered or filtered; use a stable identifier.

---

## 8. React Hooks

### Custom Hooks

- All custom hooks are **named exports** using function declarations.
- The file name matches the hook name in kebab-case: `use-auth.ts` for `useAuth`, `use-filters.ts` for `useFilters`.
- Every hook starts with `use`.
- A hook that requires a Provider must throw a descriptive error when used outside it.

```ts
// client/src/hooks/use-filters.ts

export function useFilters(): FiltersContextValue {
    const ctx = useContext(FiltersContext);
    if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
    return ctx;
}
```

### Context + Hook Pattern

For shared state that multiple components consume, use the Context + custom hook pattern:

```tsx
// Provider and hook live in the same file
const FiltersContext = createContext<FiltersContextValue | null>(null);

export function FiltersProvider({ children, defaultOverrides }: FiltersProviderProps) {
    const [filters, setFilters] = useState<PropertyFilters>(() =>
        getDefaultFilters(defaultOverrides)
    );

    return (
        <FiltersContext.Provider value={{ filters, setFilters }}>
            {children}
        </FiltersContext.Provider>
    );
}

export function useFilters(): FiltersContextValue {
    const ctx = useContext(FiltersContext);
    if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
    return ctx;
}
```

### useEffect

- Keep effects small and focused. Prefer multiple `useEffect` calls over one large effect that does multiple things.
- Always provide a dependency array. An empty `[]` is intentional and acceptable when the effect should run once on mount.
- Always clean up subscriptions, timeouts, and event listeners in the return callback.

```tsx
useEffect(() => {
    const timeout = setTimeout(() => setSuggestions([]), 300);
    return () => clearTimeout(timeout);
}, [query]);
```

---

## 9. State Management

- Use `useState` for local, component-scoped state.
- Use the Context + custom hook pattern for state shared across a subtree (see [Section 8](#8-react-hooks)).
- Use TanStack Query for server state (fetching, caching, mutations) — do not duplicate server state in `useState`.
- Use lazy initialization (`useState(() => ...)`) for state that is expensive to compute or requires reading from a side-effectful source (e.g., `localStorage`).

### Destructuring Spacing

- **Object destructuring** from hooks/context: include a space after `{` and before `}`.
- **Array destructuring** from `useState` and similar: no spaces inside `[` and `]`.

```ts
// Object destructuring
const { filters, setFilters } = useFilters();
const { user, isAuthenticated } = useAuth();

// Array destructuring
const [count, setCount] = useState(0);
const [open, setOpen] = useState(false);
```

---

## 10. Data Fetching (TanStack Query)

- All data fetching goes through TanStack Query (`useQuery`, `useMutation`, `useInfiniteQuery`).
- Use `apiRequest` from `@/lib/queryClient` for all HTTP calls — never call `fetch` directly in components.
- Query keys are URL strings or arrays starting with the URL string: `["/api/properties", { page, filters }]`.
- Set `staleTime` explicitly on queries that don't need to be refetched on every focus — don't rely on defaults.
- Invalidate the relevant query keys after a successful mutation; don't update the cache manually unless necessary.

```tsx
const { data, isLoading, error } = useQuery({
    queryKey: ["/api/properties", { msaId, page }],
    queryFn: () => apiRequest("GET", `/api/properties?msaId=${msaId}&page=${page}`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
});

const mutation = useMutation({
    mutationFn: (data: CreatePropertyInput) =>
        apiRequest("POST", "/api/properties", data).then(r => r.json()),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    },
});
```

---

## 11. Express Routes

Route files are **thin** — they only declare endpoints, attach middleware, and delegate to controllers. No business logic.

```ts
// server/routes/users.routes.ts
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import * as UsersController from "../controllers/users/users.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin"), UsersController.getUsers);
router.get("/:userId", requireAuth, UsersController.getUserById);
router.delete("/:userId", requireAuth, requireRole("admin"), UsersController.deleteUser);

export default router;
```

- One route file per resource.
- Always apply `requireAuth` before `requireRole`.
- Use `export default router` at the end of every route file.
- Group sub-resources in separate files: `users.routes.ts` for `/api/users`, `subscriptions.routes.ts` for `/api/users/:userId/subscriptions`.

---

## 12. Controllers

Controllers handle the HTTP layer: parse the request, validate input, call a service, and send a response. They contain no business logic or database queries.

```ts
// server/controllers/users/users.controller.ts

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

### Rules

- All controller functions are **named async function exports**.
- Always annotate `Promise<void>` as the return type.
- Always wrap the entire body in `try/catch`.
- Use `return` after sending a response to prevent double-send errors — never `throw` after `res.json()`.
- Call `next(error)` only for errors that should be handled by a global error handler middleware. Otherwise, handle the error inline.
- Validate request input at the top of the handler using Zod. If validation fails, return 400 immediately.
- Do not put controller functions in the same file as routes.

### Response Shape

Be consistent with response shapes:

```ts
// Success with data
res.json({ user });
res.json({ properties, total, page });

// Success with no data (e.g., delete)
res.status(204).send();

// Error
res.status(400).json({ message: "Validation failed", errors: validation.error.errors });
res.status(401).json({ message: "Unauthorized" });
res.status(404).json({ message: "User not found" });
res.status(500).json({ message: "Internal server error" });
```

---

## 13. Services

Services contain all business logic and database access. They have no knowledge of HTTP (no `Request`, `Response`, `next`).

```ts
// server/services/users.services.ts

export async function getUserById(id: string): Promise<User | null> {
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

    return user ?? null;
}

export async function createUser(input: InsertUser): Promise<User> {
    const hash = await bcrypt.hash(input.password, 12);
    const [created] = await db
        .insert(users)
        .values({ ...input, passwordHash: hash })
        .returning();
    return created;
}
```

### Rules

- All service functions are **named async function exports**.
- Return data directly — not wrapped in `{ success: true, data: ... }`. That wrapping happens (when needed) in the controller.
- Functions that may return nothing return `T | null`, never `undefined`.
- Destructure single-row results from Drizzle queries: `const [user] = await db.select()...`.
- Keep service functions focused — one database operation or one logical unit of work per function.

---

## 14. Middleware

### Simple Middleware

A function that takes `(req, res, next)` and is not configurable:

```ts
// server/middleware/requireAuth.ts
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.userId) {
        res.status(401).json({ message: "Unauthorized — please log in" });
        return;
    }
    next();
}
```

### Factory Middleware

When the middleware needs configuration, use a factory function that returns the middleware:

```ts
// server/middleware/requireRole.ts
import type { Request, Response, NextFunction } from "express";
import type { Role } from "@database/types/roles.js";

export function requireRole(roleOrRoles: Role | Role[]) {
    const allowed = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];

    return function requireRoleMiddleware(req: Request, res: Response, next: NextFunction): void {
        if (!req.session.role || !allowed.includes(req.session.role)) {
            res.status(403).json({ message: "Forbidden" });
            return;
        }
        next();
    };
}
```

### Rules

- Middleware files export one function.
- Always call `next()` or send a response — never do both.
- Return after sending a response: `res.status(401).json(...); return;`.
- Name the inner function of a factory (e.g., `requireRoleMiddleware`) — it makes stack traces readable.

---

## 15. Database (Drizzle ORM)

- All database access goes through Drizzle ORM. Do not write raw SQL strings unless Drizzle's query API genuinely cannot express the query, in which case use the `sql` template tag.
- Schema definitions live in `database/schemas/*.schema.ts`. One file per table or closely related group of tables.
- Import the `db` client from its single export location — never instantiate a new client inline.
- Chain `.limit(1)` on queries that are expected to return a single row; destructure the result.

```ts
// Single row
const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);

// Multiple rows
const results = await db
    .select()
    .from(properties)
    .where(and(eq(properties.msaId, msaId), eq(properties.status, "on-market")))
    .orderBy(desc(properties.createdAt))
    .limit(50);

// Upsert
await db
    .insert(companies)
    .values(companyData)
    .onConflictDoUpdate({
        target: companies.name,
        set: { updatedAt: new Date() },
    });
```

### Column Naming

- TypeScript (camelCase) ↔ SQL (snake_case): Drizzle handles this mapping.
- Always specify both: `text("first_name")` maps to `.firstName` in TypeScript.

---

## 16. Validation (Zod)

- All external input (request bodies, query params, API responses) must be validated with Zod before use.
- Use `safeParse` (not `parse`) in controllers so you can return a 400 instead of throwing.
- Zod schemas live in `database/` — in `inserts/`, `updates/`, or `validation/` depending on context.
- Derive TypeScript types from Zod schemas using `z.infer` — don't write the type manually and keep a schema in sync.

```ts
// In database/inserts/users.insert.ts
export const insertUserSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

// In controller
const validation = insertUserSchema.safeParse(req.body);
if (!validation.success) {
    res.status(400).json({ message: "Invalid input", errors: validation.error.errors });
    return;
}
const { firstName, lastName, email, password } = validation.data;
```

---

## 17. Error Handling

### Client

- TanStack Query surfaces errors via `error` from `useQuery`/`useMutation` — always handle `isError` states in UI.
- Use `toast` for user-facing mutation errors.
- Never swallow errors with an empty `catch` block.

### Server

- Wrap controller bodies in `try/catch`.
- Log with `console.error("context message:", error)` — include context so log searches are meaningful.
- Return a generic message to the client on 500 errors; never expose internal error details or stack traces.
- Validation errors (400) should include the Zod error details so clients can surface them in forms.

```ts
try {
    // ...
} catch (error) {
    console.error("createUser error:", error);
    res.status(500).json({ message: "Failed to create user" });
}
```

### HTTP Status Codes

| Situation | Code |
|---|---|
| Success with data | 200 |
| Resource created | 201 |
| Success, no content | 204 |
| Bad input / validation failed | 400 |
| Not authenticated | 401 |
| Authenticated but not authorized | 403 |
| Resource not found | 404 |
| Server error | 500 |

---

## 18. Comments & Documentation

- Default: **write no comments**. Well-named identifiers are documentation.
- Add a comment only when the **why** is non-obvious: a non-intuitive constraint, a workaround for a known bug, a subtle invariant, or behavior that would surprise a reader.
- Never explain what the code does — the code does that.
- Never reference the task, PR, ticket number, or caller in a comment — that belongs in the commit message.
- One line max. Multi-line comment blocks are almost never warranted in application code.

```ts
// Good — explains a non-obvious constraint
// SFR API rejects batch sizes > 50; split before calling
const batches = chunk(propertyIds, 50);

// Bad — describes what is obvious from the code
// Loop through properties and insert each one
for (const property of properties) { ... }
```

---

## 19. Formatting & Style

Prettier handles all formatting automatically (see `.prettierrc`). Do not override or fight it — indentation, semicolons, quotes, trailing commas, print width, and line endings are all enforced there.

Additional conventions Prettier does not cover:

- Prefer type narrowing and type guards over `as` casts. Never use `as any`.
- Use ES module syntax (`import`/`export`) everywhere. No `require()`.
- Server files use `.js` extensions in import paths (TypeScript compiles to `.js`, Node requires it for ESM).
- Short objects and arrays that fit on one line: keep on one line. Once they exceed ~80 characters or contain 3+ properties, split to multi-line.
