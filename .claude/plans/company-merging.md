# Company Merging (Company Groups) — Design & Build Plan

> **Status:** Plan / design phase. No code written yet.
>
> **Decisions locked (2026-07-06, with Neil):**
> 1. **Data model:** parent = a row in a new `company_groups` table (NOT an `is_parent` flag /
>    synthetic row in `companies` — considered and rejected, see §12). Companies table untouched.
> 2. **Admin UX:** ALL merge management lives in one dedicated **Admin Panel tab** ("Company
>    Merging"). No admin controls embedded in the directory/`/data` UI — we are deliberately
>    starting to centralize admin controls rather than adding more role-conditional UI to shared
>    surfaces. (Existing scattered admin controls are NOT being migrated as part of this project.)
> 3. **Visibility:** family associations are **public** — the "Part of Vertigo Rev (3 companies)"
>    chip shows to everyone in the directory, like all other company data.
> 4. **`/data` v1 behavior:** selecting a grouped company stays **per-LLC** (properties/stats
>    exactly as today) + the public family chip with click-through to siblings. Family-wide
>    property filtering is deferred (§6.4).
> 5. **Suggestions engine:** pulled forward into **Phase 2** (not late-phase). Manual-only merging
>    across thousands of companies risks the feature never being used. Start with signals that
>    need no enrichment (name patterns, near-duplicate names, intra-family transactions).
> 6. **Member deliverable:** the **full dashboard page** (family rollup + per-LLC breakdown) is in
>    scope for this project (Phase 2/3), not just an enhanced profile tab.
> 7. **True duplicates are a confirmed, first-class problem** — NOT casing/punctuation (source
>    data is uniformly uppercase) but **clerical typo variants** on deed paperwork, e.g.
>    `LYKOS HOLDING LLC` vs `LYKOS HOLDINGS LLC`. These require a real **hard merge** (one row
>    absorbs the other + alias so the pipeline never re-splits them). Hard merge is a peer
>    capability to grouping, not a someday-tool (§9).
>
> **The one framing decision this document rests on:** the feature is **two distinct operations
> sharing one admin surface**:
> - **Group** (the common case): N real LLCs belong to one organization → link them under a
>   `company_groups` row. Transactions stay attributed to the exact LLC that recorded the deed.
> - **Hard merge** (the duplicate case): two rows are the *same* LLC (typo variant) → absorb one
>   into the other, keep the bad spelling as an alias. Destructive on the row, lossless on data.
>
> An admin reviewing "LYKOS HOLDING LLC ↔ LYKOS HOLDINGS LLC" picks *merge*; reviewing
> "SD REV ↔ CO REV" picks *group*. Same queue, two resolutions.

---

## 1. The idea in one paragraph

Real-estate operators run one brand through many LLCs — "Vertigo Rev" buys as SD REV in San Diego,
CO REV in Colorado, MIAMI REV in Florida — and our pipeline creates one unrelated `companies` row
per raw deed name. We add a `company_groups` table (the family, e.g. "Vertigo Rev") and a
one-group-per-company membership table linking existing company rows into it. The group is the
parent — **whether or not a parent company row exists in our DB** (Scenario 1: it does, we mark it
`primary_company_id`; Scenario 2: it doesn't, the group's `name` carries the brand and no fake
company row is ever created). Users keep being members of the *specific* LLC they claimed
(`company_members` is untouched); their reach to sibling LLCs is **derived at query time** through
the group — so one membership row per user, no fan-out, and grouping/ungrouping companies never
requires touching user rows. On top of that: rollup stats (per-LLC + family-wide, intra-family
transfers excluded), a member dashboard page, a suggestion engine that proposes families and
duplicates so admins approve instead of hunting through thousands of rows, and a hard-merge tool
(+ alias table) for typo-duplicate rows.

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
- **The duplicate class that actually occurs** (confirmed by Neil): clerical typo variants on deed
  paperwork — `LYKOS HOLDING LLC` vs `LYKOS HOLDINGS LLC`. No normalization can fix a missing `S`;
  the data simply arrives wrong sometimes. Exact-string identity then splits one LLC across two
  rows, fragmenting its stats. Companies are also **insert-only** — no cleanup, archival, or merge
  logic exists anywhere.

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
- **Membership** is exactly one table, `company_members` (`companies.schema.ts:185-203`), PK
  `(user_id, company_id)`. Users have **no** company column. Rows are created by claim approval
  (`server/services/claims/claims.services.ts:249-326`) or admin PUT
  (`setUserCompanyMemberships`, 373–399). `role` and `is_primary` exist in the schema but **no write
  path ever sets them** — effectively unused today.
- **Claims**: `company_claims` + partial unique index (one non-rejected claim per user per company),
  reviewed in the Admin Panel Claims tab (`client/src/components/admin/CompanyClaimsTab.tsx`).
- **Membership grants nothing in the UI today**: `use-auth.ts`'s `AuthUser` has no company field;
  the only member surface is the read-only Profile → My Companies list
  (`client/src/components/profile/MyCompaniesTab.tsx`). There is no company dashboard of any kind.
- **Enrichment**: OpenCorporates fills `company_details`, which **already stores** relationship-ish
  registry metadata we never use: `agent_name`, `agent_address`, `alternative_names`,
  `previous_names`, `corporate_groupings`, `controlling_entity`, `ultimate_controlling_company`,
  `home_company` (`companies.schema.ts:41-80`; written at `companies.services.ts:1029-1066`). These
  are exactly the signals the suggestion engine wants once coverage grows (§8).

### 2.3 What this means for the feature

Because every aggregation except the leaderboard already keys on `buyer_id`/`seller_id`/`assignor_id`
UUIDs, **group rollups are cheap**: the same queries with `inArray(companyIds)` instead of
`eq(companyId)`. Nothing about transaction attribution needs to change for grouping. The gaps are:
(1) no entity that says "these companies belong together," (2) no derived member reach, (3) no
rollup endpoints/UI, (4) no way to notice new siblings/duplicates arriving via the nightly sync,
(5) no way to heal a typo-split row.

---

## 3. The two scenarios, solved by one shape

| | Scenario 1 — parent exists in DB | Scenario 2 — parent never transacts |
|---|---|---|
| Example | VERTIGO REV bought a property once; SD REV / CO REV are its LLCs | Only SD REV / CO REV / MIAMI REV ever appear on deeds |
| Group row | `company_groups { name: "Vertigo Rev", primary_company_id: <VERTIGO REV's uuid> }` | `company_groups { name: "Vertigo Rev", primary_company_id: NULL }` |
| Members | VERTIGO REV, SD REV, CO REV all linked as group companies | SD REV, CO REV, MIAMI REV linked |
| If the parent shows up later | — | Pipeline creates the VERTIGO REV company row; admin links it into the group and (optionally) sets it primary |

**Decision (locked): never create a synthetic `companies` row for a missing parent.** The
`is_parent`-flag alternative was considered seriously (it gives one mental model — parent is
clickable/claimable/enrichable like any company) and rejected: a synthetic row would (a) appear in
the public directory with zero transactions unless every count-sort filters the flag, (b) occupy
the unique `company` name so a *real* future deed under a near-identical spelling still creates a
duplicate anyway, (c) require the pipeline's exact-name matching to special-case the flag. The
group **is** the parent entity; its `name` column is the brand. `primary_company_id` is a nullable
pointer for when a real parent row exists — display anchor, nothing more. In the UI we can still
*label* the group "Parent Company" — the schema choice doesn't dictate the vocabulary.

This also answers "existing company vs. create a parent": you never choose. You always create a
*group*; you sometimes additionally mark one member as primary.

---

## 4. Data model

Three new tables in Phase 1–2, one more (aliases) with the hard-merge tool. All in
`database/schemas/companies.schema.ts` with inserts/updates/validation in `database/`.

### 4.1 `company_groups` — the family / parent entity

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK, `defaultRandom()` |
| `name` | `text` | NOT NULL, **UNIQUE** — display-ready brand name, admin-typed (e.g. `Vertigo Rev`) |
| `primary_company_id` | `uuid` | nullable, FK → `companies.id` (**`set null`**) — the parent, when it exists as a company row |
| `notes` | `text` | nullable — admin context ("confirmed via OC filing 2026-05", "same registered agent") |
| `created_by` | `uuid` | nullable, FK → `users.id` (`set null`) |
| `created_at` / `updated_at` | `timestamp` | standard |

### 4.2 `company_group_companies` — which companies are in which family

| Column | Type | Constraints |
|---|---|---|
| `company_id` | `uuid` | **PK**, FK → `companies.id` (**cascade**) — PK = one group per company, enforced by the database |
| `group_id` | `uuid` | NOT NULL, FK → `company_groups.id` (**cascade**) |
| `source` | `group_source` enum: `'manual' \| 'suggestion'` | NOT NULL, default `'manual'` — how this link was established |
| `added_by` | `uuid` | nullable, FK → `users.id` (`set null`) |
| `created_at` | `timestamp` | NOT NULL, defaultNow |

**Index:** `idx_company_group_companies_group_id` on `(group_id)` (the "all companies in family X"
lookup that every rollup query starts with).

**Why a join table instead of a `group_id` column on `companies`?** Same one-group invariant
(company_id is the PK), but: (a) `companies` — the pipeline's hottest table — stays untouched, so
zero risk to `insert-companies.ts`'s full-table map build; (b) provenance columns (`source`,
`added_by`, `created_at`) live where they belong; (c) unlinking is a row delete, not a nullable
column write racing the sync's upserts.

