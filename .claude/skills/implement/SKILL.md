---
name: implement
description: 'Implement a piece of work based on a spec or set of tickets.'
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Check your current working branch. If on main, create a new branch using the `Branch Naming Format`.

Branch Naming Format: `<type>/<name>` (ie. `feature/company-merging` | `fix/login-redirect` | `performance/database-indexes`)

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch at each coherent checkpoint, then stop to request my approval to continue. Err toward more commits. **Never commit broken code** — every commit should typecheck and pass its relevant tests, so each is independently revertable and reviewable.

Give each commit a clear, concise message. Start it with the issue number if it exists (ie. `Issue #23 | Prevent duplicate password reset tokens`).