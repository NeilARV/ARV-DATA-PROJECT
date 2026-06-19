# Agent Updater

Detects when code changes make agent documentation stale. Triggered automatically at the end of each task via the `Stop` hook in `.claude/settings.json`. **Never updates agent files without explicit user approval.**

---

## Agent File Registry

| File | Type | What it documents |
|---|---|---|
| `CLAUDE.md` | Base | Top-level project instructions, file references, global rules |
| `.claude/docs/api.md` | API | Complete route docs: paths, params, request/response shapes (auth summarized; access-control.md canonical) |
| `.claude/docs/access-control.md` | Auth | **Canonical** route permission tables, middleware chains, role/tier rules |
| `.claude/docs/code-standards.md` | Standards | Naming, file structure, patterns, conventions |
| `.claude/docs/testing.md` | Workflow | Test structure, helpers, mandatory baseline, naming |
| `.claude/docs/design-guidelines.md` | Design | Tokens, colors, typography, spacing, component styles |
| `.claude/docs/apps.md` | App | Combined Data / Deals / Vendors / Mastermind reference: component tree, state, API surface, services, schema per app |
| `.claude/docs/database.md` | Reference | Full DB schema: every table, column, constraint, index, enum. **Must update on every DB change.** |
| `.claude/docs/mastermind.md` | App | Mastermind design doc + phased build plan |
| `.claude/docs/new-msa.md` | Workflow | How to add a new MSA |
| `.claude/docs/features/email-settings.md` | Feature | Email/notification feature docs ⚠️ verify this file exists; remove this row if it does not |
| `.claude/docs/agent-updater.md` | Workflow | This file |
| `.claude/agents/code-optimizer.md` | Agent | End-of-task review agent (bugs/security/perf). Not a doc — listed so renames/path changes get caught. |

---

## Detection Rules

A change is **significant** and requires an agent update when it alters something the agent docs describe as fact. Specifically:

### Always triggers an update

- **New or removed API route** → update `api.md` (full route entry) + `access-control.md` (permission table) + the relevant app's section in `apps.md`
- **Changed request shape, query params, or response shape on an existing route** → update `api.md`
- **Changed middleware on a route** (different `requireRole`, `requireSub`, `requireMastermind`, or added/removed auth) → update `access-control.md` and the auth notes in `api.md`
- **New or removed database table/column** → update `database.md` (always) + the relevant app section's schema notes in `apps.md`
- **New or changed enum value** (deal type, notification type, channel type, etc.) → update `database.md` Enums table + every doc that lists that enum (`api.md`, `apps.md`)
- **New or changed component in a component tree** → update the relevant app section in `apps.md`
- **New or changed state/hook** (new context, new URL param, renamed hook) → update the relevant app section's state management in `apps.md`
- **New or changed design token** (color, spacing, breakpoint in `index.css` or `tailwind.config.ts`) → update `design-guidelines.md`
- **New CSS component class** added to a `*.components.css` file → update `design-guidelines.md`
- **New or changed test helper or convention** → update `testing.md`
- **New role or subscription tier** → update `access-control.md` + `database.md`
- **New agent file or doc created** → update the registry table above

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
5. **Ask for approval** before making any edits. If I approve the first edit, then assume the rest are okay for that given task. No need to ask more than once.
6. On approval, make the updates and show a summary of what changed

---

## Rules

- **Never modify an agent file without asking first.** Agent changes can alter how all future tasks are handled — they are high-impact edits that require review.
- **Be specific in proposals.** "Update deals.md" is not enough. Say "Update deals.md → Database Schema section → add `pending` to the type enum list."
- **Batch proposals.** If multiple agent files need updates from the same task, propose them all at once so the user can approve or reject as a group.
- **Don't propose cosmetic rewrites.** Only propose changes that correct factual inaccuracies or missing information. Don't restructure, rephrase, or "improve" agent files as part of this process.
- **Skip if trivial.** If the only change would be updating a line number reference or fixing a typo that doesn't affect behavior, skip it.