**Why one group per company (PK on `company_id`), not many-to-many?** An LLC has one owner family.
The conceivable exception — a joint venture LLC owned by two families — is rare enough that `notes`
covers it in v1; relaxing PK → composite later is an additive migration. Many-to-many from day one
would force every rollup, dashboard, and access question to answer "which group context?" for no
real-world payoff.

### 4.3 `company_merge_suggestions` — the review queue (Phase 2)

One queue for **both** resolutions (family vs duplicate); the admin decides which applies.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) — the candidate |
| `target_group_id` | `uuid` | nullable, FK → `company_groups.id` (cascade) — "belongs in this existing family" |
| `target_company_id` | `uuid` | nullable, FK → `companies.id` (cascade) — "related to this ungrouped company" (pairwise; also the duplicate case) |
| `signal` | `text` | NOT NULL — machine-readable reason (`name-pattern`, `near-duplicate`, `intra-transfer`, `shared-agent`, `oc-grouping`, `shared-contact`) |
| `detail` | `text` | nullable — human-readable evidence ("differs by 1 character from LYKOS HOLDINGS LLC", "registered agent 'JANE DOE' shared with CO REV") |
| `status` | enum `'pending' \| 'accepted' \| 'dismissed'` | NOT NULL, default `pending` |
| `resolution` | enum `'grouped' \| 'merged'` | nullable — set on accept: which action the admin took |
| `reviewed_by` / `reviewed_at` | uuid / timestamp | nullable |
| `created_at` | `timestamp` | NOT NULL |

