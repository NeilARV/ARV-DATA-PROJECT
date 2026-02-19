/**
 * Runs the Denver sync once (e.g. with MOCK_RESALE=true to test resale updates).
 * Usage: MOCK_RESALE=true npx tsx server/scripts/run-denver-sync.ts
 */

import "dotenv/config";
import { syncDenverData } from "../jobs/data";

syncDenverData()
  .then((result) => {
    console.log("Sync complete:", result);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
