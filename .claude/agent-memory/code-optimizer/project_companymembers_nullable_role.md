---
name: companymembers-nullable-role
description: companyMembers.role is nullable as of 2026-06-05; admin-set memberships insert null role/isPrimary, and a profile render path assumes a value
metadata:
  type: project
---

As of 2026-06-05 `companyMembers.role` (database/schemas/companies.schema.ts) was made nullable and `isPrimary` default flipped to `false`. The admin `setUserCompanyMemberships` service inserts membership rows with **no** `role`/`isPrimary`, so those columns are null/false. The `UserMembershipRow.role` type is `'owner' | 'member' | null`.

**Why:** Admins can now assign a user to companies directly (PUT /api/users/:userId/company-memberships) without going through the owner-claim flow, so those memberships have no role semantics.

**How to apply:** Any consumer rendering or branching on `m.role` must handle null. `client/src/components/profile/MyCompaniesTab.tsx` renders `{m.role}` directly — flag null handling there. When reviewing membership reads, do not assume role is always 'owner'/'member'. Related: [[no-db-transactions]].
