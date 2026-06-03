# Feature Design: Company Claiming

**Application:** SFR Property Intelligence Platform
**Tech Stack:** React 18 + Vite + Wouter + TanStack Query / Express + Passport + Drizzle ORM / PostgreSQL (Neon) / Replit Deployment
**Current Users:** ~150 | Target: 1K–5K | Max Design Ceiling: 10K
**Date:** June 3, 2026

---

## Table of Contents

1. [The Core Problem](#the-core-problem)
2. [Approach A: Manual Admin Approval (Simplest) ← Selected](#approach-a-manual-admin-approval-simplest--selected)
3. [Approach B: Semi-Automated with Domain Verification](#approach-b-semi-automated-with-domain-verification)
4. [Approach C: Hybrid — Automated Fast-Track + Manual Fallback](#approach-c-hybrid-automated-fast-track--manual-fallback)
5. [User–Company Link Options](#usерcompany-link-options)
6. [Contact Display vs. Membership: Keeping Them Separate](#contact-display-vs-membership-keeping-them-separate)
7. [Database Schema](#database-schema)
8. [API Design](#api-design)
9. [Frontend Components](#frontend-components)
10. [Phased Implementation Plan](#phased-implementation-plan)

---

## The Core Problem

The data pipeline ingests property transactions nightly from the SFR API. Each transaction includes buyer/seller company names, which get upserted into the `companies` table. Users who sign up for the platform have no way to indicate that a given company is theirs.

Linking users to companies unlocks:
- Showing users their company's transaction portfolio.
- Letting them see their market ranking and acquisition activity.
- Eventually: managing company contact info, receiving company-level notifications, and enabling employee/team membership.

Tricky parts:
1. **Verification** — How do we confirm someone actually runs the company they're claiming?
2. **Speed vs. security** — Fast onboarding, but can't let anyone claim a competitor's company.
3. **Multiple users per company** — Real companies have multiple stakeholders; the data model must support this from the start.
4. **Contact display vs. membership** — The `company_contacts` table drives public profile display (pipeline-ingested principals, officers, etc.). A claimed user is not automatically that display contact. These two concerns must stay cleanly separated.

---

## Approach A: Manual Admin Approval (Simplest) ← Selected

**Target:** Fastest to ship | **Verification:** Human reviews every claim | **Time to build:** Phase 1 in days

### How It Works

1. **User clicks "Claim" on a company** in the Company Directory expanded panel. The button only appears when the user is authenticated.
2. A minimal modal confirms: "Submit a claim for Acme Capital LLC?" — one click, no extra form fields in Phase 1.
3. The claim is recorded in the `company_claims` table with `status: 'pending'`.
4. An admin (owner, admin, or relationship-manager) sees the claim in a new "Claims" tab in the Admin Panel.
5. The admin approves or rejects with a confirmation dialog. On approval, a row is inserted into `company_members` linking the user to the company.
6. The user sees their claimed company in their Profile page.

If a company already has an approved member, new users see a **"Dispute"** button instead of "Claim." The dispute is mechanically identical — it just creates another `company_claims` row. The admin then decides whether the dispute is legitimate.

### Why This Is Enough for Phase 1

At ~150 users, even if every single one submits a claim in the same week, that's 150 claims. At 2 minutes per review, that's 5 hours total. In practice it will trickle in at a much lower rate. Manual review also handles every edge case that automation cannot — a human recognizes "Acme Capital LLC" and "ACME CAPITAL" as the same company, and can investigate conflicting claims.

### Pros
- Ships fast.
- Handles every edge case (humans are better than code at ambiguity at this scale).
- Zero false approvals.

### Cons
- Doesn't scale past ~50 claims/day without becoming a burden.
- Users must wait for approval.
- Relies on admin availability.

---

## Approach B: Semi-Automated with Domain Verification

**Target:** Reduce admin burden | **Verification:** Email domain matching + admin fallback | **Time to build:** 1–2 weeks beyond Phase 1

Builds on Approach A by adding a fast-track path: if the user's email domain matches a known domain on the company record, the claim is auto-approved. Ambiguous cases still go to the manual queue.

**Domain verification logic:**
- Extract domain from the user's signup email (or a provided work email).
- Extract domain from the company's known `contact_email` (if enriched via OpenCorporates or Apollo).
- If they match → auto-approve and insert into `company_members` immediately.
- If not → queue for manual review with a "Domain match not available" indicator in the admin queue.

### Pros
- Auto-approves ~60–70% of claims from corporate email users.
- Admin only touches genuinely ambiguous cases.
- Database schema is identical to Approach A — just add server-side auto-approval logic.

### Cons
- Doesn't work for companies without a web presence or owners using Gmail/personal email (common in SFR).
- Requires maintaining domain-extraction logic.

---

## Approach C: Hybrid — Automated Fast-Track + Manual Fallback

**Target:** Fastest user experience with strong confidence | **Verification:** Multi-signal scoring | **Time to build:** 3–4 weeks beyond Approach B

Extends Approach B with a confidence scoring engine that weighs multiple signals. Scores above a threshold auto-approve; scores in a middle band go to manual review; scores below a floor are auto-flagged.

**Verification signals:**

| Signal | Confidence Points | Notes |
|---|---|---|
| Work email domain matches company domain | +40 | Strongest automated signal |
| Verification email link clicked | +25 | Confirms inbox access |
| User's name matches a `company_contacts` name | +15 | Uses existing contact data |
| First claim for this company | +10 | First claimant more likely legitimate |
| No active members yet | +5 | No conflict to resolve |
| LinkedIn URL provided | +5 | Admin can verify quickly |

**Thresholds:** ≥65 → auto-approve; 30–64 → manual queue; <30 → flagged hold.

### Pros
- Many users verified instantly.
- Transparent and auditable scoring.
- Once implemented, the invitation flow (owner invites employees) eliminates most future claims.

### Cons
- Significant build time.
- Scoring weights need tuning on real data.
- More complex admin UI.

---

## User–Company Link Options

Three options were evaluated for how to permanently record that a user is associated with a company after a claim is approved.

### Option 1: Direct FK on `companies` Table

Add `claimed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL` directly to the `companies` row.

**Pros:** Zero extra tables. Extremely simple queries.
**Cons:** Hard limit of one user per company. The moment two co-founders both want to claim the same company, the schema breaks and requires a migration. Not viable long-term.

### Option 2: Reuse `companyContacts.userId` (Existing Column)

The `company_contacts` table already has a `userId` FK column (`userId uuid REFERENCES users(id) ON DELETE SET NULL`). On claim approval, create or update a `company_contacts` row with the user's `userId` set.

**Pros:** No new tables. Uses the column that already exists.
**Cons:** Muddies a display/contact table with an access-control concern. Could collide with pipeline-ingested contact data. Query direction ("which companies does user X have access to?") goes against the table's primary purpose. Breaks the clean separation between who is publicly displayed as a contact vs. who has claimed ownership.

### Option 3: Slim `company_members` Join Table ← Recommended

A new `company_members` join table: `(user_id, company_id, role, is_primary, created_at)`.

**Pros:**
- Supports multiple users per company from day 1 — no future migration needed.
- Clean separation: `company_contacts` = public display roster; `company_members` = access/ownership roster.
- Role-aware from the start (even if Phase 1 only ever uses `'owner'`).
- Trivial to query in both directions (`WHERE user_id = ?` and `WHERE company_id = ?`).

**Cons:** One extra table. Negligible in practice.

**This is the selected approach.** Even in Phase 1 it's likely that two employees of the same company will both submit claims, and both should be approvable. Option 1 breaks immediately; Option 2 introduces design debt that compounds over time.

---

## Contact Display vs. Membership: Keeping Them Separate

This is a non-obvious design decision worth documenting explicitly.

The `company_contacts` table is a **public display roster** — it holds contacts sourced from the data pipeline (OpenCorporates officers, SFR API data) and curated by admins. The `sort_order` field controls who appears as the "Principal" in the Company Directory card. This data is shown to all users.

The `company_members` table (new) is an **access/ownership roster** — it records which platform users have claimed a given company. This data drives profile pages, future notification routing, and permission checks.

**A user claiming a company does not automatically make them the primary display contact.** Here's why:
- The existing primary contact may be a pipeline-sourced officer with better data.
- Forcing the claiming user to `sort_order: 1` could stomp accurate historical data.
- The claiming user may be an employee, not the principal.

**The `companyContacts.userId` column (which already exists) is the bridge for Phase 3.** When an admin wants to formally link a user's membership to their contact record (so the contact card shows their profile picture, links to their account, etc.), they can set `company_contacts.user_id = user.id` on the appropriate contact row. This is an optional Phase 3 admin action, not an automatic Phase 1 behavior.

**Summary:**
- `company_contacts` → who appears publicly on the company profile card.
- `company_members` → who has platform ownership/access to the company.
- These overlap eventually, but start decoupled for safety.

---

## Database Schema

### New Tables

```
company_claims                              ← Phase 1
├── id (uuid, PK, default random)
├── user_id (uuid, NOT NULL, FK → users.id, CASCADE)
├── company_id (uuid, NOT NULL, FK → companies.id, CASCADE)
├── status (text, NOT NULL, default 'pending')  ← 'pending' | 'approved' | 'rejected'
├── admin_notes (text, nullable)            ← Phase 2: rejection reason for email notification
├── reviewed_by (uuid, nullable, FK → users.id, SET NULL)
├── reviewed_at (timestamp, nullable)
├── created_at (timestamp, NOT NULL, defaultNow)
└── updated_at (timestamp, defaultNow)

-- Indexes:
-- (user_id, status) — "what are my pending/approved claims?"
-- (company_id, status) — "does this company have a pending claim?"
-- (status, created_at DESC) — admin queue sorted oldest-first

company_members                             ← Phase 1 (populated on claim approval)
├── user_id (uuid, NOT NULL, FK → users.id, CASCADE)
├── company_id (uuid, NOT NULL, FK → companies.id, CASCADE)
├── role (text, NOT NULL, default 'owner')  ← 'owner' | 'member' (Phase 3 expands this)
├── is_primary (boolean, NOT NULL, default true)  ← first approved member = primary
├── created_at (timestamp, NOT NULL, defaultNow)
└── PRIMARY KEY (user_id, company_id)

-- Indexes:
-- (user_id) — "which companies am I a member of?" (Profile page)
-- (company_id) — "who are the members of this company?" (Admin view)
```

### No Changes to Existing Tables in Phase 1

The `companies` table does not need a `claimed_by_user_id` column. The `company_members` table handles this via join. The `company_contacts` table is untouched.

---

## API Design

All new endpoints follow the existing route → controller → service pattern established in the codebase.

### Phase 1 Endpoints

```
POST   /api/companies/:id/claim
  Auth: requireAuth (any authenticated user)
  Body: none
  Creates a company_claims row with status 'pending'.
  Returns 409 if the user already has a pending or approved claim for this company.
  Returns 201 { message, claimId } on success.

GET    /api/claims
  Auth: requireRole(['admin', 'owner', 'relationship-manager'])
  Query: ?status=pending|approved|rejected (default: pending)
  Returns paginated list of claims with user info and company name.

PATCH  /api/claims/:id
  Auth: requireRole(['admin', 'owner', 'relationship-manager'])
  Body: { action: 'approve' | 'reject', adminNotes?: string }
  On approve: inserts into company_members, updates claim status.
  On reject: updates claim status and stores admin_notes.
  Returns 200 { message, claim }.

GET    /api/companies/:id/members
  Auth: requireAuth
  Returns the list of approved members for a given company.
  Used by the Profile page and the company expanded panel.

GET    /api/users/me/company-memberships
  Auth: requireAuth (session user, checked in handler)
  Returns all approved company_members rows for the current user, with company info.
  Used by the Profile page.
```

### Phase 2 Additions (Postmark notifications)

No new endpoints — Phase 2 adds side effects (Postmark email calls) to the existing `PATCH /api/claims/:id` handler on approve and reject.

---

## Frontend Components

### New Components (Data app, `client/src/components/data/`)

```
ClaimCompanyDialog.tsx
  Props: companyId, companyName, isClaimed (boolean), onSuccess
  When isClaimed = false → shows "Claim this company" UI.
  When isClaimed = true → shows "Dispute this claim" UI.
  Phase 1: confirmation only (no form fields).
  Phase 2: adds role/title and work email fields.
  Shared confirmation modal via existing AppDialog. Toast on submit.

CompanyClaimsTab.tsx  (Admin panel tab component)
  Fetches GET /api/claims?status=pending.
  Lists pending claims with user name, company name, submission date.
  Approve/Reject buttons → trigger AppDialog confirmation → PATCH /api/claims/:id.
  Toast on success. Optimistic update or refetch on response.
```

### Modifications to Existing Components

```
CompanyDirectory.tsx
  Expanded panel: add "Claim" or "Dispute" button (authenticated users only).
  Clicking opens ClaimCompanyDialog.
  Show a "Claimed" badge if the company has an approved member.

Profile.tsx
  New section: "My Companies" — fetches GET /api/users/me/company-memberships.
  Shows each linked company name, role, and a link to view the company in the directory.
  Empty state: "You haven't claimed any companies yet."

Admin.tsx + AdminPanel tabs
  Add "Claims" tab (visible to admin, owner, and relationship-manager).
  Renders CompanyClaimsTab.
```

### UX Rules
- The "Claim" button is only shown to authenticated users. Unauthenticated users see nothing (or a tooltip after clicking elsewhere).
- All admin approve/reject actions must go through a confirmation dialog before firing the API call.
- All claim submissions, approvals, and rejections produce a toast notification.
- The Claims tab badge/count shows the number of pending claims.

---

## Phased Implementation Plan

### Phase 1: Core Claiming Flow

**Goal:** Users can claim companies. Admins can approve or reject. Profile shows linked companies.

**Database:**
- Create `company_claims` table via Drizzle migration.
- Create `company_members` table via Drizzle migration.

**Backend:**
- `POST /api/companies/:id/claim` — submit a claim.
- `GET /api/claims` — admin list of claims.
- `PATCH /api/claims/:id` — approve or reject.
- `GET /api/users/me/company-memberships` — user's approved companies.
- `GET /api/companies/:id/members` — members for a given company.
- Drizzle schema updates, Zod insert/update schemas.

**Frontend:**
- `ClaimCompanyDialog.tsx` (Phase 1: confirmation only).
- `CompanyClaimsTab.tsx` (approve/reject with confirmation modal + toast).
- `CompanyDirectory.tsx` — Claim/Dispute button in expanded panel.
- `Profile.tsx` — "My Companies" section.
- `Admin.tsx` — Claims tab (admin/owner/rm only).

**Phase 1 complete when:** Any authenticated user can submit a claim. Admins can approve or reject from the admin panel. Approved companies appear on the user's profile. `npm run check` passes.

---

### Phase 2: Postmark Email Notifications

**Goal:** Users are notified when their claim is approved or rejected. Rejection includes a message so users know what to do next.

**Database:**
- No schema changes. `company_claims.admin_notes` is already nullable and ready.

**Backend:**
- Add Postmark side-effects to `PATCH /api/claims/:id`:
  - On approve: send "Your claim for [Company] has been approved."
  - On reject: send "Your claim for [Company] was not approved. Notes: [admin_notes]. Feel free to resubmit with more information."

**Frontend:**
- `ClaimCompanyDialog.tsx` — add role/title and work email fields (optional, helps admin during review).
- `CompanyClaimsTab.tsx` — admin can enter a rejection note in the confirmation dialog.

**Phase 2 complete when:** Both approve and reject send emails via Postmark. Rejection emails include admin notes. `npm run check` passes.

---

### Phase 3: Disputes, Multi-User, and Contact Linkage

**Goal:** Multiple users per company. Disputes for already-claimed companies. Optional linking of a member to their `company_contacts` record.

**Dispute flow:**
- If `company_members` has an approved row for a company, the "Claim" button becomes "Dispute."
- Disputes are mechanically identical to claims — same `company_claims` table, same admin queue.
- Admin resolves disputes by reviewing both parties' information. Both can end up approved (multi-member), or one is rejected.

**Multi-user changes:**
- The `company_members` table already supports this via its schema. No migrations needed.
- Admin approve flow: if a company already has members, approving a new claim adds them as an additional member (role: 'member' unless the admin promotes to 'owner').
- Future: existing company owners can invite employees directly (bypassing the claims process).

**Contact linkage (optional admin action):**
- Admin can link a `company_members` row to a `company_contacts` row by setting `company_contacts.user_id`.
- This connects the user's account to their public contact record (profile photo, account link).
- NOT automatic on claim approval. Purely an admin action.

**Anti-abuse (basic):**
- Limit: 3 pending claims per user at any time (enforced server-side).
- 1 pending claim per (user, company) pair (enforced by unique constraint or service check).

**Phase 3 complete when:** Disputes work. Multiple users can be members of one company. Admin can link a member to a contact record. Basic claim-rate limiting is in place.

---

### Phase 4: Advanced (Future)

- Invitation system: verified company owners can invite employees by email. Invited users skip the claims queue.
- Confidence scoring (Approach B → C): domain-based auto-approval, email verification links.
- Company reconciliation: user-created companies matched against pipeline-ingested companies when the pipeline later picks them up.
- Role management within a company: owner can promote members, transfer primary ownership.
