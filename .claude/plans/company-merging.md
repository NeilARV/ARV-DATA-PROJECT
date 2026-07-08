# Company Merging (Company Groups) — Design & Build Plan

> **Status:** Plan / design phase. No code written yet.
>
> **Finalized 2026-07-08 (Option A locked, with Justin):**
> 1. **The group is the account.** A `company_groups` row is a client/organization. The companies
>    (LLCs) inside it are attribution/data entities that belong to that account; the people are
>    members of the account. There is **no parent company** — the `is_parent` flag and the
>    `primary_company_id` pointer are both dead (see §12). Whatever brand/parent name matters lives
>    in the group's `name`.
> 2. **Membership lives at the group level ONLY.** The existing `company_members` table is retired
>    and replaced by a single `group_members` table. **You cannot add a member to a company** — you
>    add *companies* to a group and *members* to a group. This one table is also the single unit for
>    email and analytics targeting: everything addresses a group.
> 3. **Admin UX:** ALL management lives in one dedicated **Admin Panel tab** ("Company Merging"),
>    ADMIN/OWNER only. No merge controls embedded in the directory/`/data` UI. Create, name, edit,
>    delete groups; add/remove companies; add/remove members.
> 4. **The claim feature is removed.** Self-service company claims are dropped entirely — table,
>    routes, services, and UI (it was effectively unused and, when used, misused). Membership is
>    created **only by admin assignment** (the Company Merging tab today; onboarding later). See §5.4.
> 5. **Create-a-company (manual, non-SFR) is deferred.** v1 groups only over companies the SFR
>    pipeline already knows. This keeps the shared-normalization change and the `company_aliases`
>    machinery out of v1 (they return with the manual-create / hard-merge work — §9).
> 6. **Visibility:** group association is **public** — the "Part of Vertigo Rev (3 companies)" chip
>    shows to everyone in the directory, like all other company data.
> 7. **`/data` v1 behavior:** selecting a grouped company stays **per-LLC** (properties/stats exactly
>    as today) + the public family chip with click-through to siblings. Family-wide property
>    filtering is deferred (§6.4).
> 8. **Deletion:** deleting a group disbands it — its companies become standalone (and, since
>    membership was the group's, memberless); company rows are never touched.
> 9. **True typo-duplicates remain a first-class, separate problem** — `LYKOS HOLDING LLC` vs
>    `LYKOS HOLDINGS LLC` — solved by a **hard merge** (one company row absorbs the other + alias so
>    the pipeline never re-splits them). This is a peer capability to grouping, not part of it (§9).
>
> **The one framing decision this document rests on:** grouping and hard-merge are **two distinct
> operations sharing one admin surface**:
> - **Group** (the common case): N real LLCs belong to one client → link them under a
>   `company_groups` account. Transactions stay attributed to the exact LLC that recorded the deed.
> - **Hard merge** (the duplicate case): two rows are the *same* LLC (typo variant) → absorb one into
>   the other, keep the bad spelling as an alias. Destructive on the row, lossless on data.

---

## 1. The idea in one paragraph

Real-estate operators run one organization through many LLCs — "Vertigo Rev" buys as SD REV in San
Diego, CO REV in Colorado, MIAMI REV in Florida — and our pipeline creates one unrelated `companies`
row per raw deed name. We introduce the **account**: a `company_groups` row (e.g. "Vertigo Rev") that
owns a set of companies (`company_group_companies`) and a set of members (`group_members`). Access,
emails, and analytics are all addressed to the account, never to an individual company. A client with
a single known LLC is simply an account with one company; as they pick up more LLCs, you add those
companies to the same account and every member's reach grows with zero per-user work. Because the
company no longer holds members, all the two-level bookkeeping disappears — there is nothing to
migrate when you group, nothing to reconcile when you ungroup. On top of the core: rollup stats
(per-LLC + account-wide, intra-account transfers excluded), a member dashboard, a suggestion engine
that proposes accounts and duplicates so admins approve instead of hunting through thousands of rows,
and a hard-merge tool (+ alias table) for typo-duplicate rows.

---

## 2. Current state (what the codebase does today)

Verified by direct code review — file references are load-bearing for the build phase.

### 2.1 Company identity is an exact raw-name string

- The pipeline consumer creates companies from raw SFR buyer/seller names
  (`server/jobs/data_v2/processes/clean-transactions.ts:44-68`), gated by `isFlippingCompany`
  (`server/utils/dataSyncHelpers.ts:97-131`).
- Matching is **exact trimmed string** — `trimCompanyName` (`server/utils/normalization.ts:113-117`)
  does whitespace trim only; names are stored exactly as SFR returns them (uniformly uppercase in
  practice, per ARV.RAW-COMPANY-NAME).
- Dedup guarantee is only the DB unique constraint on `companies.company`
  (`database/schemas/companies.schema.ts:29`) + `onConflictDoNothing`
  (`server/jobs/data_v2/processes/insert-companies.ts:143-147`).
- **The duplicate class that actually occurs** (confirmed): clerical typo variants on deed paperwork
  — `LYKOS HOLDING LLC` vs `LYKOS HOLDINGS LLC`. No normalization can fix a missing `S`; the data
  simply arrives wrong sometimes. Exact-string identity then splits one LLC across two rows,
  fragmenting its stats. Companies are also **insert-only** — no cleanup, archival, admin-create, or
  merge logic exists anywhere. (Admin-create is what a future onboarding "add a brand-new LLC" step
  would introduce; deferred out of v1 per decision #5.)

### 2.2 How everything hangs off a company

- **Transactions** carry both FK and raw string: `property_transactions.buyer_id/seller_id/assignor_id`
  (FK → `companies.id`, `set null`) alongside `buyer_name/seller_name/assignor_name`
  (`database/schemas/properties.schema.ts:314-382`). The `properties` table itself has no company
  column. FK resolution happens in `resolve-ids.ts:55-60` using the same exact-trim map.
- **Stats** (`server/services/companies/companies.services.ts`): `getCompanyById` (621–798) computes
  propertyCount / sold YTD / sold all-time / assigned / 90-day acquisition chart — all keyed on the
  single company UUID. Directory sorts (`getContacts`, 124–455) aggregate per-company over
  `property_transactions`. **Exception:** `getLeaderboard` (525–617) tallies raw
  `buyerName`/`sellerName` **strings**, not FKs.
- **Membership today** is exactly one table, `company_members` (`companies.schema.ts:185-203`), PK
  `(user_id, company_id)`. Users have **no** company column. Rows are created by claim approval
  (`server/services/claims/claims.services.ts:249-326`) or admin PUT
  (`setUserCompanyMemberships`, 373–399). `role` and `is_primary` exist in the schema but **no write
  path ever sets them** — effectively unused today. **Both write paths go away**: claims are removed
  (§5.4) and admin assignment moves to accounts. **This table is retired by this project (§5).**
- **Claims (being removed)**: `company_claims` + partial unique index, reviewed in the Admin Panel
  Claims tab (`client/src/components/admin/CompanyClaimsTab.tsx`). Confirmed unused/misused — this
  project deletes the whole feature (§5.4).
- **Membership grants nothing in the UI today**: `use-auth.ts`'s `AuthUser` has no company field;
  the only member surface is the read-only Profile → My Companies list
  (`client/src/components/profile/MyCompaniesTab.tsx`). There is no dashboard of any kind. **This is
  what makes retiring `company_members` cheap now — there is almost no live membership behavior to
  preserve, and it only gets more expensive to change later.**
- **Enrichment**: OpenCorporates fills `company_details`, which **already stores** relationship-ish
  registry metadata we never use: `agent_name`, `agent_address`, `alternative_names`,
  `previous_names`, `corporate_groupings`, `controlling_entity`, `ultimate_controlling_company`,
  `home_company` (`companies.schema.ts:41-80`; written at `companies.services.ts:1029-1066`). These
  are exactly the signals the suggestion engine wants once coverage grows (§8).

### 2.3 What this means for the feature

Because every aggregation except the leaderboard already keys on `buyer_id`/`seller_id`/`assignor_id`
UUIDs, **account rollups are cheap**: the same queries with `inArray(companyIds)` instead of
`eq(companyId)`. Nothing about transaction attribution needs to change for grouping. The gaps are:
(1) no entity that says "these companies belong to one account," (2) no account-level membership,
(3) no rollup endpoints/UI, (4) no way to notice new siblings/duplicates arriving via the nightly
sync, (5) no way to heal a typo-split row.

---

## 3. The model: the group **is** the account

There is one shape, and it removes the two-scenario branching the earlier draft carried:

| | What it is | Holds |
|---|---|---|
| `company_groups` | The **account** — a client/organization (e.g. "Vertigo Rev") | a display-ready `name`, `notes` |
| `company_group_companies` | Which LLCs belong to the account (one group per company) | provenance of each link |
| `group_members` | Which users are on the account's team | the **only** membership relation |

A company (LLC) is a pure attribution entity: it records which deeds it's on, and it may belong to at
most one account. It **never** holds members. To give a person access to an LLC, you put that LLC in
an account and add the person to the account. A single-LLC client is an account with one company —
not a special case, just a small account.

**Why no parent / no `primary_company_id`:** the "parent company" only ever mattered as a display
anchor or as "which company a member attaches to." The account's `name` covers the first, and under
Option A members attach to the *account*, not a company — so the second evaporates. A synthetic
parent `companies` row was also rejected for polluting the directory and the pipeline's unique-name
space (§12). The account is the parent entity; its `name` is the brand.

---

## 4. Data model

`database/schemas/companies.schema.ts` (with inserts/updates/validation in `database/`).

### 4.1 `company_groups` — the account

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` |
| `name` | `text` | NOT NULL, **UNIQUE** — display-ready account name, admin-typed (e.g. `Vertigo Rev`) |
| `notes` | `text` | nullable — admin context ("confirmed via OC filing 2026-05", "same registered agent") |
| `created_by` | `uuid` | nullable, FK → `users.id` (`set null`) |
| `created_at` / `updated_at` | `timestamp` | standard |

> No `primary_company_id`. No parent concept.

### 4.2 `company_group_companies` — which LLCs belong to which account

| Column | Type | Constraints |
|---|---|---|
| `company_id` | `uuid` | **PK**, FK → `companies.id` (**cascade**) — PK = one account per company, enforced by the DB |
| `group_id` | `uuid` | NOT NULL, FK → `company_groups.id` (**cascade**) |
| `source` | `group_source` enum: `'manual' \| 'suggestion'` | NOT NULL, default `'manual'` |
| `added_by` | `uuid` | nullable, FK → `users.id` (`set null`) |
| `created_at` | `timestamp` | NOT NULL, defaultNow |

**Index:** `idx_company_group_companies_group_id` on `(group_id)` — the "all companies in account X"
lookup every rollup and reach query starts with.

**Why a join table, not a `group_id` column on `companies`?** (a) `companies` — the pipeline's
hottest table — stays untouched, zero risk to `insert-companies.ts`'s full-table map build;
(b) provenance columns live where they belong; (c) unlinking is a row delete, not a nullable-column
write racing the sync's upserts.

**Why one account per company (PK on `company_id`)?** An LLC has one owner organization. The rare JV
exception is covered by `notes` in v1; relaxing PK → composite later is additive.

### 4.3 `group_members` — the single membership relation (NEW, replaces `company_members`)

| Column | Type | Constraints |
|---|---|---|
| `user_id` | `uuid` | FK → `users.id` (**cascade**) |
| `group_id` | `uuid` | FK → `company_groups.id` (**cascade**) |
| `role` | `member_role` enum (`'owner' \| 'member'`, reuse existing) | nullable — unused in v1, reserved for a future "account admin" |
| `created_at` | `timestamp` | NOT NULL, defaultNow |
| **PK** | `(user_id, group_id)` | one row per user per account |

**Indexes:** `idx_group_members_user_id` on `(user_id)` (the "what accounts is this user on?" lookup
that drives the dashboard) and `idx_group_members_group_id` on `(group_id)` (the account roster +
email recipient lookup).

A user's visible company set = for each of their `group_members` accounts, all
`company_group_companies` under it. One indexed join. Adding/removing a company from an account
changes every member's reach with **zero** member-row writes; removing a member is one row delete.

### 4.4 `company_merge_suggestions` — the review queue (Phase 2)

One queue for **both** resolutions (account vs duplicate); the admin decides which applies.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) — the candidate |
| `target_group_id` | `uuid` | nullable, FK → `company_groups.id` (cascade) — "belongs in this existing account" |
| `target_company_id` | `uuid` | nullable, FK → `companies.id` (cascade) — "related to this ungrouped company" (pairwise; also the duplicate case) |
| `signal` | `text` | NOT NULL — `name-pattern`, `near-duplicate`, `intra-transfer`, `shared-agent`, `oc-grouping`, `shared-contact` |
| `detail` | `text` | nullable — human-readable evidence |
| `status` | enum `'pending' \| 'accepted' \| 'dismissed'` | NOT NULL, default `pending` |
| `resolution` | enum `'grouped' \| 'merged'` | nullable — set on accept |
| `reviewed_by` / `reviewed_at` | uuid / timestamp | nullable |
| `created_at` | `timestamp` | NOT NULL |

Partial unique index on `(company_id, coalesce(target_group_id, target_company_id), signal)` WHERE
`status = 'pending'`. **Dismissed rows are kept** as the suppression list.

### 4.5 `company_aliases` — hard-merge support (Phase 2)

| Column | Type | Constraints |
|---|---|---|
| `alias_name` | `text` | **PK** — the raw variant string (`LYKOS HOLDING LLC`) |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) — the canonical row |
| `created_by` / `created_at` | | standard |

### 4.6 What changes and what does not

- `companies` — no new columns.
- `company_members` — **retired.** Migrate its (nascent) rows into accounts, repoint the claim and
  admin write paths to `group_members`, then drop the table (§5.5, §11 Phase 1).
- `company_claims` — **removed** with the rest of the claim feature (§5.4): the table (and
  `claimStatusEnum` / `claimTypeEnum`), its routes/controllers/services/validation, and the Claims
  admin tab all go.
- `property_transactions` — untouched by grouping; hard merge repoints FKs but the schema is unchanged.

---

## 5. Membership: the account owns it (the key decision)

**Rule (locked):** membership exists only as `group_members`. A company never has members. To grant
access you (1) ensure the LLC is in an account, (2) add the user to the account.

### 5.1 What this deletes

Choosing Option A removes every hard problem the earlier drafts wrestled with:

- **No "add-to-company redirects to group"** — you can't add to a company at all; the only member
  action targets an account.
- **No "migrate members up when you group a company"** — members were never on the company.
- **No ungroup/dissolve provenance question** — there are no per-company member rows to restore.
  Removing a company from an account: it becomes standalone and, having no members of its own, is
  memberless; the account keeps its members and its other companies. Dissolving an account:
  `group_members` and `company_group_companies` cascade; the companies become standalone.
- **No dedupe-across-two-tables** — one membership table. (Recipient resolution still `SELECT
  DISTINCT user` because a user can be on two different accounts — §5.3.)

### 5.2 Reach (what a user can see)

```
user → group_members → their accounts
     → company_group_companies (for each account, its companies)
     → the union of those companies
```

A shared helper (new `server/services/groups/groups.services.ts`):

```ts
/** Accounts the user is on, each expanded to its companies. Powers the dashboard and access checks. */
getUserAccounts(userId): Promise<{
  accounts: { groupId, groupName,
              companies: { companyId, companyName }[] }[];
}>
```

### 5.3 Email & analytics targeting (the benefit Justin named)

Everything addresses an account. A notification/digest resolves recipients as the account's
`group_members`, deduped by user across accounts. There is exactly one recipient path and no way to
double-send, because there is one membership table and a user appears once per account.

Known consumer to update when member-facing features land:
- `code-violations.services.ts:351-374` `getRecipientsByCompany` — becomes "recipients by the
  company's account" (a violation on an SD REV property notifies the whole Vertigo team). Resolve
  through the account; dedupe by user.
- `users.services.ts:115-117` `hasCompany` filter — re-express against account membership.
- The Claims tab (`CompanyClaimsTab`) is **deleted**, not updated (§5.4).

### 5.4 Membership is admin-assigned; the claim feature is removed

Membership rows are created **only by admins** — in the Company Merging tab (add members to an
account) and, later, the onboarding flow. There is no self-service path.

**The claim feature is deleted, not repurposed.** It was effectively unused (a single user filed ~60
claims misunderstanding what they meant — essentially the only claims we ever received), so it costs
more than it returns. Removal surface (all in Phase 1):
- Schema: `company_claims` table + `claimStatusEnum` + `claimTypeEnum` (`companies.schema.ts`).
- Backend: `claims.routes.ts` / `claims.controllers.ts` / `claims.services.ts`, claim validation
  schemas, and the claim mount in `server/routes/index.ts`.
- Frontend: `CompanyClaimsTab.tsx`, its Admin tab entry, any "claim this company" CTA on the
  directory / company card, and claim rows in `MyCompaniesTab.tsx`.
- Any claim-related emails/notifications and their Postmark templates.
- api.md / access-control.md claim entries; claim tests.

Existing data: approved claims already produced `company_members` rows, which the §5.5 migration
carries into accounts; pending/rejected `company_claims` rows are dropped with the table.

### 5.5 Migrating existing `company_members`

Nascent and grants nothing today, so low-stakes. One-time: for each existing `company_members` row,
ensure an account exists for its company (create a one-company account named after the company if
none), insert a `group_members` row, then drop `company_members`. Documented as a Phase 1 migration
step; exact script written at build time.

---

## 6. Stats & rollups

### 6.1 The three levels

1. **Per-LLC** ("stats for that specific region/LLC") — exists today: `getCompanyById`. Unchanged.
2. **Per-account rollup** ("how everything's doing as a whole") — new `getGroupById(groupId)`: the
   same aggregations as `getCompanyById` but with `inArray(tx.buyerId, accountCompanyIds)` /
   `inArray(tx.sellerId, ...)` / `inArray(tx.assignorId, ...)`. Existing indexes
   (`idx_pt_buyer_date`, `idx_pt_seller_date`, `idx_pt_buyer_sort1`, `idx_pt_assignor`) serve
   `inArray` fine at account sizes (2–20 companies).
3. **Per-LLC breakdown inside the account** — `getGroupById` returns a `companies[]` array where each
   entry carries its own counts (one grouped-by-`buyer_id` query, not N calls).

### 6.2 ⚠️ Intra-account transfers — the rollup correctness trap

Accounts move title between their own LLCs (holding transfers, quit claims, restructures). Naively
rolling up double-counts these as both an acquisition and a sale. Rules for all account-level
aggregates:

- **Excluded from rollup counts**: any transaction where **both** `buyer_id` and `seller_id` are in
  the account's company set.
- **Surfaced separately**: `internalTransferCount` on the account detail — a useful signal and makes
  the exclusion auditable.
- **Distinct-property counting**: "properties owned" at the account level = distinct `property_id`
  where any account company is the buyer on the `sort_order = 1` transaction.
- Per-LLC numbers inside the breakdown stay unfiltered (they answer "what did this LLC record?").

### 6.3 Account `purchaseToArvRatio`

Compute over the union of the account's Arms Length sales (same method as
`purchaseArvRatio.services.ts`, same `MAX_REASONABLE_RATIO = 10` outlier cap), excluding intra-account
sales per §6.2 — *not* a naive average of per-company ratios. Computed on read in `getGroupById` for
v1; denormalize onto `company_groups` later only if the dashboard needs it hot.

### 6.4 Directory & leaderboard (deferred product decisions)

- **`/data` behavior is locked for v1**: selecting a grouped company shows that LLC's properties
  exactly as today + the public account chip (click a sibling → existing `handleCompanyClick`). A
  account-wide `?companyGroup=` property/map filter is a candidate later enhancement.
- **Directory sorts** stay per-LLC. A "group by account" rollup toggle is designed but deferred
  (§13).
- **`getLeaderboard`** aggregates raw name strings, not FKs — it cannot see accounts (or even today's
  FK links) without a rework to id-based tallies. Out of scope; documented as debt. (Hard merges DO
  fix the leaderboard's split counts for typo duplicates.)

---

## 7. API & UI surface

Access control per `.claude/docs/access-control.md`: writes = `requireRole(ADMIN_ROLES)` (admin +
owner); account *association* on public company payloads is **public**; member dashboard =
`requireAuth` + account-membership check in the service. New routes follow the full `/new-route`
ceremony (routes + controllers + services + validation in `database/validation/` + api.md +
access-control.md + baseline integration tests).

### 7.1 New routes — `/api/company-groups` (new domain: routes/controllers/services trio)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/company-groups` | ADMIN_ROLES | Create account `{ name, companyIds[], memberUserIds[]? }` — validates companies exist & are ungrouped |
| GET | `/api/company-groups` | ADMIN_ROLES | Paginated list w/ search, company + member counts (admin management surface) |
| GET | `/api/company-groups/:id` | Public | Account + companies + member roster + rollup stats (§6) (roster may be admin-only; see note) |
| PATCH | `/api/company-groups/:id` | ADMIN_ROLES | `{ name?, notes? }` |
| DELETE | `/api/company-groups/:id` | ADMIN_ROLES | Dissolve the account (company links + members cascade; company rows untouched) |
| POST | `/api/company-groups/:id/companies` | ADMIN_ROLES | Add companies `{ companyIds[] }` — `already-grouped` conflict if any belongs to another account (explicit move, no silent steal) |
| DELETE | `/api/company-groups/:id/companies/:companyId` | ADMIN_ROLES | Remove one company (becomes standalone; transactions/stats untouched) |
| POST | `/api/company-groups/:id/members` | ADMIN_ROLES | Add members `{ userIds[] }` → `group_members` rows |
| DELETE | `/api/company-groups/:id/members/:userId` | ADMIN_ROLES | Remove a member |

> **Note:** the public `GET /:id` returns the account + its companies + rollups for the family chip.
> Whether the **member roster** is public or admin-only is a small open call (§13); default admin-only.

Phase 2 adds:

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/company-merge-suggestions` | PRIVILEGED_ROLES | Queue list (status filter) |
| PATCH | `/api/company-merge-suggestions/:id` | ADMIN_ROLES | `{ action: 'group' \| 'merge' \| 'dismiss', ... }` |
| POST | `/api/companies/:id/merge-duplicate` | ADMIN_ROLES | Direct hard merge `{ duplicateCompanyId }` |

### 7.2 Changes to existing endpoints

- `GET /api/companies/:id` — response gains `group: { id, name, companies: [{ id, companyName }] } |
  null`. One join + one indexed lookup; drives the public account chip.
- Claim endpoints — **deleted** (the claim feature is removed, §5.4).
- Admin membership editor (`setUserCompanyMemberships`) — becomes an account-membership editor
  (assign users to accounts, not companies).
- `GET /api/users/me/...` membership surface — returns the user's accounts + their companies.
- All rendered company names pass through `formatCompanyName` per **ARV.RAW-COMPANY-NAME**; account
  `name` is stored display-ready (admin-typed).

### 7.3 UI

**Admin — one centralized "Company Merging" tab** in `Admin.tsx` (ADMIN_ROLES; PRIVILEGED_ROLES view
suggestions read-only). No merge controls anywhere else. Sections:

- **Accounts**: list of groups (search, company + member counts) · `+ New Account` (name + company
  typeahead reusing `GET /api/companies/contacts/suggestions` + member typeahead) · open an account →
  edit name/notes, add/remove companies, add/remove members, view the roster.
- **Suggestions** (Phase 2): a review queue; each row shows the pair/target + signal + evidence
  and three actions — **Group** (create/extend account), **Merge** (duplicate absorption with a
  confirm showing exactly what moves), **Dismiss**.

The **Claims tab and all claim UI are removed** (§5.4). Members get onto an account only through the
Company Merging tab (and, later, onboarding).

**All users (public):**
- Directory expanded company card: **"Part of {account name} ({n} companies)"** chip + sibling list;
  clicking a sibling runs the existing `handleCompanyClick`. That is the *entire* `/data` change in v1.
- Profile "My Companies" surface → "My Accounts": accounts grouped with their companies listed.

**Member dashboard (later phase — full page):**
- New authenticated page (e.g. `/portfolio`), gated by `requireAuth` + non-empty account membership:
  account rollup tiles (properties owned, sold YTD, purchase-to-ARV ratio, internal transfers),
  per-LLC breakdown table, 90-day acquisition chart at account level, "view on map" hand-off into
  `/data`. Design per `.claude/docs/design-guidelines.md`; chart via existing Recharts patterns in
  `CompanyDirectory.tsx:790-898`.

---

## 8. Where associations come from

Three sources. **Nothing ever auto-groups or auto-merges — a human confirms every link.** A false
account link leaks one client's dashboard/emails to another; a false merge corrupts attribution.

1. **Manual (Phase 1 backbone).** Admin recognizes the account (market knowledge, deed patterns) and
   builds it in the Company Merging tab. Seeds VERTIGO REV / SD REV / CO REV day one.
2. **Suggestion engine (Phase 2).** A detector job (cron, alongside `server/jobs/index.ts`) writes
   `company_merge_suggestions`. Signal tiers:
   - **Tier 1 — no enrichment, DB-wide, ship first:** near-duplicate names (edit distance after
     entity-suffix strip → feeds **merge**); name patterns (shared distinctive tokens → feeds
     **group**, ranked low); intra-transfer detection (two companies transacting with each other →
     feeds **group**).
   - **Tier 2 — enrichment-dependent:** shared registered agent
     (`company_details.agent_name/agent_address`), OC relationship metadata
     (`corporate_groupings`, `controlling_entity`, `ultimate_controlling_company`, `home_company`,
     `alternative_names`), shared officers/addresses. Caveat: enrichment runs SD-MSA-only, 500/month
     (`server/jobs/enrich-companies.ts:14-16`).
3. **Pipeline hook for new arrivals (Phase 2).** After `insertCompanies` returns its newly-created
   set, run Tier-1 detectors against just those names and enqueue suggestions — a new sibling LLC on
   Tuesday's deed → suggestion Wednesday morning.

**Dissolved LLCs** stay in their account forever — history is the product. `dissolution_date` /
`inactive` already exist; the breakdown badges dissolved members.

---

## 9. Hard merge — healing typo-duplicate rows (first-class, Phase 2)

The **same LLC** split across rows by a clerical deed error (`LYKOS HOLDING LLC` vs `LYKOS HOLDINGS
LLC`). Grouping would be wrong (UI would show "2 companies" that are one; stats stay fragmented).
These need a real merge, and there's a trap:

> **The pipeline resurrects deleted duplicates.** `insert-companies.ts` matches on exact trimmed
> name; deleting the loser row lets the next sync recreate it. The `company_aliases` table (§4.5)
> permanently maps the bad spelling to the canonical row.

Mechanism — one transaction behind `POST /api/companies/:id/merge-duplicate` (winner = `:id`):
1. Repoint `property_transactions.buyer_id/seller_id/assignor_id` and `properties`' current-sale FKs;
   merge `company_msas`, `company_counties`, `company_contacts` (dedupe on conflict),
   `company_details` (keep the richer); reconcile `company_group_companies` (loser in a *different*
   account than winner → **abort**, human resolves the account question first). *(No `company_members`
   step — that table no longer exists.)*
2. Insert the loser's name into **`company_aliases`** pointing at the winner.
3. Delete the loser row; recompute the winner's `purchaseToArvRatio`.
4. Pipeline change (the only sync-path change in the plan): `insert-companies.ts:64-69` and
   `resolve-ids.ts:48-53` build their name→company maps from `companies` **UNION `company_aliases`**.
   (Raw `buyer_name`/`seller_name` strings on old rows keep the misspelling — the FK carries identity.)

Not undoable — the diff-style confirm dialog says so.

---

## 10. Complications & edge cases

| # | Issue | Resolution |
|---|---|---|
| 1 | Company in two accounts (JV) | Not supported v1 (PK enforces one account). `notes` documents it; relaxing later is additive. |
| 2 | Moving a company between accounts | Explicit remove-then-add. Add endpoint returns `already-grouped` — no silent steal. |
| 3 | Account shrinks to 0/1 companies | 1 is allowed. 0 via company-deletion cascade is possible but companies are never deleted today; the admin list surfaces empties. |
| 4 | Removing a company from an account | It becomes standalone and memberless (members belonged to the account). Re-add later if needed. |
| 5 | Dissolving an account | `group_members` + `company_group_companies` cascade; companies go standalone. Members lose access; no provenance restore (chosen — §5.1). |
| 6 | Rollup double-counting | §6.2 rules. |
| 7 | User on two accounts | Fine — reach is a set union; dashboard shows multiple account sections; emails dedupe by user. |
| 8 | Getting a user onto a company | Only via account membership in the Company Merging tab — there is no claim / self-service path (§5.4). |
| 9 | Account name collides with a company name | Allowed. Account names unique only among accounts. |
| 10 | Hard-merging two companies both grouped (different accounts) | Merge aborts; admin resolves the account assignment first. Same account → loser's link row just deleted. |
| 11 | Merge chosen when group was right (or vice versa) | Group is reversible (remove/dissolve); merge is destructive → diff-style confirm + queue keeps `resolution` for audit. **UI copy: when unsure, group — a grouped pair can be merged later, a merged pair can't be split.** |
| 12 | `group_members.role` | Reserved-but-unused; a future "account admin" slots in without schema change. |
| 13 | Reach-based access leaking | Account membership powers only *member-facing* dashboard/notifications; never admin powers. All group/merge mutations stay ADMIN_ROLES. |
| 14 | `getLeaderboard` name-string based | Out of scope; documented as debt. Hard merges partially heal it. |
| 15 | Docs & agents | Schema + route changes trigger `database.md`, `api.md`, `access-control.md`, `apps.md` (Data section) updates; the Agent Updater hook enforces. |

---

## 11. Build phases

**Phase 1 — Accounts core + centralized admin tab + membership cutover**
1. Schema: `company_groups`, `company_group_companies` (+ `group_source` enum), `group_members`;
   inserts/updates/validation; `db:push`.
2. **Claim removal + membership cutover:** delete the claim feature end-to-end (§5.4); migrate
   existing `company_members` rows into accounts (§5.5); repoint the admin membership editor to
   `group_members`; drop `company_members`.
3. New `server/services/groups/` + controllers + `company-groups.routes.ts` (§7.1 core + member
   routes); mount in `server/routes/index.ts`.
4. `getCompanyById` response gains `group`; user membership surface returns accounts.
5. Admin UI: **Company Merging tab** — Accounts section (list/create/edit, add/remove companies,
   add/remove members, roster). Remove the Claims tab and all claim UI (§5.4).
6. Public account chip + sibling list on the directory's expanded company card.
7. Ceremony: api.md / access-control.md / database.md / apps.md updates; baseline integration tests
   (`/test-route`); `npm run check`.

**Phase 2 — Discovery + duplicate merge**
1. `company_merge_suggestions` + `company_aliases` schema.
2. Tier-1 detector job + pipeline hook for newly-inserted companies; suggestion routes.
3. Suggestions section in the Company Merging tab (Group / Merge / Dismiss).
4. Hard-merge service + `POST /api/companies/:id/merge-duplicate` + pipeline alias lookup + diff-style
   confirm UI. **(Manual admin-create of a non-SFR company can land here too, sharing the
   normalization + alias work.)**

**Phase 3 — Rollups + member dashboard** (independent of Phase 2)
1. `getGroupById` rollup on `GET /api/company-groups/:id` (inArray aggregates, intra-account
   exclusion, per-LLC breakdown, account ratio).
2. `getUserAccounts` service; **`/portfolio` dashboard page** (requireAuth + account-gated).
3. "My Accounts" profile surface.
4. Audit membership consumers per §5.3 (code-violations recipients → account).

**Later / backlog:** Tier-2 signals as enrichment expands · manual admin-create of non-SFR companies ·
`?companyGroup=` account-wide `/data` filter · directory "group by account" toggle · id-based
leaderboard rework · relaxing one-account-per-company for a real JV.

Phase 1 is independently valuable; Phases 2 and 3 each ship alone.

---

## 12. Rejected alternatives (and why)

- **`is_parent` boolean / `primary_company_id` pointer / synthetic parent `companies` row** — a
  parent entity forces either fabricating synthetic company rows (which pollute directory count-sorts
  and occupy unique names the pipeline matches against) or conflating "appears on deeds" with
  "grouping concept." The account (`company_groups.name`) is the parent; nothing is fabricated.
- **Derived reach from company-level membership** (keep `company_members`, expand to siblings at read
  time) — elegant for the no-fan-out property, but it **cannot express "member of this one LLC
  only"**: any company membership auto-expands to the whole family once that company is grouped. Since
  we want a company-level *and* an account-level access concept, the model has to know which one
  applies — and Option A answers that by making the account the sole membership holder.
- **Two coexisting tables (`company_members` + `group_members`) with dedupe** (Option B) — no data
  migration, but permanent dual-model logic: every membership write branches on "is this company
  grouped?", grouping runs a migration, and the "no company members for a grouped company" invariant
  can race a concurrent membership write. Option A collapses this to one table and deletes the branching.
- **Materialized membership fan-out** (a member row per user per account company) — the 10-rows
  problem, plus reconciliation on every group/ungroup/move. Account-level membership makes it
  unnecessary.
- **Hard-merging family LLCs into one row** — transactions must keep the true recorded LLC;
  irreversible; the pipeline would resurrect the names. Hard merge is reserved for true duplicates.
- **Auto-grouping/auto-merging from signals without review** — a false account link leaks
  dashboard/email reach across clients; a false merge corrupts attribution irreversibly. Human
  confirmation is the gate (§8).

---

## 13. Remaining open questions (none block Phase 1; defaults noted)

Resolved 2026-07-08: the group is the account (§3) · membership at the account level only, Option A
(§5) · **claim feature removed** (§5.4) · no parent (§3, §12) · create-company deferred (§2.1,
decision #5) · admin UX centralization (§7.3) · public account chip (decision #6) · `/data` v1
behavior (decision #7).

1. **Member roster visibility** (§7.1 note): is the account's member list public alongside the family
   chip, or admin-only? *Default admin-only.*
2. **Directory rollup toggle** (§6.4): should accounts collapse into one ranked row in directory
   sorts? *Backlog; shapes whether rollup counts get denormalized.*
3. **Phase 2 vs Phase 3 ordering**: discovery+merge vs rollups+dashboard — independent. *Default:
   Phase 2 first, so clean/linked data makes dashboard numbers right on arrival.*
4. **Suggestion detector cadence**: nightly full scan vs per-sync incremental. *Default: both —
   incremental hook + weekly full re-scan.*
