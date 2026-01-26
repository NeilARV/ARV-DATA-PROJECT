import cron from "node-cron"
import { CleanCache } from "./clean-cache"
import { syncSanDiegoData, syncLosAngelesData, syncDenverData } from "./data"

export function startScheduledJobs() {
    console.log("[CRON] Starting scheduled jobs...")

    // Clean Streetview Cache Every Night at 1:00 AM
    cron.schedule("0 1 * * *", CleanCache)

    // Start San Diego-Chula Vista-Carlsbad, CA property data sync every night at 1:30 AM
    cron.schedule("22 * * * *", syncSanDiegoData)

    // Start Los Angeles-Long Beach-Anaheim, CA property data sync every night at 1:45 AM
    cron.schedule("24 * * * *", syncLosAngelesData)

    // Start Denver-Aurora-Centennial, CO property data sync every night at 2:00 AM
    cron.schedule("26 * * * *", syncDenverData)
    
}
