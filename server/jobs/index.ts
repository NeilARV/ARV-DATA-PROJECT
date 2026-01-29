import cron from "node-cron"
import { CleanCache } from "./clean-cache"
import { syncSanDiegoData, syncLosAngelesData, syncDenverData } from "./data"
import { UpdatePropertyStatus } from "./property-status"

export function startScheduledJobs() {
    console.log("[CRON] Starting scheduled jobs...")

    // Clean Streetview Cache Every Night at 1:00 AM
    cron.schedule("0 1 * * *", CleanCache)

    // Check property market status every night at 1:15 AM
    cron.schedule("0 10 * * *", UpdatePropertyStatus)

    // Start San Diego-Chula Vista-Carlsbad, CA property data sync every night at 2:00 AM
    cron.schedule("0 2 * * *", syncSanDiegoData)

    // Start Los Angeles-Long Beach-Anaheim, CA property data sync every night at 2:15 AM
    cron.schedule("15 2 * * *", syncLosAngelesData)

    // Start Denver-Aurora-Centennial, CO property data sync every night at 2:30 AM
    cron.schedule("30 2 * * *", syncDenverData)
}
