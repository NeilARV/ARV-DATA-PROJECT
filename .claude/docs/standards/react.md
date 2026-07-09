# React Standards

Authoritative rules for React code (React 18, function components, hooks, Vite, Wouter, TanStack Query, Tailwind + Radix). Each rule has a stable `RX.*` ID cited by the review skills (`/smell`, `/audit`, `/hunt`, `/doc-drift`); this file owns them. TypeScript language rules → `typescript.md`; server → `express.md`; design tokens → the `ui-design` skill (`DS.*`).

> One directive + a tiny good/bad. Prettier owns formatting — never a rule here.

---

## Components

- **RX.ONE-PER-FILE** — One component per file; PascalCase filename matches the export (`PropertyCard.tsx → PropertyCard`).
- **RX.FUNCTION-COMPONENT** — Function components only; no classes, `React.createClass`, or mixins.
- **RX.EXPORT-STYLE** — Pages use `export default` (one per route file); feature components and UI primitives use named exports.
- **RX.NO-NESTED-COMPONENTS** — Never declare a component inside another — it remounts every render and loses state. Hoist to module scope, pass props.
  ```tsx
  function Table() { function Row({ x }: RowProps) { ... } ... } // Bad — Row recreated every render
  ```
- **RX.COMPONENT-ORDER** — Inside a component, top-to-bottom: (1) props in the signature, (2) hooks, (3) derived values/memos, (4) handlers, (5) early returns (loading/error/empty), (6) JSX.
- **RX.SMALL-COMPONENT** — Split a component that does several unrelated things. If you describe it with "and," split it.

## Props

- **RX.PROPS-TYPE** — Props are a `type` named `<Component>Props` (not `interface`, not inline); co-locate unless shared, then `client/src/types/`. (Rationale: TS.INTERFACE-VS-TYPE — props are a closed shape.)
  ```tsx
  type UserCardProps = { userId: string; showActions?: boolean; onSelect?: (userId: string) => void };
  export function UserCard({ userId, showActions = false, onSelect }: UserCardProps) { ... }
  ```
- **RX.PROPS-DESTRUCTURE** — Destructure props in the signature; give optional props defaults there.
- **RX.NO-SPREAD-PROPS** — Don't blind-spread `{...props}` onto DOM/components; it hides what's passed and leaks invalid attributes. Spread only a known, named subset.
- **RX.HANDLER-PROP-NAME** — Callback props are `onX`; the internal handler implementing them is `handleX` (mirrors TS.HANDLER-NAME).
- **RX.CHILDREN-TYPE** — Type children as `React.ReactNode`; don't invent custom child types for ordinary content.

## Hooks

- **RX.HOOKS-RULES** — Call hooks only at the top level of a component or custom hook — never in conditionals, loops, or nested functions. Order must be stable across renders.
- **RX.CUSTOM-HOOK-NAME** — Custom hooks start with `use`, are named exports (function declaration), one per file, kebab-case filename (`use-auth.ts → useAuth`).
- **RX.PROVIDER-GUARD** — A Context-backed hook throws a descriptive error when used outside its Provider.
  ```tsx
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider');
  ```
- **RX.CONTEXT-COLOCATION** — Keep a Context, its Provider, and its hook in one file. Split into separate contexts when unrelated consumers would otherwise re-render together.
- **RX.EFFECT-DEPS** — Every value referenced inside `useEffect` appears in the dependency array. Never silence the lint with a disable — fix the dependency (memoize, move it, or use a ref).
- **RX.EFFECT-CLEANUP** — Any effect that subscribes, sets a timer, or adds a listener returns a cleanup that tears it down.
  ```tsx
  useEffect(() => { const t = setTimeout(...); return () => clearTimeout(t); }, [query]);
  ```
- **RX.EFFECT-FOCUSED** — One effect per concern; prefer several small effects over one doing unrelated work.
- **RX.NO-DERIVED-STATE** — Don't copy props/state into `useState` and sync with an effect; compute derived values during render.
  ```tsx
  const full = `${first} ${last}`; // Good — not useState + effect
  ```
