# Feature Design: Company Claiming

**Application:** SFR Property Intelligence Platform
**Tech Stack:** React 18 + Vite + Wouter + TanStack Query / Express + Passport + Drizzle ORM / PostgreSQL (Neon) / Replit Deployment
**Current Users:** ~150 | Target: 1K–5K | Max Design Ceiling: 10K
**Date:** June 2, 2026

---

## Table of Contents

1. [The Core Problem](#the-core-problem)
2. [Approach A: Manual Admin Approval (Simplest)](#approach-a-manual-admin-approval)
3. [Approach B: Semi-Automated with Domain Verification](#approach-b-semi-automated-with-domain-verification)
4. [Approach C: Hybrid — Automated Fast-Track + Manual Fallback](#approach-c-hybrid-automated-fast-track--manual-fallback)
5. [Handling "Add My Company" (Not Yet in Pipeline)](#handling-add-my-company-not-yet-in-pipeline)
6. [Database Schema](#database-schema)
7. [Timelines](#timelines)
8. [Recommendation](#recommendation)

---

## The Core Problem

Your data pipeline ingests property transactions nightly from the SFR API. Each transaction includes buyer/seller company names, which get upserted into your `companies` table. You also have a `users` table with people who sign up for your platform. But there's no link between them — a user named "Jane Smith" who runs "Acme Capital LLC" has no way to tell your system that Acme Capital is her company.

You need this link so you can:
- Send users insights about their company's transactions.
- Show them their portfolio (which properties their company owns).
- Let them manage company contact info.
- Eventually, enable company-level features in the messaging system (company channels, etc.).

The tricky parts:
1. **Verification** — How do you confirm Jane actually runs Acme Capital and isn't just claiming it?
2. **Companies not yet in the pipeline** — What if a user's company hasn't transacted in your tracked MSAs yet?
3. **Speed vs. security tradeoff** — You want fast onboarding, but you can't let someone claim a competitor's company.

---

## Approach A: Manual Admin Approval

**Target:** Fastest to ship | **Verification:** Human reviews every claim | **Time to build:** 3–5 days

### How It Works

1. **User clicks "Claim a Company"** on their profile or the company directory page.
2. They see a search box that autocompletes against your `companies` table (fuzzy match on `company_name`).
3. If they find their company, they select it and fill out a short form: their role/title at the company, and optionally a work email or LinkedIn profile.
4. If they don't find their company, they can click "My company isn't listed" and fill out: company name, their role, work email, and optionally a website.
5. The claim goes into a `company_claims` table with status `pending`.
6. An admin (you or your team) gets a Postmark email notification and/or sees it in an admin dashboard.
7. The admin reviews the claim — maybe they Google the company, check the email domain against the company website, or just know the user personally.
8. Admin approves or rejects. On approval, a row is created in a `user_companies` join table linking the user to the company. If the company didn't exist, it also gets created in the `companies` table.
9. The user gets an email: "Your company claim was approved" or "We need more information."

### Why This Might Be All You Need

You have 150 users. Even if every single one of them claims a company in the same week, that's 150 claims to review. At 2 minutes per claim, that's 5 hours of work. And in practice, claims will trickle in over weeks. You're probably looking at 2–5 claims per day initially, which an admin can handle in the time it takes to drink a coffee.

The manual approach also handles the hardest edge cases perfectly: "This company name is slightly different from what's in our DB" — a human can recognize that "Acme Capital LLC" and "ACME CAPITAL" are the same company. "This person claims they own a company that someone else already claimed" — a human can investigate. No amount of automation handles ambiguity as well as a person at this scale.

### Pros
- Ships in 3–5 days.
- Handles every edge case because a human is in the loop.
- Zero false approvals (assuming the admin does their job).
- No third-party verification services needed.

### Cons
- Doesn't scale past ~50 claims/day without becoming a burden.
- Users have to wait for approval (could be hours or a day).
- Relies on admin availability — if the admin is on vacation, claims pile up.

---

## Approach B: Semi-Automated with Domain Verification

**Target:** Reduce admin burden | **Verification:** Email domain matching + admin fallback | **Time to build:** 1–2 weeks

### How It Works

This adds a fast-track verification path that automatically approves "obvious" claims and only routes ambiguous ones to a human.

**Step 1: Company claim (same UI as Approach A)**
User searches for their company, or adds a new one.

**Step 2: Domain verification (the fast-track)**
- When the company was ingested by your pipeline, you may already have a `contact_email` in the `companies` table (or you could enrich it using Apollo/RocketReach/Hunter, which you've explored before).
- If the company has a known domain (e.g., `acmecapital.com`) and the user's signup email or provided work email matches that domain → **auto-approve**.
- The logic is simple: extract the domain from the company's known email, extract the domain from the user's email, compare. If match → approved. No human needed.

**Step 3: Admin fallback**
- If no domain match is possible (company has no known email, user used a gmail.com address, etc.), the claim falls into the manual queue just like Approach A.
- The admin dashboard shows pending claims with a "confidence" indicator: "Domain match available but user email doesn't match" vs. "No company email on file" vs. "Free email provider used."

**Step 4: Additional verification signals (optional, low effort)**
- If the user provides a work email that matches the company domain but it's different from their signup email, send a verification email to the work address. They click a link, you confirm they have access to that inbox. Auto-approve.
- If the user provides a LinkedIn URL, the admin can check it during review (not automated, just a helpful link).

### The "Add My Company" Flow

For companies not yet in the pipeline:
1. User fills in: company name, website, their role, and their work email.
2. System checks if the work email domain matches the website domain. If yes → create the company in the `companies` table and auto-approve the claim.
3. If no match → manual queue.
4. A flag (`source: 'user_created'`) on the company distinguishes user-created companies from pipeline-ingested ones. This matters because user-created companies won't have property transaction data yet — but they might in the future when the pipeline picks them up. You'll want a reconciliation job (see below).

### Company Reconciliation Job

A nightly or weekly job that checks if any `source: 'user_created'` companies have been picked up by the pipeline under a slightly different name. This handles the "Acme Capital" vs "ACME CAPITAL LLC" problem:
- Normalize both names (lowercase, strip LLC/Inc/Corp, etc.).
- If there's a fuzzy match above a threshold, flag it for admin review to merge.
- When merged, all user associations transfer to the pipeline-ingested company (which has the richer data).

### Pros
- Auto-approves ~60–70% of claims (the ones with matching domains).
- Admin only handles the genuinely ambiguous cases.
- Still ships in 1–2 weeks.
- The verification email path handles the "I signed up with my personal email but I work at this company" case.

### Cons
- Doesn't work for companies without a web presence or with generic email domains.
- Small companies where the owner uses a gmail.com address for everything will still need manual review.
- Requires storing and comparing email domains, which is logic you need to maintain.

---

## Approach C: Hybrid — Automated Fast-Track + Manual Fallback

**Target:** Fastest user experience with strong confidence | **Verification:** Multi-signal scoring | **Time to build:** 3–4 weeks

### How It Works

This builds on Approach B but adds a confidence scoring system that considers multiple signals, not just email domain.

**Verification signals, each contributing to a confidence score:**

| Signal | Confidence Contribution | Notes |
|---|---|---|
| Work email domain matches company domain | +40 points | Strongest automated signal |
| Verification email clicked | +25 points | Confirms inbox access |
| User's name matches a contact name on the company record | +15 points | Your pipeline stores `contact_name` |
| User was the first to claim this company | +10 points | First claim is more likely legitimate |
| Company has no other active claimants | +5 points | No conflict |
| User provided LinkedIn URL | +5 points | Admin can verify quickly |

**Auto-approve threshold:** 65+ points → auto-approve.
**Admin review threshold:** 30–64 points → queued for manual review.
**Auto-reject/flag threshold:** Below 30 points → held for review with a warning flag.

**Conflict resolution (someone already claimed this company):**
- If Company X already has a verified owner and a new user tries to claim it:
  - The new claim goes to the admin queue regardless of score.
  - The existing owner gets notified: "Someone is requesting access to your company."
  - The admin can approve (maybe it's a coworker), reject, or ask both parties for more info.
- This is important because real companies have multiple employees. You probably want to support multiple users per company, with one designated as the "primary" owner who can approve other members.

**Invitation flow (reduces claims entirely):**
Once a company has a verified primary owner, that owner can invite coworkers directly. They enter an email, the coworker gets an invite link, signs up (or links their existing account), and is automatically associated with the company. No claim process needed. This alone eliminates most claims after the initial owner is verified.

### The "Add My Company" Flow (Enhanced)

Same as Approach B, but with an additional option:

- If the user can't find their company AND their email domain doesn't match a known company, they can upload a document as proof: business license, articles of incorporation, utility bill in the company name, or similar. This gets stored in Supabase Storage and shown to the admin during review.
- This is genuinely useful for small operators whose companies aren't online. A photo of their LLC paperwork is fast to upload and conclusive for the admin.

### Pros
- Best user experience — many users are verified instantly.
- Handles complex cases (multiple users per company, conflicts, companies not in the pipeline).
- The invitation flow dramatically reduces the volume of claims over time.
- Confidence scoring is transparent and auditable.

### Cons
- 3–4 weeks to build.
- More complex admin UI (scoring details, conflict resolution, document review).
- The confidence scoring weights need tuning over time based on real data.

---

## Handling "Add My Company" (Not Yet in Pipeline)

This deserves a dedicated section because it's a distinct user journey.

**Scenario:** A user signs up. They work at "Mountain View Homes LLC." Your pipeline hasn't picked up any transactions from this company yet — maybe they operate in an MSA you don't track, or they're new and haven't transacted yet.

### Option 1: Unified Companies Table with Source Flag

Create a distinction between companies that came from the pipeline (have transaction data) and companies that were added by users (no transaction data yet). Both live in the same `companies` table but are differentiated by a `source` field.

When the pipeline later picks up a transaction involving "Mountain View Homes," the reconciliation job matches it to the user-created record and enriches it with transaction data. The user then starts seeing insights without any additional action.

**Pros:**
- Simple — one table, one set of queries.
- User sees "My Company" immediately in their profile.
- Seamless transition when pipeline data arrives.

**Cons:**
- Your `companies` table now has records with no transaction data, which could affect analytics or company directory pages if you don't filter by source.

### Option 2: Watchlist Table

Instead of adding user-created companies directly to the `companies` table, put them in a separate `company_watchlist` table. The pipeline has a step that checks new company names against the watchlist. When there's a match, it creates the full company record and links it to the user who was watching.

**Pros:**
- Keeps `companies` table clean (only pipeline-verified companies).
- Clear separation between "real" companies and "user-requested" companies.

**Cons:**
- User doesn't see "My Company" in their profile until the pipeline picks it up — could be days, weeks, or never.
- Two tables to query and maintain.
- More complex reconciliation logic.

### My Recommendation

Option 1. Keeping everything in one `companies` table with a `source` field is simpler, gives users an immediate sense of ownership, and the reconciliation job handles the merge cleanly. The user sees "Mountain View Homes LLC" in their profile immediately, just with a note that says "No transaction data yet — we'll notify you when we pick up activity."

---

## Database Schema

```
company_claims
├── id (uuid, PK)
├── user_id (uuid, FK → users.id)
├── company_id (uuid, nullable, FK → companies.id)  ← null if "add new company"
├── status (enum: 'pending', 'approved', 'rejected', 'needs_info')
├── role_title (text)                    ← "Owner", "VP of Acquisitions", etc.
├── work_email (text, nullable)          ← for domain verification
├── work_email_verified (boolean, default false)
├── linkedin_url (text, nullable)
├── proof_document_url (text, nullable)  ← uploaded to Supabase Storage
├── confidence_score (integer, nullable) ← Approach C only
├── admin_notes (text, nullable)
├── reviewed_by (uuid, nullable, FK → users.id)
├── reviewed_at (timestamp, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)

-- For "add new company" claims where the company doesn't exist yet:
company_claim_details              ← only populated when company_id is null
├── id (uuid, PK)
├── claim_id (uuid, FK → company_claims.id)
├── proposed_company_name (text)
├── proposed_website (text, nullable)
├── proposed_phone (text, nullable)
└── created_at (timestamp)

user_companies                     ← the actual link table (created on approval)
├── id (uuid, PK)
├── user_id (uuid, FK → users.id)
├── company_id (uuid, FK → companies.id)
├── role (enum: 'owner', 'admin', 'member')
├── is_primary (boolean, default false) ← one primary per company
├── joined_at (timestamp)
└── UNIQUE(user_id, company_id)

company_invitations                ← Approach C, for existing owners to invite others
├── id (uuid, PK)
├── company_id (uuid, FK → companies.id)
├── invited_by (uuid, FK → users.id)
├── invited_email (text)
├── role (enum: 'admin', 'member')
├── status (enum: 'pending', 'accepted', 'expired')
├── token (text, unique)            ← for the invitation link
├── expires_at (timestamp)
├── created_at (timestamp)
└── updated_at (timestamp)
```

**Additions to the existing `companies` table:**

```
companies (existing — add these columns)
├── source (enum: 'pipeline', 'user_created', default 'pipeline')
├── website (text, nullable)
├── domain (text, nullable)          ← extracted from contact_email or website
└── is_claimed (boolean, default false)
```

**Indexes:**
- `company_claims(user_id, status)` — "what are my pending claims?"
- `company_claims(status, created_at)` — admin queue sorted by oldest first
- `user_companies(user_id)` — "which companies am I linked to?"
- `user_companies(company_id)` — "who is linked to this company?"
- `company_invitations(token)` — invitation link lookup
- `company_invitations(invited_email, status)` — check for pending invites on signup

---

## Timelines

### Approach A Timeline: 3–5 Days

| Day | What Gets Built |
|---|---|
| **Day 1** | Database schema: `company_claims` and `user_companies` tables + Drizzle migrations. REST endpoints: POST /api/claims (submit), GET /api/claims (admin list), PATCH /api/claims/:id (approve/reject). |
| **Day 2** | Frontend: "Claim a Company" modal with company search (autocomplete against existing companies) and "add new company" form. Submit flow. |
| **Day 3** | Admin review page: list of pending claims, approve/reject buttons, notes field. Postmark email notifications (new claim alert to admin, approval/rejection email to user). |
| **Day 4** | User profile page showing linked companies. Company page showing claimed-by info. Edge case handling (duplicate claims, already-claimed companies). |
| **Day 5** | Testing, polish, deploy. |

### Approach B Timeline: 1–2 Weeks

| Day/Week | What Gets Built |
|---|---|
| **Days 1–5** | Everything from Approach A. |
| **Days 6–7** | Domain verification logic: extract domains from company emails, compare with user emails, auto-approve matching claims. Verification email flow for work email confirmation. |
| **Days 8–9** | "Add new company" enhanced flow with domain matching against provided website. `source` field on companies table. |
| **Day 10** | Company reconciliation job (nightly cron): fuzzy-match user-created companies against new pipeline companies, flag matches for admin merge. |

### Approach C Timeline: 3–4 Weeks

| Week | What Gets Built |
|---|---|
| **Week 1** | Everything from Approach A (days 1–5). |
| **Week 2** | Domain verification + auto-approve. Confidence scoring engine. Enhanced admin dashboard showing scores and signal breakdown. |
| **Week 3** | Invitation system: owner invites coworkers via email, token-based invite links, auto-associate on signup. Conflict resolution flow (second claim on same company). Document upload for proof of ownership. |
| **Week 4** | Company reconciliation job. Notification system (Postmark emails for claim updates, invitations, company match alerts). Testing and polish. |

---

## Recommendation

**Start with Approach A.** It ships in 3–5 days and immediately unblocks the core value proposition — users can link themselves to companies and start receiving insights. While you're reviewing claims manually, you'll learn things: which companies get claimed most, how often users can't find their company, how many claims are ambiguous. That data informs whether you need Approach B or C.

If claim volume picks up or admin review becomes a bottleneck, upgrade to Approach B (add domain verification). The database schema is identical — you're just adding server-side logic that auto-approves certain claims before they hit the admin queue.

Approach C (confidence scoring, invitations, document uploads) is worth building once you have 500+ users or when multiple employees per company becomes a common pattern. The invitation flow alone is worth the investment at that point because it eliminates most of the claim volume entirely.