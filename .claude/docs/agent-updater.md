# Agent Updater

Detects when code changes make agent documentation stale. Triggered automatically at the end of each task via the `Stop` hook in `.claude/settings.json`. **Never updates agent files without explicit user approval.**

---

## Agent File Registry

| File | Type | What it documents |
|---|---|---|
| `CLAUDE.md` | Base | Top-level project instructions, file references, global rules |
| `.claude/docs/api.md` | API | Complete route docs: paths, params, request/response shapes for all endpoints |
| `.claude/docs/access-control.md` | Auth | Route permission tables, middleware chains, role/tier rules |
| `.claude/docs/coding-standards.md` | Standards | Naming, file structure, patterns, conventions |
| `.claude/docs/testing.md` | Workflow | Test structure, helpers, mandatory baseline, naming |
| `.claude/docs/optimizer.md` | Workflow | Auto-review checklists, output format |
| `.claude/docs/design-guidelines.md` | Design | Tokens, colors, typography, spacing, component styles |
| `.claude/docs/apps.md` | App | Combined Data / Deals / Vendors reference: component tree, state, API surface, services, schema for each app |
| `.claude/docs/features/email-settings.md` | Feature | Email/notification feature documentation |
| `.claude/docs/database.md` | Workflow | Documentation  and explanation on our database | Should be changed every time a database change it made
| `.claude/docs/agent-updater.md` | Workflow | This file |

---

## Detection Rules

A change is **significant** and requires an agent update when it alters something the agent docs describe as fact. Specifically:

### Always triggers an update

- **New or removed API route** → update `api.md` (full route entry) + `access-control.md` (permission table) + the relevant app file (`data.md`, `deals.md`, or `vendors.md`)
- **Changed request shape, query params, or response shape on an existing route** → update `api.md`
- **Changed middleware on a route** (different `requireRole`, `requireSub`, or added/removed auth) → update `access-control.md` and the auth notes in `api.md`
- **New or removed database table/column** used by a feature → update the relevant app file's schema section
- **New or changed component in a component tree** → update the relevant app file's component tree
- **New or changed state/hook** (new context, new URL param, renamed hook) → update the relevant app file's state management section
- **New enum value, status, or type** added to a domain (e.g. new deal type, new property status) → update the relevant app file
- **New or changed design token** (color, spacing, breakpoint added to `index.css` or `tailwind.config.ts`) → update `design-guidelines.md`
- **New CSS component class** added to a `.components.css` file → update `design-guidelines.md`
- **New or changed test helper or convention** → update `testing.md`
- **New role or subscription tier** → update `access-control.md`
- **New agent file created** → update the registry table above

### Never triggers an update

- Bug fixes that don't change behavior, API shape, or component structure
- Style tweaks to a single component (font size, padding) that don't create a new pattern or token
- Refactors that rename internal variables but don't change exports, APIs, or component interfaces
- Adding tests for existing routes (no new route or middleware change)
- Content changes (copy, labels, placeholder text)
- Performance optimizations that don't change the API contract

### Gray area — use judgment

- Renaming a component or hook (update if the old name appears in an agent file)
- Moving a file to a different directory (update if the old path appears in a Key Files table)
- Adding a new service function (update only if it represents a new capability, not an internal helper)

---

## Procedure

1. At the end of a task, review all files that were created, edited, or deleted
2. Cross-reference against the detection rules above
3. If no agent files are affected → **say nothing** (do not mention this check ran)
4. If agent files are affected → list each one with:
   - The file name
   - What section needs updating
   - A brief description of the change (one line)
5. **Ask for approval** before making any edits
6. On approval, make the updates and show a summary of what changed

---

## Rules

- **Never modify an agent file without asking first.** Agent changes can alter how all future tasks are handled — they are high-impact edits that require review.
- **Be specific in proposals.** "Update deals.md" is not enough. Say "Update deals.md → Database Schema section → add `pending` to the type enum list."
- **Batch proposals.** If multiple agent files need updates from the same task, propose them all at once so the user can approve or reject as a group.
- **Don't propose cosmetic rewrites.** Only propose changes that correct factual inaccuracies or missing information. Don't restructure, rephrase, or "improve" agent files as part of this process.
- **Skip if trivial.** If the only change would be updating a line number reference or fixing a typo that doesn't affect behavior, skip it.