# Repeated CSS → Tailwind component

When frontend code repeats a class string, it becomes an `@apply` component. This file defines when
and how — and, importantly, what to do when nobody is around to ask.

## Detection is a grep, not a judgment

A class string is **repeated** if the same set of utilities appears on 2 or more elements. Don't
scan by reading. Run the check against the diff:

```bash
git diff --name-only HEAD -- 'client/src/**/*.tsx' \
  | xargs -r grep -ho 'className="[^"]*"' \
  | sort | uniq -c | sort -rn | awk '$1 >= 2'
```

Exact-match only, deliberately. Near-duplicates that differ by one utility are usually two
different things wearing similar clothes, and merging them creates a component with a prop that
immediately grows a second prop.

## Where a new component goes

1. If a style file already exists for the surface, it goes there.
   `client/src/styles/deal.components.css` holds deal-page classes.
2. If the utilities could plausibly belong to more than one surface, it goes in
   `client/src/index.css`. Ambiguity resolves toward the shared file, not toward a new one.
3. Otherwise a new file is needed, and that requires a human. See below.

Naming: prefix with the surface, matching the file. `deal.components.css` → `.deal-title`,
`.deal-card-label`. A class whose name doesn't say where it lives will be re-created by someone
who couldn't find it.

## Adding a new style file

Creating `vendor.components.css` is a structural decision about how the codebase is organized. It
is not the model's call. What happens next depends on whether a human is present.

### Interactive session

Stop and ask. Two things, in order:

1. Report the repeated CSS, where it appeared, and that no existing file fits. Ask whether to
   create a new file.
2. If yes: propose a name, and **ask for confirmation before creating it.** A suggestion is not
   approval.

Do not create the file, do not extract the class, and do not proceed with unrelated work while the
question is open.

### Autonomous session (`/run-phase`, `/goal`, any loop with `AskUserQuestion` removed)

There is no one to ask, and blocking would deadlock the loop. So:

- **Do not create the file. Do not extract the class. Leave the duplicated utilities in place.**
- Append an entry to `.claude/docs/css-debt.md`:

  ```markdown
  ## <ISO date> — <branch> — <commit sha>
  - **Repeated:** `w-full mx-auto h-8 grid grid-cols-1`
  - **Seen in:** client/src/pages/Vendors.tsx:41, client/src/pages/Vendors.tsx:88
  - **No file fits.** Suggested: `vendor.components.css`, class `.vendor-grid`
  ```

- Say so in the step's commit message body: `css-debt: 1 entry`.

The extraction then happens in a human-reviewed pass, which is the right place for it — a
structural refactor should not ride along inside a feature commit anyway.

If an appropriate file *does* already exist, extract it in the autonomous run. No question needed,
no debt entry.

## Extraction shape

```css
/* client/src/styles/deal.components.css */
@layer components {
    .deal-card-label {
        @apply text-sm text-muted-foreground;
    }
}
```

Then replace every occurrence. A partial extraction — component created, two of three call sites
updated — is worse than none, because the next reader sees both forms and picks the wrong one.