- **RX.MEMO-INTENTIONAL** — `useMemo`/`useCallback` only for a measured expense or to stabilize an identity/dependency, not reflexively.
- **RX.REF-SUFFIX** — Ref variables end in `Ref`: `searchInputRef`, `menuRef`.

## State & data

- **RX.SERVER-STATE-QUERY** — Server data lives in TanStack Query, never mirrored into `useState`. Local UI state (open/closed, input text) uses `useState`.
- **RX.NO-RAW-FETCH** — Never call `fetch` directly in a component; go through TanStack Query with `apiRequest` from `@/lib/queryClient`.
- **RX.QUERY-KEY** — Query keys start with the URL string; add a params object for variants: `['/api/properties', { msaId, page }]`.
- **RX.QUERY-STALETIME** — Set `staleTime` explicitly on queries that shouldn't refetch on every focus; don't rely on defaults.
- **RX.MUTATION-INVALIDATE** — After a successful mutation, invalidate the affected query keys rather than hand-patching the cache, unless a manual update is clearly warranted.
- **RX.LOCAL-STATE-LAZY** — Use lazy `useState(() => ...)` when the initial value is expensive or reads a side-effectful source.
- **RX.URL-STATE** — State that should survive reload or be shareable (filters, selected id, tab) belongs in the URL (Wouter / search params), not only component state.

## JSX & rendering

- **RX.STABLE-KEY** — Never use the array index as `key` for lists that reorder, filter, or grow; use a stable id.
  ```tsx
  {deals.map((d) => <DealCard key={d.id} deal={d} />)}
  ```
- **RX.SELF-CLOSE** — Self-close childless elements: `<Input />` (Prettier-enforced).
- **RX.BOOL-PROP** — Omit `={true}` for boolean props: `<Button disabled />` (Prettier-enforced).
- **RX.JSX-QUOTES** — Double quotes for JSX attributes, single quotes for all other JS/TS (`<Foo bar="baz" />`, `const x = 'y'`).
- **RX.SIMPLE-CONDITIONAL** — Simple ternaries in JSX are fine; for anything branchier, compute a variable or extract a subcomponent before `return`.
- **RX.NO-INDEX-LOGIC-IN-JSX** — Keep heavy logic out of returned JSX; derive it above the return so JSX reads as markup.
- **RX.LIST-EMPTY-STATE** — Render an explicit empty state for lists; don't return a bare empty fragment with no feedback.
- **RX.FRAGMENT-SHORTHAND** — Use `<>...</>` unless you need a `key`, then `<React.Fragment key=...>`.

## Styling (defer to the `ui-design` skill)

- **RX.DESIGN-TOKENS** — Use design tokens/utility classes; never hardcode hex or Tailwind palette colors (`text-gray-300`). The token rules are owned by the `ui-design` skill (`DS.*`).
- **RX.RESPONSIVE-RESTRAINT** — Don't stack `sm:`/`md:`/`lg:` on one property when a single breakpoint expresses the intent; see the `ui-design` skill.

## Accessibility

- **RX.A11Y-LABEL** — Interactive elements need an accessible name (visible label, `aria-label`, or `aria-labelledby`); icon-only buttons especially.
- **RX.A11Y-SEMANTIC** — Use the semantic element (`<button>`, `<a>`, `<nav>`) over a `div` with `onClick`; a clickable `div` needs `role` + keyboard handling.
- **RX.A11Y-ALT** — `<img>` needs `alt` (empty `alt=""` for decorative images).

## Comments

Canonical policy: CLAUDE.md → **Comments policy**; budget + banned list: TS.JSDOC-BUDGET.

- **RX.JSDOC-EXPORT** — Exported components and custom hooks get a JSDoc whose default is a **single sentence**: what it renders/returns and any non-obvious prop. Inline `//` explains *why* (TS.COMMENT-WHY).
  ```tsx
  /** Card for a single deal; expands inline to show offers (owner only). */
  export function DealCard({ deal }: DealCardProps) { ... }
  ```