Partial unique index on `(company_id, coalesce(target_group_id, target_company_id), signal)` WHERE
`status = 'pending'` so detector re-runs don't spam duplicates. **Dismissed rows are kept** — they
are the suppression list that stops a dismissed pair from being re-suggested every night.

### 4.4 `company_aliases` — hard-merge support (with the merge tool, Phase 2)

| Column | Type | Constraints |
|---|---|---|
| `alias_name` | `text` | **PK** — the raw variant string (`LYKOS HOLDING LLC`) |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) — the canonical row (`LYKOS HOLDINGS LLC`) |
| `created_by` / `created_at` | | standard |

### 4.5 What deliberately does NOT change

- `companies` — no new columns.
- `company_members` — untouched. Users remain members of the **specific LLC** (§5).
- `company_claims` — untouched; claims stay per-company.
- `property_transactions` — untouched by grouping; hard merge repoints FKs but the schema is unchanged.

---

## 5. Membership: one row per user, group reach derived (the key decision)

Neil's instinct in the brief is right, and the design adopts it: **do not fan out
`company_members` rows across the family.** A user is a member of the LLC they actually
claimed/were assigned (real-world truth, audit-friendly), and *"which companies can this user
see?"* is answered at read time:

```
user → company_members → their company rows
     → company_group_companies (for each company, its group, if any)
     → all sibling companies of those groups
```

One indexed join beyond what `getUserMemberships` (`claims.services.ts:354-369`) already does.
A shared service helper (new `server/services/groups/groups.services.ts`) exposes it once:

```ts
/** Companies the user can act for: direct memberships expanded through their groups. */
getUserCompanyReach(userId): Promise<{
  memberships: { companyId, companyName, groupId | null }[];
  groups: { groupId, groupName, primaryCompanyId | null,
            companies: { companyId, companyName, isDirect: boolean }[] }[];
}>
```

**Why derived beats materialized (the 10-rows problem, solved by not creating them):**

- *Add SD REV to the Vertigo group* → every SD REV member instantly "reaches" CO REV, MIAMI REV.
  Zero member-row writes.
- *Remove SD REV from the group* (mis-grouped, LLC sold off) → reach contracts instantly. This is
  the "demerge" case from the brief — with materialized rows we'd need a script to find and delete
  the fanned-out rows *without* deleting genuinely direct memberships; derived, it's a no-op.
