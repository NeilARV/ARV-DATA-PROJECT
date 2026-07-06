# Company Merging (Company Groups) — Design & Build Plan

> **Status:** Plan / pre-build. No code written yet. Design-phase output only — this document is the
> deliverable; open questions for Neil are collected in **§13** at the end.
>
> **The one framing decision this whole document rests on (read this first):** what we need is
> **NOT a hard merge** of company rows. Transactions must stay attributed to the exact LLC that
> recorded the deed (SD REV's sales stay SD REV's). What we need is a **grouping layer on top of
> the existing `companies` table** — a first-class "company family" entity that says *these N
> company rows are the same organization*. Everything else (member reach, rollup stats, dashboards,
> handling the missing-parent case) falls out of that. A true hard merge exists in this plan only
> as a separate, narrower tool for **byte-level duplicate rows of the same LLC** (§9), which is a
> different problem with a different mechanism.

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
requires touching user rows. On top of that we build rollup stats (per-LLC + family-wide, with
intra-family transfers excluded), a member dashboard, and an admin suggestion queue that flags
probable siblings as the pipeline discovers new LLCs.

---

## 2. Current state (what the codebase does today)

Verified by direct code review — file references are load-bearing for the build phase.

### 2.1 Company identity is an exact raw-name string

- The pipeline consumer creates companies from raw SFR buyer/seller names
  (`server/jobs/data_v2/processes/clean-transactions.ts:44-68`), gated by `isFlippingCompany`
  (`server/utils/dataSyncHelpers.ts:97-131`).
- Matching is **exact trimmed string** — `trimCompanyName` (`server/utils/normalization.ts:113-117`)
  does whitespace trim only, no case folding, no punctuation normalization. Its doc comment states
  names are stored exactly as SFR returns them.
- Dedup guarantee is only the DB unique constraint on `companies.company`
  (`database/schemas/companies.schema.ts:29`) + `onConflictDoNothing`
  (`server/jobs/data_v2/processes/insert-companies.ts:143-147`).
- Consequence: `"ABC HOMES LLC"` vs `"Abc Homes Llc"` are two rows today, and any LLC family is N
  unrelated rows. Companies are **insert-only** — no cleanup, archival, or merge logic exists
  anywhere.

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
  are exactly the signals a sibling-suggestion engine wants (§8).

### 2.3 What this means for the feature

Because every aggregation except the leaderboard already keys on `buyer_id`/`seller_id`/`assignor_id`
UUIDs, **group rollups are cheap**: the same queries with `inArray(companyIds)` instead of
`eq(companyId)`. Nothing about transaction attribution needs to change. The gaps are purely:
(1) no entity that says "these companies belong together," (2) no derived member reach, (3) no
rollup endpoints/UI, (4) no way to notice new siblings arriving via the nightly sync.

---

## 3. The two scenarios, solved by one shape

| | Scenario 1 — parent exists in DB | Scenario 2 — parent never transacts |
|---|---|---|
| Example | VERTIGO REV bought a property once; SD REV / CO REV are its LLCs | Only SD REV / CO REV / MIAMI REV ever appear on deeds |
| Group row | `company_groups { name: "Vertigo Rev", primary_company_id: <VERTIGO REV's uuid> }` | `company_groups { name: "Vertigo Rev", primary_company_id: NULL }` |
| Members | VERTIGO REV, SD REV, CO REV all linked as group companies | SD REV, CO REV, MIAMI REV linked |
| If the parent shows up later | — | Pipeline creates the VERTIGO REV company row; admin links it into the group and (optionally) sets it primary |

**Decision: never create a synthetic `companies` row for a missing parent.** A fake row would
(a) appear in the public directory with zero transactions, (b) occupy the unique `company` name so
a *real* future deed under that name would silently attach to our fabricated entity, (c) confuse
the pipeline's exact-name matching, and (d) skew count-based sorts. The group **is** the parent
entity; its `name` column is the brand. `primary_company_id` is a nullable pointer for when a real
parent row exists — display candy and a stats anchor, nothing more.

