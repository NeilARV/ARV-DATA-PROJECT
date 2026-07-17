---
name: implement
description: 'Implement a piece of work based on a spec or set of tickets.'
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Check your current working branch. If on main, create a new branch using the `Branch Naming Format`.

Branch Naming Format: `<type>/<name>` (ie. `feature/company-merging` | `fix/login-redirect` | `performance/database-indexes`)

Use /tdd where possible, at pre-agreed seams.

Run typechecking after each meaningful change. Run single test files at TDD seams, scoped by path (ie. `vitest run src/deals/merge.test.ts`). **Never run the full test suite mid-branch.**

Commit your work to the current branch at each coherent checkpoint. **Before a commit** stop to request my approval so I can review. Error toward more commits. **Never commit broken code** — every commit must typecheck and pass the test files covering the files it changed, so each is independently revertable and reviewable.

Give each commit a clear, concise message. Start it with the issue number if it exists (ie. `Issue #23 | Prevent duplicate password reset tokens`).

When the final checkpoint is committed, run the full test suite once. If it surfaces a break introduced earlier in the branch, fix forward with an additional commit — do not rewrite history.

Then use /code-review to review the work.