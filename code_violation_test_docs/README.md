# Code-Violation feature — local manual-testing kit

Throwaway mock data + scenario CSVs for manually testing the **Property Code-Violation Alerts**
pipeline (`.claude/plans/code-violation.md`) on your local machine. Everything here lives on the
test branch and is meant to be deleted when you're done (`cleanup-cv-mocks.ts`).

The headline fixture: **`justin@arvfinance.com` is the sole member of `JUSTIN TEST HOLDINGS LLC`,
which is the current owner (most-recent arms-length buyer) of `4521 Adams Ave, San Diego`.** A matched
complaint on that property resolves to justin and emails him — exactly the case the user asked for.

> Everything writes to your local **`DATABASE_URL`** (your dev branch), the same target as
> `npm run db:seed`. It does **not** use the test DB.

---

## Files

| File | What it is |
|---|---|
| `seed-cv-mocks.ts` | Inserts the fixtures (justin, companies, properties, addresses, transactions). Idempotent. |
| `run-cv-consumer.ts` | Runs **one consumer pass** locally (the cron is prod-gated, so it never runs under `npm run dev`). |
| `enqueue-csv-local.ts` | Enqueues a CSV **without** the Supabase archive step — fallback when the dev Storage bucket isn't set up. |
| `cleanup-cv-mocks.ts` | Deletes all of the above + the `cv_*` rows the CSVs created. |
| `01`–`06 *.csv` | Scenario uploads (see the table below). |

---

## Prerequisites

1. **`DATABASE_URL`** in `.env` points at your local/dev Neon branch.
2. **Lookup tables seeded** (`npm run db:seed`) — the seed grants justin the `owner` role, which needs
   the `roles` table populated.
3. **`cv_` tables exist** on that branch (apply the Chunk A migration; do **not** `db:push`).
4. **To send the actual email** (the Approve / gate-off step): Postmark env vars
   (`POSTMARK_SERVER_API_KEY`, `DEFAULT_FROM_EMAIL`) must be set. `justin@arvfinance.com` is a real
   inbox, so approving **will send a real email**. Dry-run only (review gate on, no Approve) sends nothing.
5. **For admin-panel upload (Path A)**: the `code-violations-dev` Supabase Storage bucket must exist
   (the ingest archives the raw file there first). If it doesn't, use **Path B**.

---

## Quick start

```bash
# 1. Seed the fixtures
npx tsx code_violation_test_docs/seed-cv-mocks.ts
```

### Path A — full flow through the admin UI (needs the Supabase dev bucket)

1. `npm run dev`, log in as an admin/owner (or as **justin@arvfinance.com / `TestPassword123!`**).
2. Admin → **Code Violations** tab → upload e.g. `01-happy-path-justin.csv`. The upload returns
   immediately with the rows enqueued as `pending`.
3. Drain the queue (the cron is prod-gated, so trigger it by hand):
   ```bash
   npx tsx code_violation_test_docs/run-cv-consumer.ts
   ```
4. Back in the panel, the upload is now in **review** — it shows each match, the resolved owner
   company, and **exactly who would be emailed** (justin). Click **Approve & Notify** to fire the email.

### Path B — no Supabase needed (enqueue directly, email inline)

```bash
# enqueue a CSV without the Supabase archive
npx tsx code_violation_test_docs/enqueue-csv-local.ts code_violation_test_docs/06-all-scenarios.csv

# drain WITH the review gate OFF so notifiable rows email immediately (no Approve step)
#   bash:
CV_REQUIRE_REVIEW=off npx tsx code_violation_test_docs/run-cv-consumer.ts
#   PowerShell:
$env:CV_REQUIRE_REVIEW='off'; npx tsx code_violation_test_docs/run-cv-consumer.ts
```

Leave `CV_REQUIRE_REVIEW` unset (gate **on**) to stop at `awaiting_review` and inspect the dry-run in
the panel / DB instead of emailing.

---

## Scenarios & expected outcomes

After running the consumer over each file, the `cv_violations` rows settle like this:

| CSV | Record # | Address | `processing_status` | `notified` | Why |
|---|---|---|---|---|---|
| `01-happy-path-justin` | `CE-1000001` | 4521 Adams Ave | `awaiting_review` → `complete` on Approve | → `true` | Owner = JUSTIN TEST HOLDINGS LLC, justin is a member |
| `02-no-match-and-junk` | `CE-2000001` | 9999 Nonexistent Rd | `no_match` | `false` | Not a property we track |
| | `CE-2000002` | `United States` | `no_match` | `false` | Street parses to empty (enqueued, then no match) |
| | *(blank record #)* | — | *not enqueued* | — | Empty Record Number fails the row schema → **skipped at ingest** |
| `03-ambiguous` | `CE-3000001` | 100 Birch St (no zip) | `ambiguous` | `false` | Two seeded properties share the street; no zip to break the tie |
| `04-stored-not-notified` | `CE-4000001` | 4602 Felton St | `complete` | `false` | Owner = ORPHAN CAPITAL LLC, **no platform users** |
| | `CE-4000002` | 3915 Idaho St | `complete` | `false` | Owner is an **individual** (no company FK) |
| `05-tmp-ce-dedup` | `##TMP-5000001` | 5050 Cape May Ave | `awaiting_review`/`complete` | `true` (one of the pair) | JUSTIN-owned → alerts |
| | `CE-5000099` | 5050 Cape May Ave | `complete` | `false` | Same address+date+description → **deduped** (TMP→CE) |
| `06-all-scenarios` | `CE-9000001…9` | mixed | all of the above in one upload | — | Realistic mixed daily upload; `CE-9000009` also exercises embedded quotes + a multiline description |

> The `01`–`05` files use distinct record numbers from `06`, so you can run them individually **and**
> run `06` afterward without collisions. Re-uploading the **same** record number won't reprocess it —
> that's the by-design idempotency (dedup on `record_number`); reset with `cleanup-cv-mocks.ts` to
> start fresh.

### Email recipient gotcha

A company member is only emailed when their user row has **`notifications = true`** AND a non-null
**`email_verified_at`** (`getEmailRecipientsByUserIds`). The seed sets both for justin. If you swap in
a different recipient and they don't receive, check those two columns first.

---

## Reset / teardown

```bash
# wipe the cv_ rows the CSVs created AND the seeded fixtures
npx tsx code_violation_test_docs/cleanup-cv-mocks.ts
```

`cleanup` removes `cv_violations` whose record numbers match the scenario prefixes (cascading
`cv_matches` / `cv_notifications_sent`), the `source='manual'` `cv_uploads`, and the seeded
properties/companies/justin user. Re-running `seed-cv-mocks.ts` also self-cleans its own rows first,
so you can re-seed any time.