This also answers "existing company vs. create a parent": you never choose. You always create a
*group*; you sometimes additionally mark one member as primary.

---

## 4. Data model

Two new tables in `database/schemas/companies.schema.ts` (Phase 1), one more each for Phases 3 & 4.

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

### 4.3 `company_group_suggestions` — Phase 3 (admin review queue)

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) — the candidate |
| `target_group_id` | `uuid` | nullable, FK → `company_groups.id` (cascade) — "belongs in this existing family" |
| `target_company_id` | `uuid` | nullable, FK → `companies.id` (cascade) — "related to this ungrouped company" (pairwise) |
| `signal` | `text` | NOT NULL — machine-readable reason (`shared-agent`, `name-pattern`, `oc-grouping`, `shared-contact`, `intra-transfer`) |
| `detail` | `text` | nullable — human-readable evidence ("registered agent 'JANE DOE' shared with CO REV") |
| `status` | enum `'pending' \| 'accepted' \| 'dismissed'` | NOT NULL, default `pending` |
| `reviewed_by` / `reviewed_at` | uuid / timestamp | nullable |
| `created_at` | `timestamp` | NOT NULL |

Partial unique index on `(company_id, coalesce(target_group_id, target_company_id), signal)` WHERE
`status = 'pending'` so re-runs of the detector don't spam duplicates.

### 4.4 `company_aliases` — Phase 4 (true-duplicate hard merge; see §9)

| Column | Type | Constraints |
|---|---|---|
| `alias_name` | `text` | **PK** — the raw SFR string variant (`Abc Homes Llc`) |
| `company_id` | `uuid` | NOT NULL, FK → `companies.id` (cascade) — the canonical row |
| `created_by` / `created_at` | | standard |

### 4.5 What deliberately does NOT change

- `companies` — no new columns.
- `company_members` — untouched. Users remain members of the **specific LLC** (§5).
- `company_claims` — untouched; claims stay per-company.
- `property_transactions` — untouched; attribution stays with the deeded LLC forever.

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
- *New team member joins the family* → admin adds them to **one** company (ideally the primary, but
  any group company works — reach is identical). One row, not ten.
- *No reconciliation script class exists at all.* The brief's worry — "when we merge, we might have
  to run something to check are there users associated with these companies" — dissolves: merging
  companies into a group never mutates membership; it only changes what the derived query returns.

**Costs, acknowledged:** every access check that today asks "is user a member of company X?" must
become "is company X within the user's reach?" (one extra join); and "who can act for SD REV?"
returns family members who never explicitly joined SD REV — which is exactly the desired behavior,
but consumers must be audited. Known consumers to update when member-facing features land (Phase 2+):
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
   (reuse of the per-company aggregate, grouped by `buyer_id` in one query rather than N calls).

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

### 6.4 Directory & leaderboard (product decisions, deferred to v2 — see §13)

- **Directory sorts** stay per-LLC in Phase 1–2. A family with volume split across 10 LLCs ranks
  low on every card — arguably wrong for the "top buyers" story. A "group by family" toggle
  (families collapse into one row using rollup counts, ungrouped companies unchanged) is designed
  but deferred; it touches `getContacts`'s in-memory sort path significantly.
- **`getLeaderboard`** aggregates raw name strings, not FKs — it cannot see groups (or even today's
  FK links) without a rework to id-based tallies. Flagged as tech debt this feature makes visible;
  not in scope.

---

## 7. API & UI surface

Access control per `.claude/docs/access-control.md` conventions: writes = `requireRole(ADMIN_ROLES)`;
group *association* on public company payloads is public (directory data already is); member
dashboard = `requireAuth` + reach check in the service. New routes follow the full `/new-route`
ceremony (routes + controllers + services + validation schemas in `database/validation/` + api.md +
access-control.md + baseline integration tests).

