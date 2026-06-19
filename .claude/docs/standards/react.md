# React Standards

Authoritative rules for React code in this codebase (React 18+, function components, hooks, TypeScript, Vite, Wouter, TanStack Query, Tailwind + Radix). Every rule has a stable ID (`RX.*`) so `/smell` and `/doc-drift` can reference it. This file owns the `RX.*` IDs.

Scope: **React only** — component structure, hooks, props, JSX, client state, data fetching, rendering, accessibility. TypeScript language rules live in `typescript.md`; server rules in `express.md`; design tokens in `design-guidelines.md`.

> Format: each rule is one directive + a tiny good/bad. Prettier owns formatting (indentation, quotes, semicolons, line width) — those are never rules here.

---

## Components

- **RX.ONE-PER-FILE** — One component per file; the filename (PascalCase) matches the exported component. `PropertyCard.tsx → export function PropertyCard`.
- **RX.FUNCTION-COMPONENT** — Function components only. No class components, no `React.createClass`, no mixins.
```tsx
    // Good
    export function StatusBadge({ status }: StatusBadgeProps) { ... }
    // Bad
    class StatusBadge extends React.Component { ... }
```
- **RX.EXPORT-STYLE** — Pages use `export default`; feature components and UI primitives use named exports. (One page per route file.)
- **RX.NO-NESTED-COMPONENTS** — Never declare a component inside another component; it remounts on every render and loses state. Hoist it to module scope.
```tsx
    // Bad — Row is recreated every render
    function Table() {
        function Row({ x }: RowProps) { return <td>{x}</td>; }
        return <tbody>{rows.map(r => <Row x={r} />)}</tbody>;
    }
    // Good — Row defined at module scope, passed props
```
- **RX.COMPONENT-ORDER** — Inside a component, order top-to-bottom: (1) props destructured in the signature, (2) hooks, (3) derived values/memos, (4) handlers, (5) early returns (loading/error/empty), (6) JSX.
```tsx
    export function PropertyList({ msaId }: PropertyListProps) {
        const { filters } = useFilters();              // 2 hooks
        const { data, isLoading } = useProperties({ msaId, filters });
        const hasResults = (data?.length ?? 0) > 0;    // 3 derived
        function handleSelect(id: string) { ... }       // 4 handlers
        if (isLoading) return <Spinner />;              // 5 early returns
        return <ul>{/* 6 JSX */}</ul>;
    }
```
- **RX.SMALL-COMPONENT** — A component that does several unrelated things should be split. If you describe it with "and," split it.

## Props

- **RX.PROPS-TYPE** — Define props as a `type` named `<ComponentName>Props` (not `interface`, not inline). Co-locate with the component unless shared, in which case it goes in `client/src/types/`. (Rationale: see `typescript.md` TS.INTERFACE-VS-TYPE — props are a closed shape.)
```tsx
    type UserCardProps = {
        userId: string;
        showActions?: boolean;
        onSelect?: (userId: string) => void;
    };
    export function UserCard({ userId, showActions = false, onSelect }: UserCardProps) { ... }
```
- **RX.PROPS-DESTRUCTURE** — Destructure props in the signature; give optional props defaults there.
- **RX.NO-SPREAD-PROPS** — Don't blind-spread `{...props}` onto DOM/components; it hides what's passed and leaks invalid attributes. Spread only a known, named subset.
```tsx
    // Bad
    <input {...props} />
    // Good
    <input value={value} onChange={onChange} aria-label={label} />
```
- **RX.HANDLER-PROP-NAME** — Callback props are named `onX`; the internal handler implementing them is `handleX`. (Mirrors `typescript.md` TS.HANDLER-NAME.)
```tsx
    function handleSubmit() { ... }
    <Form onSubmit={handleSubmit} />
```
- **RX.CHILDREN-TYPE** — Type children as `React.ReactNode`. Don't invent custom child types for ordinary content.

## Hooks

- **RX.HOOKS-RULES** — Call hooks only at the top level of a component or custom hook — never inside conditionals, loops, or nested functions. Order must be stable across renders.
```tsx
    // Bad
    if (open) { const [x] = useState(0); }
    // Good
    const [x] = useState(0);
    if (open) { /* use x */ }
```
- **RX.CUSTOM-HOOK-NAME** — Custom hooks start with `use`, are named exports (function declaration), one per file, filename kebab-case: `use-auth.ts → useAuth`.
- **RX.PROVIDER-GUARD** — A hook backed by Context must throw a descriptive error when used outside its Provider.
```ts
    export function useFilters(): FiltersContextValue {
        const ctx = useContext(FiltersContext);
        if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
        return ctx;
    }
```
- **RX.CONTEXT-COLOCATION** — Keep a Context, its Provider, and its hook in one file. Split context value into separate contexts when unrelated consumers would otherwise re-render together.
- **RX.EFFECT-DEPS** — Every value referenced inside `useEffect` must appear in the dependency array. Never silence the lint with a disable comment; fix the dependency (memoize, move the value, or use a ref).
```tsx
    // Bad — query missing from deps
    useEffect(() => { fetchFor(query); }, []);
    // Good
    useEffect(() => { fetchFor(query); }, [query]);
```
- **RX.EFFECT-CLEANUP** — Any effect that subscribes, sets a timer, or adds a listener must return a cleanup that tears it down.
```tsx
    useEffect(() => {
        const t = setTimeout(() => setSuggestions([]), 300);
        return () => clearTimeout(t);
    }, [query]);
```
- **RX.EFFECT-FOCUSED** — One effect per concern. Prefer several small effects over one effect doing unrelated work.
- **RX.NO-DERIVED-STATE** — Don't copy props/state into `useState` and sync with an effect. Compute derived values during render instead.
```tsx
    // Bad
    const [full, setFull] = useState("");
    useEffect(() => setFull(`${first} ${last}`), [first, last]);
    // Good
    const full = `${first} ${last}`;
```
- **RX.MEMO-INTENTIONAL** — Reach for `useMemo`/`useCallback` only for a measured expense or to stabilize a dependency/identity, not reflexively. Unnecessary memoization adds noise and its own cost.
- **RX.REF-SUFFIX** — Ref variables end in `Ref`: `searchInputRef`, `menuRef`.

