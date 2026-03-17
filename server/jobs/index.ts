import cron from "node-cron"
import { CleanCache } from "./clean-cache"
import { sendDenverEmail } from "./email/denver-email"
import { sendMiamiEmail } from "./email/miami-email"
import { sendLosAngelesEmail } from "./email/los-angeles-email"
import { sendSanDiegoEmail } from "./email/san-diego-email"
import { sendSanFranciscoEmail } from "./email/san-francisco-email"
import { sendPortStLucieEmail } from "./email/port-st-lucie-email"
import { scanWindowA } from "./data_v2/scan-window-a"
import { scanWindowB } from "./data_v2/scan-window-b"
import { scanWindowC } from "./data_v2/scan-window-c"
import { scanWindowD } from "./data_v2/scan-window-d"
import { scanWindowE } from "./data_v2/scan-window-e"
import { runConsumer } from "./data_v2/consumer"

export function startScheduledJobs() {
    console.log("[CRON] Starting scheduled jobs...")

    // =========================================================================
    // DATA PIPELINE V2 — MARKET SCAN QUEUE
    // =========================================================================

    // Scanner A (0-15d): nightly at midnight — primary ingestion window
    cron.schedule("0 0 * * *", scanWindowA, {
        timezone: "America/Los_Angeles"
    })

    // Scanner B (15-30d): every 3rd night at 1:00 AM — catches late backfills in 15-30d range
    cron.schedule("0 1 */3 * *", scanWindowB, {
        timezone: "America/Los_Angeles"
    })

    // Scanner C (30-60d): Mondays at 2:00 AM — weekly sweep of 30-60d range
    cron.schedule("0 2 * * 1", scanWindowC, {
        timezone: "America/Los_Angeles"
    })

    // Scanner D (60-90d): At 4:00 AM On the 1st and 15th of every month
    cron.schedule("0 4 1,15 * *", scanWindowD, {
        timezone: "America/Los_Angeles"
    })

    // Scanner E (90-180d): 1st of each month at 5:00 AM — one-time deep historical backfill
    cron.schedule("0 5 1 * *", scanWindowE, {
        timezone: "America/Los_Angeles"
    })
    
    // Consumer: Every hour from 6am to 11pm — processes all pending market_scan_queue rows
    cron.schedule("0 6-23 * * *", runConsumer, {
        timezone: "America/Los_Angeles"
    })

    // =========================================================================
    // Clean Cache
    // =========================================================================

    // Clean Streetview Cache Every Night at 1:00 AM
    cron.schedule("15 0 * * *", CleanCache, {
        timezone: "America/Los_Angeles"
    })

    // =========================================================================
    // Email Jobs by MSA
    // =========================================================================

    // EST
    cron.schedule("0 6 * * *", sendMiamiEmail, { timezone: "America/Los_Angeles" })
    cron.schedule("5 6 * * *", sendPortStLucieEmail, { timezone: "America/Los_Angeles" })
    
    // CST
    cron.schedule("0 8 * * *", sendDenverEmail, { timezone: "America/Los_Angeles" })

    // PST
    cron.schedule("0 9 * * *", sendSanDiegoEmail, { timezone: "America/Los_Angeles" })
    cron.schedule("5 9 * * *", sendLosAngelesEmail, { timezone: "America/Los_Angeles" })
    cron.schedule("10 9 * * *", sendSanFranciscoEmail, { timezone: "America/Los_Angeles" })
}
