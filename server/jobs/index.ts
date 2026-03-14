import cron from "node-cron"
import { CleanCache } from "./clean-cache"
import { syncSanDiegoData, syncLosAngelesData, syncDenverData, syncSanFranciscoData, syncMiamiData, syncPortStLucieData } from "./data"
import { UpdatePropertyStatus } from "./property-status"
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

export function startScheduledJobs() {
    console.log("[CRON] Starting scheduled jobs...")

    // =========================================================================
    // DATA PIPELINE V2 — MARKET SCAN QUEUE
    // =========================================================================

    // Scanner A (0-22d): daily at 2:30 AM — primary ingestion window
    cron.schedule("57 * * * *", scanWindowA, {
        timezone: "America/Los_Angeles"
    })

    // // Scanner B (20-46d): Mon/Wed/Fri at 3:30 AM — catches late backfills in 20-46d range
    // cron.schedule("30 3 * * 1,3,5", scanWindowB, {
    //     timezone: "America/Los_Angeles"
    // })

    // // Scanner C (44-76d): Sundays at 4:30 AM — weekly sweep of 44-76d range
    // cron.schedule("30 4 * * 0", scanWindowC, {
    //     timezone: "America/Los_Angeles"
    // })

    // // Scanner D (74-91d): 1st and 15th at 5:30 AM — bi-weekly tail window
    // cron.schedule("30 5 1,15 * *", scanWindowD, {
    //     timezone: "America/Los_Angeles"
    // })

    // =========================================================================
    // LEGACY PIPELINE / OTHER JOBS
    // =========================================================================

    // Clean Streetview Cache Every Night at 1:00 AM
    cron.schedule("15 0 * * *", CleanCache, {
        timezone: "America/Los_Angeles"
    })

    // // Check property market status every night at 12:30 AM
    // cron.schedule("30 0 * * *", UpdatePropertyStatus, {
    //     timezone: "America/Los_Angeles"
    // })

    // Start Miami-Fort Lauderdale-West Palm Beach, FL property data sync every night at 11:00 PM
    cron.schedule("0 23 * * *", syncMiamiData, {
        timezone: "America/Los_Angeles"
    })

    // Start Port St. Lucie, FL property data sync every night at 0:00 AM
    cron.schedule("0 0 * * *", syncPortStLucieData, {
        timezone: "America/Los_Angeles"
    })

    // Start Denver-Aurora-Centennial, CO property data sync every night at 1:00 AM
    cron.schedule("0 1 * * *", syncDenverData, {
        timezone: "America/Los_Angeles"
    })

    // Start San Diego-Chula Vista-Carlsbad, CA property data sync every night at 2:00 AM
    cron.schedule("0 2 * * *", syncSanDiegoData, {
        timezone: "America/Los_Angeles"
    })

    // Start Los Angeles-Long Beach-Anaheim, CA property data sync every night at 3:00 AM
    cron.schedule("0 3 * * *", syncLosAngelesData, {
        timezone: "America/Los_Angeles"
    })

    // Start San Francisco-Oakland-Fremont, CA property data sync every night at 4:00 AM
    cron.schedule("0 4 * * *", syncSanFranciscoData, {
        timezone: "America/Los_Angeles"
    })

    // MSA-specific email updates: users who have that MSA selected get 3 most recent properties for that MSA
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