## State & data

- **RX.SERVER-STATE-QUERY** — Server data lives in TanStack Query, never mirrored into `useState`. Local UI state (open/closed, input text) uses `useState`.
```tsx
    // Bad
    const [deals, setDeals] = useState([]);
    useEffect(() => { apiRequest("GET", "/api/deals").then(r => r.json()).then(setDeals); }, []);
    // Good
    const { data: deals } = useQuery({ queryKey: ["/api/deals"], queryFn: ... });
```
- **RX.NO-RAW-FETCH** — Never call `fetch` directly in a component. Go through TanStack Query with `apiRequest` from `@/lib/queryClient`.
- **RX.QUERY-KEY** — Query keys start with the URL string; add a params object for variants: `["/api/properties", { msaId, page }]`.
- **RX.QUERY-STALETIME** — Set `staleTime` explicitly on queries that shouldn't refetch on every focus; don't rely on defaults.
- **RX.MUTATION-INVALIDATE** — After a successful mutation, invalidate the affected query keys rather than hand-patching the cache, unless a manual update is clearly warranted.
- **RX.LOCAL-STATE-LAZY** — Use lazy `useState(() => ...)` when the initial value is expensive or reads a side-effectful source.
- **RX.URL-STATE** — State that should survive reload or be shareable (filters, selected id, tab) belongs in the URL (Wouter / search params), not only in component state.

## JSX & rendering

- **RX.STABLE-KEY** — Never use the array index as `key` for lists that can reorder, filter, or grow; use a stable id. Index keys cause state/DOM mismatches.
```tsx
    {deals.map((d) => <DealCard key={d.id} deal={d} />)}
```
- **RX.SELF-CLOSE** — Self-close childless elements: `<Input />`, not `<Input></Input>`.
- **RX.BOOL-PROP** — Omit `={true}` for boolean props: `<Button disabled />`.
- **RX.JSX-QUOTES** — Double quotes for JSX attributes, single quotes for all other JS/TS. (`<Foo bar="baz" />`, `const x = 'y'`.)
- **RX.SIMPLE-CONDITIONAL** — Simple ternaries in JSX are fine; for anything branchier, compute a variable or extract a subcomponent before `return`.
```tsx
    // Bad — nested ternary in JSX
    {a ? (b ? <X /> : <Y />) : <Z />}
    // Good
    const view = pickView(a, b);
    return view;
```
- **RX.NO-INDEX-LOGIC-IN-JSX** — Keep heavy logic out of the returned JSX; derive it above the return. JSX should read as markup.
- **RX.LIST-EMPTY-STATE** — Render an explicit empty state for lists; don't return a bare empty fragment with no feedback.
- **RX.FRAGMENT-SHORTHAND** — Use `<>...</>` unless you need a `key`, in which case use `<React.Fragment key=...>`.

## Styling (defer to design-guidelines.md)

- **RX.DESIGN-TOKENS** — Use design tokens/utility classes from `design-guidelines.md`; never hardcode hex/gray values (`text-gray-300`). This rule defers to that file for the token list.
- **RX.RESPONSIVE-RESTRAINT** — Don't stack `sm:`/`md:`/`lg:` on the same property when one breakpoint expresses the intent; see `design-guidelines.md`.

## Accessibility

- **RX.A11Y-LABEL** — Interactive elements need an accessible name (visible label, `aria-label`, or `aria-labelledby`). Icon-only buttons must have one.
- **RX.A11Y-SEMANTIC** — Use the semantic element (`<button>`, `<a>`, `<nav>`) over a `div` with an `onClick`. A clickable `div` needs `role` + keyboard handling — prefer the real element.
- **RX.A11Y-ALT** — `<img>` needs `alt` (empty `alt=""` for decorative images).

## Comments

- **RX.JSDOC-EXPORT** — Exported components and custom hooks get a short JSDoc describing what they render/return and any non-obvious prop. Inline `//` comments explain *why*, not *what*.
```tsx
    /** Card for a single deal; expands inline to show offers (owner only). */
    export function DealCard({ deal }: DealCardProps) { ... }
```