### 7.1 New routes — `/api/company-groups` (new domain: routes/controllers/services trio)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/company-groups` | ADMIN_ROLES | Create group `{ name, companyIds[], primaryCompanyId? }` — validates companies exist & are ungrouped; primary must be in `companyIds` |
| GET | `/api/company-groups` | ADMIN_ROLES | Paginated list w/ search, member counts (admin management surface) |
| GET | `/api/company-groups/:id` | Public | Group + members + rollup stats + per-LLC breakdown (§6) |
| PATCH | `/api/company-groups/:id` | ADMIN_ROLES | `{ name?, primaryCompanyId?, notes? }` |
| DELETE | `/api/company-groups/:id` | ADMIN_ROLES | Ungroup entirely (membership rows cascade; company rows untouched) |
| POST | `/api/company-groups/:id/companies` | ADMIN_ROLES | Add companies `{ companyIds[] }` — 409-style `already-grouped` result if any belongs to another group (explicit move required, no silent steal) |
| DELETE | `/api/company-groups/:id/companies/:companyId` | ADMIN_ROLES | Remove one company; if it was `primary_company_id`, null the pointer; groups may drop to 1 member (kept — admin deletes explicitly) |

Phase 3 adds `GET/PATCH /api/company-group-suggestions` (PRIVILEGED_ROLES review, ADMIN accept —
mirroring the claims queue's role split).

### 7.2 Changes to existing endpoints

- `GET /api/companies/:id` — response gains
  `group: { id, name, primaryCompanyId, companies: [{ id, companyName }] } | null`. One join +
  one indexed lookup; every company detail consumer can now show "part of Vertigo Rev (4 companies)."
- `GET /api/users/me/company-memberships` — each row gains the same `group` object (drives the
  upgraded My Companies tab and dashboard entry points).
- All rendered company/group names pass through `formatCompanyName` per **ARV.RAW-COMPANY-NAME**
  (group `name` is stored display-ready since it's admin-typed, not SFR-sourced — noted in §13).

### 7.3 UI

**Admin (Phase 1):**
- `CompanyDirectory.tsx` expanded card, admin actions row: **"Manage Group"** → dialog to create a
  group seeded with this company / add it to an existing group (typeahead over groups) / remove it.
- New **"Groups"** tab in `Admin.tsx` (ADMIN_ROLES): list groups, create, edit name/primary/notes,
  add/remove companies (company typeahead reuses `GET /api/companies/contacts/suggestions`), and a
  derived **family roster** — all users who are members of any company in the group (read-only;
  answers "who's on the Vertigo team?" without any new membership table).
- `CompanyClaimsTab.tsx`: claim rows for a grouped company show a badge ("VERTIGO REV family — 2
  existing members across group") so admins catch cross-LLC disputes.

**All users (Phase 1–2):**
- Expanded company card: **"Part of {group name}"** chip + sibling list; clicking a sibling runs the
  existing `handleCompanyClick` for that company.
- `MyCompaniesTab.tsx`: memberships grouped under their family header with sibling companies listed.

**Member dashboard (Phase 2)** — the brief's end-goal ("a dashboard where they see the individual
companies, how everything's doing as a whole"):
- New authenticated page (e.g. `/portfolio`), gated by `requireAuth` + non-empty reach:
  family rollup tiles (properties owned, sold YTD, assigned, purchase-to-ARV ratio, internal
  transfers), per-LLC breakdown table, 90-day acquisition chart at family level, and a "view on
  map" hand-off into `/data` (v2+: `?companyGroup=` filter on `GET /api/properties` /
  `GET /api/properties/map` — an `inArray` extension of the existing company filter branch in
  `properties.services.ts`).
- Design per `.claude/docs/design-guidelines.md`; chart via existing Recharts patterns from
  `CompanyDirectory.tsx:790-898`.

---

## 8. Where associations come from (the "how do we get that association?" question)

Three sources, phased. **Nothing ever auto-groups — a human confirms every link.** False merges are
worse than missed ones: they leak one family's dashboard reach to another family's members.

1. **Manual (Phase 1, the backbone).** Admin recognizes the family (market knowledge, deed patterns)
   and builds the group in the UI. This is how VERTIGO REV / SD REV / CO REV gets seeded day one.
2. **Assisted suggestions (Phase 3).** A detector job (cron, alongside existing jobs in
   `server/jobs/index.ts`) writes `company_group_suggestions` from signals **we already store**:
   - **Shared registered agent** — `company_details.agent_name` / `agent_address` equality across
     companies (strongest single signal; LLC families overwhelmingly share an agent).
   - **OpenCorporates relationship metadata** — `corporate_groupings`, `controlling_entity`,
     `ultimate_controlling_company`, `home_company`, `alternative_names` (stored since enrichment
     was built at `companies.services.ts:1049-1066`, used by nothing — pure upside).
   - **Shared officers** — same `first_name + last_name` across different companies'
     `company_contacts`.
   - **Shared company addresses** — `company_addresses` postal/street equality.
   - **Name patterns** — token overlap after stripping entity-type suffixes (`SD REV LLC` /
     `CO REV LLC` share `REV`); high-recall/low-precision, so it needs corroboration or low rank.
   - **Intra-transfer detection** — a transaction between two companies is itself a
     relatedness signal (§6.2's exclusion logic, inverted into discovery).
   Suggestions land in an admin queue tab (pattern-copy of `CompanyClaimsTab`); accept = create the
   link with `source: 'suggestion'`; dismiss = suppressed from re-suggesting (the partial unique
   index in §4.3 plus dismissed status).
   Caveat: enrichment currently runs for the San Diego MSA only, 500/month budget
   (`server/jobs/enrich-companies.ts:14-16`) — agent/officer signals are only as broad as
   enrichment coverage. Name-pattern and intra-transfer signals work everywhere immediately.
3. **Pipeline hook for new arrivals (Phase 3).** The brief's "new ones constantly being created":
   after `insertCompanies` returns its newly-created set (`insert-companies.ts` already knows which
   rows are new), run the cheap detectors (name pattern vs existing group names/members; later,
   agent match once enriched) against just those names and enqueue suggestions. New sibling LLC
   appears on a deed Tuesday night → suggestion waiting Wednesday morning. Keeps the consumer's
   critical path untouched (fire-and-forget after Step 5, or fold into the nightly detector run —
   build-phase decision).

**Dissolved LLCs** ("old ones constantly being dissolved"): stay in their group forever — history
is the product. `company_details.dissolution_date` / `inactive` already exist; the group breakdown
badges dissolved members. No archival mechanics needed or wanted.

---

## 9. True duplicates — the hard-merge tool (separate problem, Phase 4)

Distinct from families: the **same LLC** existing as multiple rows from SFR casing/punctuation
variance (`ABC HOMES LLC` / `Abc Homes Llc`) — an artifact of exact-string identity (§2.1), not an
org structure. Grouping these would be wrong (the family UI would show "2 companies" that are one).
These want a real merge, and there's a trap:

> **The pipeline resurrects deleted duplicates.** `insert-companies.ts` matches on exact trimmed
> name; if we repoint FKs from `Abc Homes Llc` to `ABC HOMES LLC` and delete the loser row, the
> next sync batch containing the `Abc Homes Llc` spelling recreates it, and the split begins again.

Mechanism (transactional admin endpoint, e.g. `POST /api/companies/:id/merge-duplicate`):
1. Repoint `property_transactions.buyer_id/seller_id/assignor_id`, `properties.buyer_id/seller_id`
   (via `current_sales` resolution), `company_msas`, `company_counties` (both are upserts on
   composite PKs — dedupe on conflict), `company_contacts` (unique `(company_id, first, last)` —
   skip conflicts), `company_members` (PK conflict → delete loser row), `company_claims`,
   `company_details` (keep the richer of the two), `company_group_companies` (if both grouped in
   different groups → abort, human decides).
2. Insert the loser's name into **`company_aliases`** (§4.4).
3. Delete the loser row; recompute `purchaseToArvRatio` for the winner
   (`recomputeRatiosForCompanies`).
4. Pipeline change (the only sync-path change in this whole plan): `insert-companies.ts:64-69` and
   `resolve-ids.ts:48-53` build their name→company maps from `companies` **UNION `company_aliases`**
   so alias spellings resolve to the canonical row and never re-create the duplicate.

Phase 4 because it's independently shippable, riskier (destructive, touches the sync path), and the
grouping feature doesn't depend on it. Until then, admins *can* park duplicates in a group as a
stopgap — visible together, rollup roughly right — and un-park when the merge tool lands.

---

## 10. Complications & edge cases (decisions pre-made where possible)

| # | Issue | Resolution |
|---|---|---|
| 1 | Company in two families (JV) | Not supported v1 (PK enforces one group). `notes` documents it; relaxing later is additive. |
| 2 | Moving a company between groups | Explicit remove-then-add. Add endpoint returns `already-grouped` conflict — no silent steal. |
| 3 | Group shrinks to 0/1 companies | 1 is allowed (awaiting siblings — e.g. group created for a known family whose other LLCs haven't transacted yet). 0 via company deletion cascade is possible but companies are never deleted today; the admin Groups list surfaces empties. |
| 4 | Primary company removed from group / deleted | FK `set null` + endpoint nulls pointer on member-removal. Group keeps functioning (Scenario 2 shape). |
| 5 | Rollup double-counting | §6.2 rules: exclude both-sides-in-group transactions; distinct-property semantics; surface `internalTransferCount`. |
| 6 | User members in two different families | Fine by construction — reach is a set union; dashboard shows multiple family sections. |
| 7 | Claim on a grouped company when a sibling already has members | Surfaced as badge/context in claims review (§7.3); approval flow unchanged. Whether cross-LLC claims should auto-escalate to `dispute` type — flagged in §13. |
| 8 | Group name collides with a company name | Allowed (Scenario 1's group is naturally named like its parent row). Group names unique only among groups. |
| 9 | `is_primary`/`role` on `company_members` | Untouched-but-unused today; this design doesn't need them. If a "team admin" concept arrives later it slots into `role` without schema change. |
| 10 | Reach-based access leaking | Reach only powers *member-facing* dashboard/notifications; it never grants admin powers over sibling companies. All group mutations stay ADMIN_ROLES. |
| 11 | Enrichment coverage gaps (SD-only, budget-capped) | Suggestion engine degrades gracefully — name/transfer signals are DB-wide; agent/officer signals improve as enrichment expands. |
| 12 | `getLeaderboard` is name-string based | Cannot participate in grouping without an id-based rework; out of scope, documented as debt (§6.4). |
| 13 | Docs & agents | Schema + routes changes trigger `database.md`, `api.md`, `access-control.md`, `apps.md` (Data section) updates; the Agent Updater hook will enforce. |

---

## 11. Build phases

**Phase 1 — Grouping core (the foundation everything else stands on)**
1. Schema: `company_groups`, `company_group_companies` (+ `group_source` enum) in
   `companies.schema.ts`; inserts/updates/validation in `database/`; `db:push`.
2. New `server/services/groups/` + controllers + `company-groups.routes.ts` (routes table in §7.1,
   minus suggestions); mount in `server/routes/index.ts`.
3. `getCompanyById` + `getUserMemberships` responses gain `group`.
4. Admin UI: Groups tab in Admin panel; "Manage Group" in the directory card; group chip + siblings
   on the expanded card; claims-tab group badge.
5. Ceremony: api.md / access-control.md / database.md / apps.md updates; baseline integration tests
   (`/test-route`); `npm run check`.

**Phase 2 — Rollup stats & member dashboard**
1. `getGroupById` rollup (inArray aggregates, intra-transfer exclusion, per-LLC breakdown, group
   ratio) on `GET /api/company-groups/:id`.
2. `getUserCompanyReach` service; `/portfolio` dashboard page (requireAuth + reach-gated).
3. Upgrade `MyCompaniesTab` to family-grouped view.
4. Audit membership consumers per §5 (code-violations recipients → reach).

**Phase 3 — Discovery**
1. `company_group_suggestions` schema + detector job (signals in §8, strongest-first: shared agent
   → OC metadata → shared contacts/addresses → name pattern → intra-transfer).
2. Suggestions admin queue tab; accept/dismiss endpoints.
3. Pipeline hook: detector pass over newly-inserted companies each consumer run.

**Phase 4 — Duplicate hard-merge (independent)**
1. `company_aliases` schema; transactional merge service + admin endpoint (§9).
2. Pipeline map-build reads aliases (`insert-companies.ts`, `resolve-ids.ts`).
3. Admin UI: "Merge into…" action on the company card (admin), with a diff-style confirm.

Phase 1 is independently valuable (associations become visible and queryable immediately);
each later phase ships alone.

---

## 12. Rejected alternatives (and why)

- **`parent_company_id` self-FK on `companies`** — forces fabricating a company row when no parent
  exists (Scenario 2), conflating "entity that appears on deeds" with "grouping concept"; pollutes
  directory, name-uniqueness, and pipeline matching. The group entity avoids all of it.
- **Materialized membership fan-out** (a `company_members` row per user per family company) — the
  10-rows problem the brief worries about, plus a permanent reconciliation burden on every
  group/ungroup/move. Derived reach makes the entire script class unnecessary.
- **Group-level membership table** (`user_id, group_id`) — loses the real-world fact of *which* LLC
  a user belongs to, breaks the existing claim flow's granularity, and creates dual sources of
  membership truth (company-level AND group-level) that can disagree. One table, reach derived, is
  strictly simpler.
- **Hard-merging family LLCs into one row** — explicitly ruled out in the brief (transactions must
  keep the true recorded LLC); also irreversible, and the pipeline would resurrect the merged names
  anyway (§9's trap, at family scale).
- **Auto-grouping from signals without review** — a false family link leaks dashboard reach across
  unrelated organizations; human confirmation is the safety gate (§8).

---

## 13. Open questions for Neil (nothing blocks Phase 1; defaults noted)

1. **Visibility of family links**: should "Part of Vertigo Rev (4 companies)" show to *everyone* in
   the public directory, or only members/admins? Family structure is competitive intel — showing it
   is arguably a headline product feature, but operators being profiled may object.
   *Default in this plan: public, matching all other company data.*
2. **Directory rollup toggle** (§6.4): should families collapse into one ranked row in the
   directory sorts, and if so default-on or a toggle? *Deferred to v2 either way; opinion wanted.*
3. **Selecting a family on `/data`**: when viewing a grouped company, do you want a one-click "show
   all family properties" (map + grid filtered to the whole group)? *Planned as the v2
   `?companyGroup=` filter; confirm it's wanted.*
4. **Claims across a family** (§10.7): if user A is a member of SD REV and user B requests to join
   CO REV (same family), is that a normal claim or should it surface as a dispute-style review?
   *Default: normal claim + group-context badge for the reviewing admin.*
5. **Group naming**: admin-typed display name ("Vertigo Rev") — any need to also track a raw/legal
   parent name for matching against future SFR deeds, or is the name purely cosmetic until a real
   parent row appears? *Default: cosmetic; if the parent starts transacting, link its real row.*
6. **Dashboard scope for Phase 2**: is the `/portfolio` page (family tiles + per-LLC table + chart)
   the right v1 dashboard, or would you rather start smaller (enhanced My Companies tab only) and
   design the full dashboard as its own project? *Default: enhanced tab in Phase 2 step 3 ships
   first; page follows in the same phase.*
7. **Phase 4 priority**: how painful are casing-variant duplicate rows in practice today? If they're
   rare, the alias/hard-merge tool can slide; if common, it may deserve promotion to Phase 2.
