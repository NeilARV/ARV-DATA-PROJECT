import cron from "node-cron"
import { CleanCache } from "./cleanCache"

export function startScheduledJobs() {
    console.log("[CRON] Starting scheduled jobs...")

    // Clean Streetview Cache Every Night at 2:00 AM
    cron.schedule("0 2 * * *", CleanCache)
    
}