---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Check your current working branch. If on main, create a new branch using the `Branch Naming Format`.

Branch Naming Format: `<type>/<name>` (ie. `feature/company-merging` | `fix/login-redirect` | `performance/database-indexes`)

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Create a well defined, clear and concise commit message and description.

Commit your work to the current branch.