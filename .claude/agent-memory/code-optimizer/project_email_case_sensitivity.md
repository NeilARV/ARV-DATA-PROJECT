---
name: project-email-case-sensitivity
description: users.email is case-sensitive text(); email lookups split between toLowerCase()-only and LOWER(TRIM()) patterns — flag the weak one for recovery/auth paths
metadata:
  type: project
---

`users.email` is a plain `text('email').unique()` column (database/schemas/users.schema.ts) — no `citext`, no DB-level lowercasing. The unique constraint is case-sensitive, and `createUser` / signup store the email exactly as submitted (no normalization on write).

Email lookups in the codebase are split into two patterns:
- **Weak (case-sensitive on stored value):** `eq(users.email, email.toLowerCase())` — used by `getUserByEmail` and `resetUserPassword` in server/services/auth/user.services.ts. Only matches if the stored row happens to be lowercase.
- **Robust:** `LOWER(TRIM(users.email)) = ...` — used by `checkEmailSubscriptionList` (user.services.ts), `email.services.ts` getWhitelistRecipientsForMsa, and admin.services.ts.

**Why:** because writes are not normalized, a mixed-case account (e.g. `John@Example.com`) will be missed by the weak pattern, producing a false "no user found."

**How to apply:** when reviewing any auth/recovery/lookup-by-email path, flag the weak `eq(users.email, x.toLowerCase())` pattern as a correctness risk and recommend the `LOWER(TRIM())` form. Higher severity for recovery/login paths where a false negative is harmful. Mark impact as conditional (only bites mixed-case stored emails).
