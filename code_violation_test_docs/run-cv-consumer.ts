/**
 * Code-Violation feature — local consumer runner.
 *
 * The cron that drains `cv_violations` (match → resolve owner → diff → review/notify) is gated on
 * NODE_ENV === 'production' (server/jobs/index.ts), so it NEVER runs under `npm run dev`. This script
 * invokes one consumer pass on demand against your local DATABASE_URL so you can process an upload
 * locally without faking production mode.
 *
 *   npx tsx code_violation_test_docs/run-cv-consumer.ts
 *
 * Review gate (CV_REQUIRE_REVIEW, default ON): matched + notifiable complaints stop at
 * `awaiting_review` and DO NOT email — approve the upload in the admin panel to fire the emails
 * (the dry-run flow). To email inline instead (skip the panel), run with the gate off:
 *
 *   CV_REQUIRE_REVIEW=off npx tsx code_violation_test_docs/run-cv-consumer.ts   (bash)
 *   $env:CV_REQUIRE_REVIEW='off'; npx tsx code_violation_test_docs/run-cv-consumer.ts   (PowerShell)
 *
 * Run it again to process more if your batch exceeded CV_BATCH_SIZE (default 25).
 * Note: this sends REAL email via Postmark when the gate is off (or on approve) — see README.
 */
import 'dotenv/config';
import { runCodeViolationConsumer } from 'server/jobs/code-violations/consumer';

runCodeViolationConsumer()
    .then(() => {
        console.log('[run-cv-consumer] pass complete.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('[run-cv-consumer] failed:', err);
        process.exit(1);
    });