- *New team member joins the family* → admin adds them to **one** company (any group company —
  reach is identical). One row, not ten.
- *No reconciliation script class exists at all.* The brief's worry — "when we merge, we might have
  to run something to check are there users associated with these companies" — dissolves: grouping
  never mutates membership; it only changes what the derived query returns.

(Hard merge is the one exception: absorbing a duplicate row does move its `company_members` rows to
the canonical row — §9 step 1 — but that's the same LLC, not a family operation.)

**Costs, acknowledged:** every access check that today asks "is user a member of company X?" must
become "is company X within the user's reach?" (one extra join); and "who can act for SD REV?"
returns family members who never explicitly joined SD REV — which is exactly the desired behavior,
but consumers must be audited. Known consumers to update when member-facing features land:
- `code-violations.services.ts:351-374` `getRecipientsByCompany` — should notify the whole family's
  members (a violation on an SD REV property matters to the Vertigo team). Decision: expand through
  reach.
- `users.services.ts:115-117` `hasCompany` filter — direct membership is still the right meaning
  here; leave as-is.
- Claim review (`CompanyClaimsTab`) — show group context (§7.3) but claims stay per-company.

---

## 6. Stats & rollups

### 6.1 The three levels the brief asks for

1. **Per-LLC** ("stats for that specific region/LLC") — exists today: `getCompanyById`. Unchanged.
2. **Per-family rollup** ("how everything's doing as a whole") — new `getGroupById(groupId)`:
   the same aggregations as `getCompanyById` but with `inArray(tx.buyerId, groupCompanyIds)` /
   `inArray(tx.sellerId, ...)` / `inArray(tx.assignorId, ...)`. Existing indexes
   (`idx_pt_buyer_date`, `idx_pt_seller_date`, `idx_pt_buyer_sort1`, `idx_pt_assignor`) serve
   `inArray` fine at family sizes (2–20 companies).
3. **Per-LLC breakdown inside the family** ("the individual companies… and all the properties they
   own") — `getGroupById` returns a `companies[]` array where each entry carries its own counts
   (one grouped-by-`buyer_id` query, not N calls).

### 6.2 ⚠️ Intra-family transfers — the rollup correctness trap

LLC families move title between their own entities (SD REV → VERTIGO REV holding transfers, quit
claims, restructures). Naively rolling up would count these as acquisitions AND sales, double-
counting activity that is economically internal. Rules for all group-level aggregates:

- **Excluded from rollup counts**: any transaction where **both** `buyer_id` and `seller_id` are in
  the group's company set.
- **Surfaced separately**: `internalTransferCount` on the group detail — genuinely useful signal
  ("this family restructured in March") and makes the exclusion auditable rather than silent.
- **Distinct-property counting**: "properties owned" at the family level = distinct `property_id`
  where any group company is the buyer on the `sort_order = 1` transaction — naturally dedupes a
  property that passed through two family LLCs.
- Per-LLC numbers inside the breakdown stay unfiltered (they answer "what did this LLC record?").

### 6.3 Group `purchaseToArvRatio`

Compute over the union of the family's Arms Length sales (same method as
`purchaseArvRatio.services.ts`, same `MAX_REASONABLE_RATIO = 10` outlier cap), excluding intra-
family sales per §6.2 — *not* a naive average of per-company ratios (that would weight a 1-sale LLC
equal to a 100-sale LLC). Computed on read in `getGroupById` for v1; denormalize onto
`company_groups` later only if the dashboard needs it hot.

### 6.4 Directory & leaderboard (deferred product decisions)

- **`/data` behavior is locked for v1**: selecting a grouped company shows that LLC's properties
  exactly as today + the public family chip (click a sibling → existing `handleCompanyClick`).
  A family-wide `?companyGroup=` property/map filter is a candidate later enhancement.
- **Directory sorts** stay per-LLC. A family with volume split across 10 LLCs ranks low on every
  card — a "group by family" rollup toggle is designed but deferred; it touches `getContacts`'s
  in-memory sort path significantly. (Open question §13.)
- **`getLeaderboard`** aggregates raw name strings, not FKs — it cannot see groups (or even today's
  FK links) without a rework to id-based tallies. Flagged as tech debt this feature makes visible;
  not in scope. (Hard merges DO fix the leaderboard's split counts for typo duplicates, since the
  alias consolidates future rows and the merge consolidates history — one more reason §9 matters.)

---

## 7. API & UI surface

Access control per `.claude/docs/access-control.md` conventions: writes = `requireRole(ADMIN_ROLES)`;
group *association* on public company payloads is **public (locked)**; member dashboard =
`requireAuth` + reach check in the service. New routes follow the full `/new-route` ceremony
(routes + controllers + services + validation schemas in `database/validation/` + api.md +
access-control.md + baseline integration tests).

### 7.1 New routes — `/api/company-groups` (new domain: routes/controllers/services trio)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/company-groups` | ADMIN_ROLES | Create group `{ name, companyIds[], primaryCompanyId? }` — validates companies exist & are ungrouped; primary must be in `companyIds` |
| GET | `/api/company-groups` | ADMIN_ROLES | Paginated list w/ search, member counts (admin management surface) |
| GET | `/api/company-groups/:id` | Public | Group + members + rollup stats + per-LLC breakdown (§6) |
| PATCH | `/api/company-groups/:id` | ADMIN_ROLES | `{ name?, primaryCompanyId?, notes? }` |
| DELETE | `/api/company-groups/:id` | ADMIN_ROLES | Dissolve the family (membership rows cascade; company rows untouched — every child becomes standalone) |
| POST | `/api/company-groups/:id/companies` | ADMIN_ROLES | Add companies `{ companyIds[] }` — `already-grouped` conflict result if any belongs to another group (explicit move required, no silent steal) |
| DELETE | `/api/company-groups/:id/companies/:companyId` | ADMIN_ROLES | Remove one company (it becomes standalone; its transactions/stats untouched); if it was `primary_company_id`, null the pointer; groups may drop to 1 member (kept — admin dissolves explicitly) |

Phase 2 adds:

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/company-merge-suggestions` | PRIVILEGED_ROLES | Queue list (status filter, like claims) |
| PATCH | `/api/company-merge-suggestions/:id` | ADMIN_ROLES | `{ action: 'group' \| 'merge' \| 'dismiss', ... }` — group → create/extend family; merge → run §9; dismiss → suppress |
| POST | `/api/companies/:id/merge-duplicate` | ADMIN_ROLES | Direct hard merge `{ duplicateCompanyId }` (also invokable outside the queue) |

### 7.2 Changes to existing endpoints

- `GET /api/companies/:id` — response gains
  `group: { id, name, primaryCompanyId, companies: [{ id, companyName }] } | null`. One join +
  one indexed lookup; drives the public family chip.
- `GET /api/users/me/company-memberships` — each row gains the same `group` object (drives the
  My Companies view and dashboard entry point).
- All rendered company/group names pass through `formatCompanyName` per **ARV.RAW-COMPANY-NAME**
  (group `name` is stored display-ready since it's admin-typed, not SFR-sourced).

### 7.3 UI

**Admin — one centralized tab (locked decision).** New **"Company Merging"** tab in `Admin.tsx`
(ADMIN_ROLES; PRIVILEGED_ROLES can view suggestions read-only, mirroring the claims split). No
merge controls anywhere else — the directory card gets **no** new admin actions. Two sections:

- **Families**: list of groups (search, member counts) · `+ New Family` (name + company typeahead
  reusing `GET /api/companies/contacts/suggestions`, optional primary) · open a family → edit
  name/primary/notes, add/remove companies, and a derived **family roster** — all users who are
  members of any company in the group (read-only; answers "who's on the Vertigo team?" with no new
  membership table).
- **Suggestions** (Phase 2): claims-style queue; each row shows the pair/target + signal + evidence
  and three actions — **Group** (create/extend family), **Merge** (duplicate absorption with a
  confirm showing exactly what moves), **Dismiss**.

Adjacent admin touch: `CompanyClaimsTab.tsx` claim rows for a grouped company show a family badge
("VERTIGO REV family — 2 existing members across group") so admins catch cross-LLC situations.
This lives inside the Admin Panel already, so it doesn't violate the centralization rule.

**All users (public, locked):**
- Expanded company card in the directory: **"Part of {family name} ({n} companies)"** chip +
  sibling list; clicking a sibling runs the existing `handleCompanyClick`. That is the *entire*
  `/data` change in v1.
- `MyCompaniesTab.tsx`: memberships grouped under their family header with sibling companies listed.

**Member dashboard (locked: full page, this project):**
- New authenticated page (e.g. `/portfolio`), gated by `requireAuth` + non-empty reach:
  family rollup tiles (properties owned, sold YTD, assigned, purchase-to-ARV ratio, internal
  transfers), per-LLC breakdown table, 90-day acquisition chart at family level, and a "view on
  map" hand-off into `/data` (initially: per-LLC hand-off; family-wide map filter is the later
  `?companyGroup=` enhancement).
- Design per `.claude/docs/design-guidelines.md`; chart via existing Recharts patterns from
  `CompanyDirectory.tsx:790-898`.

---

## 8. Where associations come from (the "how do we get that association?" question)

Three sources. **Nothing ever auto-groups or auto-merges — a human confirms every link.** False
merges are worse than missed ones: they leak one family's dashboard reach to another family's
members (grouping) or corrupt attribution (hard merge).

1. **Manual (Phase 1 backbone).** Admin recognizes the family (market knowledge, deed patterns)
   and builds it in the Company Merging tab. Seeds VERTIGO REV / SD REV / CO REV day one.
2. **Suggestion engine (Phase 2 — pulled forward, locked).** A detector job (cron, alongside
   existing jobs in `server/jobs/index.ts`) writes `company_merge_suggestions`. Signal tiers:
   - **Tier 1 — no enrichment needed, DB-wide, ship first:**
     - **Near-duplicate names** — small edit distance / one-token difference after stripping
       entity suffixes (`LYKOS HOLDING LLC` ↔ `LYKOS HOLDINGS LLC`). Primarily feeds **merge**.
     - **Name patterns** — shared distinctive tokens after suffix-stripping (`SD REV LLC` /
       `CO REV LLC` share `REV`); high recall, low precision → ranked below corroborated signals.
       Primarily feeds **group**.
     - **Intra-transfer detection** — two companies transacting with each other (§6.2's exclusion
       logic inverted into discovery). Feeds **group**.
   - **Tier 2 — enrichment-dependent, grows with coverage:** shared registered agent
     (`company_details.agent_name/agent_address` — strongest single family signal), OpenCorporates
     relationship metadata (`corporate_groupings`, `controlling_entity`,
     `ultimate_controlling_company`, `home_company`, `alternative_names` — stored since enrichment
     was built, used by nothing), shared officers across `company_contacts`, shared
     `company_addresses`. Caveat: enrichment currently runs for the San Diego MSA only, 500/month
     budget (`server/jobs/enrich-companies.ts:14-16`) — these signals are only as broad as
     enrichment coverage.
3. **Pipeline hook for new arrivals (Phase 2, with the detector).** The brief's "new ones
   constantly being created": after `insertCompanies` returns its newly-created set
   (`insert-companies.ts` already knows which rows are new), run the Tier-1 detectors against just
   those names (vs existing group names, group members, and all company names) and enqueue
   suggestions. New sibling LLC appears on a deed Tuesday night → suggestion waiting Wednesday
   morning. Keeps the consumer's critical path untouched (fire-and-forget after Step 5, or fold
   into the nightly detector run — build-phase decision).

**Dissolved LLCs** ("old ones constantly being dissolved"): stay in their group forever — history
is the product. `company_details.dissolution_date` / `inactive` already exist; the group breakdown
badges dissolved members. No archival mechanics needed or wanted.

---

## 9. Hard merge — healing typo-duplicate rows (first-class, Phase 2)

The confirmed real-world case: the **same LLC** split across rows by a clerical error on deed
paperwork (`LYKOS HOLDING LLC` vs `LYKOS HOLDINGS LLC`). Grouping these would be wrong — the family
UI would show "2 companies" that are one, and stats would stay fragmented. These need a real merge,
and there's a trap the mechanism must solve:

> **The pipeline resurrects deleted duplicates.** `insert-companies.ts` matches on exact trimmed
> name; if we repoint FKs from `LYKOS HOLDING LLC` to `LYKOS HOLDINGS LLC` and delete the loser
> row, the next sync batch containing the misspelling recreates it, and the split begins again.
> The `company_aliases` table (§4.4) is the fix: the bad spelling permanently maps to the
> canonical row.

Mechanism — one transaction behind `POST /api/companies/:id/merge-duplicate` (winner = `:id`):
1. Repoint `property_transactions.buyer_id/seller_id/assignor_id` and `properties`' current-sale
   FKs; merge `company_msas`, `company_counties` (composite-PK upserts — dedupe on conflict),
   `company_contacts` (unique `(company_id, first, last)` — skip conflicts), `company_members`
   (PK conflict → drop loser row), `company_claims`, `company_details` (keep the richer of the
   two), `company_group_companies` (loser grouped ≠ winner's group → **abort**, human resolves the
   group question first).
2. Insert the loser's name into **`company_aliases`** pointing at the winner.
3. Delete the loser row; recompute the winner's `purchaseToArvRatio`
   (`recomputeRatiosForCompanies`).
4. Pipeline change (the only sync-path change in this whole plan): `insert-companies.ts:64-69` and
   `resolve-ids.ts:48-53` build their name→company maps from `companies` **UNION
   `company_aliases`** so alias spellings resolve to the canonical row and never re-create the
   duplicate. (Note: the raw `buyer_name`/`seller_name` strings on old transaction rows keep the
   misspelling — correct, that's what the deed said; the FK carries identity.)

Admin surface: the **Merge** action in the suggestions queue (near-duplicate signal feeds it), plus
a direct "Merge into…" flow in the Families/company management UI for pairs the detector misses.
The confirm dialog is diff-style: shows both rows' counts and exactly what will move. Not undoable
— the dialog says so.

---

## 10. Complications & edge cases (decisions pre-made where possible)

| # | Issue | Resolution |
|---|---|---|
| 1 | Company in two families (JV) | Not supported v1 (PK enforces one group). `notes` documents it; relaxing later is additive. |
| 2 | Moving a company between groups | Explicit remove-then-add. Add endpoint returns `already-grouped` conflict — no silent steal. |
| 3 | Group shrinks to 0/1 companies | 1 is allowed (awaiting siblings). 0 via company deletion cascade is possible but companies are never deleted today; the admin Families list surfaces empties. |
| 4 | Primary company removed from group / deleted / merged away | FK `set null` + endpoint nulls pointer on member-removal; hard merge retargets it to the winner. Group keeps functioning (Scenario 2 shape). |
| 5 | Rollup double-counting | §6.2 rules: exclude both-sides-in-group transactions; distinct-property semantics; surface `internalTransferCount`. |
| 6 | User members in two different families | Fine by construction — reach is a set union; dashboard shows multiple family sections. |
| 7 | Claim on a grouped company when a sibling already has members | Family badge/context in claims review (§7.3); approval flow unchanged. Whether cross-LLC claims should auto-escalate to `dispute` type — flagged in §13. |
| 8 | Group name collides with a company name | Allowed (Scenario 1's group is naturally named like its parent row). Group names unique only among groups. |
| 9 | Hard-merging two companies that are BOTH grouped (different groups) | Merge aborts; admin resolves the family assignment first, then re-runs. Same group → fine, loser's link row is just deleted. |
| 10 | Merge chosen when group was right (or vice versa) | Group is fully reversible (remove/dissolve). Merge is not (destructive) — hence diff-style confirm + queue keeps `resolution` for audit. When unsure, admins should group first; a grouped pair can be merged later, a merged pair can't be split. **Rule of thumb in the UI copy.** |
| 11 | `is_primary`/`role` on `company_members` | Untouched-but-unused today; this design doesn't need them. If a "team admin" concept arrives later it slots into `role` without schema change. |
| 12 | Reach-based access leaking | Reach only powers *member-facing* dashboard/notifications; it never grants admin powers over sibling companies. All group/merge mutations stay ADMIN_ROLES. |
| 13 | Enrichment coverage gaps (SD-only, budget-capped) | Suggestion engine degrades gracefully — Tier-1 signals are DB-wide; Tier-2 improves as enrichment expands. |
| 14 | `getLeaderboard` is name-string based | Cannot participate in grouping without an id-based rework; out of scope, documented as debt (§6.4). Hard merges partially heal it for duplicates. |
| 15 | Docs & agents | Schema + routes changes trigger `database.md`, `api.md`, `access-control.md`, `apps.md` (Data section) updates; the Agent Updater hook will enforce. |

---

## 11. Build phases

**Phase 1 — Grouping core + centralized admin tab**
1. Schema: `company_groups`, `company_group_companies` (+ `group_source` enum); inserts/updates/
   validation; `db:push`.
2. New `server/services/groups/` + controllers + `company-groups.routes.ts` (§7.1 core table);
   mount in `server/routes/index.ts`.
3. `getCompanyById` + `getUserMemberships` responses gain `group`.
4. Admin UI: **Company Merging tab** in `Admin.tsx` — Families section (list/create/edit/add/
   remove/dissolve + derived family roster). Claims-tab family badge.
5. Public family chip + sibling list on the directory's expanded company card (the only `/data`
   change).
6. Ceremony: api.md / access-control.md / database.md / apps.md updates; baseline integration
   tests (`/test-route`); `npm run check`.

**Phase 2 — Discovery + duplicate merge** (pulled forward; makes the feature usable at
thousands-of-companies scale)
1. `company_merge_suggestions` + `company_aliases` schema.
2. Tier-1 detector job (near-duplicate names, name patterns, intra-transfers) + pipeline hook for
   newly-inserted companies; suggestion routes.
3. Suggestions section in the Company Merging tab (Group / Merge / Dismiss).
4. Hard-merge service + `POST /api/companies/:id/merge-duplicate` + pipeline alias lookup in
   `insert-companies.ts` / `resolve-ids.ts` + diff-style confirm UI.

**Phase 3 — Rollups + member dashboard** (independent of Phase 2 — the two can swap or interleave;
sequence at build time)
1. `getGroupById` rollup (inArray aggregates, intra-transfer exclusion, per-LLC breakdown, group
   ratio) on `GET /api/company-groups/:id`.
2. `getUserCompanyReach` service; **`/portfolio` dashboard page** (requireAuth + reach-gated):
   rollup tiles, per-LLC table, 90-day family chart, map hand-off.
3. Family-grouped `MyCompaniesTab`.
4. Audit membership consumers per §5 (code-violations recipients → reach).

**Later / backlog (explicitly out of scope for this project):** Tier-2 suggestion signals as
enrichment expands · `?companyGroup=` family-wide property/map filter on `/data` · directory
"group by family" rollup toggle · id-based leaderboard rework · claims auto-dispute across
families · relaxing one-group-per-company if a real JV case appears.

Phase 1 is independently valuable (associations become visible and queryable immediately);
Phases 2 and 3 each ship alone.

---

## 12. Rejected alternatives (and why)

- **`is_parent` boolean on `companies` + link table** (Neil's floated alternative — discussed and
  decided 2026-07-06): the link table is needed either way; the only difference is whether the
  parent is a `companies` row or a `company_groups` row. Genuine upside: one mental model — the
  parent would be clickable/claimable/enrichable like any company. Rejected because Scenario 2
  forces fabricating synthetic company rows, which then (a) must be filtered out of every
  directory count-sort, (b) occupy unique names the pipeline matches against, and (c) still don't
  prevent near-name duplicates when the real parent eventually transacts under a variant spelling.
  The group table gets the same UX (the UI can label groups "Parent Company") with none of the
  filtering burden.
- **`parent_company_id` self-FK on `companies`** — same synthetic-row problem, plus conflates
  "entity that appears on deeds" with "grouping concept."
- **Materialized membership fan-out** (a `company_members` row per user per family company) — the
  10-rows problem the brief worries about, plus a permanent reconciliation burden on every
  group/ungroup/move. Derived reach makes the entire script class unnecessary.
- **Group-level membership table** (`user_id, group_id`) — loses the real-world fact of *which* LLC
  a user belongs to, breaks the existing claim flow's granularity, and creates dual sources of
  membership truth that can disagree.
- **Hard-merging family LLCs into one row** — ruled out in the brief (transactions must keep the
  true recorded LLC); irreversible; and the pipeline would resurrect the merged names anyway
  (§9's trap, at family scale). Hard merge is reserved for true duplicates only.
- **Auto-grouping/auto-merging from signals without review** — a false family link leaks dashboard
  reach across unrelated organizations; a false merge corrupts attribution irreversibly. Human
  confirmation is the safety gate (§8).

---

## 13. Remaining open questions (none block Phase 1; defaults noted)

Resolved 2026-07-06: data model (§ header #1) · admin UX centralization (#2) · public visibility
(#3) · `/data` v1 behavior (#4) · suggestions priority (#5) · dashboard scope (#6) · duplicate
class + hard-merge requirement (#7).

1. **Directory rollup toggle** (§6.4): should families eventually collapse into one ranked row in
   the directory sorts? *Backlog either way; opinion shapes whether rollup counts get denormalized.*
2. **Claims across a family** (§10.7): if user A is a member of SD REV and user B requests to join
   CO REV (same family), normal claim or dispute-style review? *Default: normal claim + family
   context badge for the reviewing admin.*
3. **Phase 2 vs Phase 3 ordering**: discovery+merge and rollups+dashboard are independent — which
   ships first? *Default: Phase 2 (discovery) first, since clean/linked data makes the dashboard
   numbers right on arrival.*
4. **Suggestion detector cadence**: nightly full scan vs per-sync incremental only. *Default:
   both — incremental hook for new companies + weekly full re-scan.*
5. **Group naming**: purely cosmetic display name until a real parent row appears (default), or do
   you also want to record a "legal parent name to watch for" so the pipeline hook can flag when
   that exact name first appears on a deed? *Cheap to add to the detector if wanted.*
