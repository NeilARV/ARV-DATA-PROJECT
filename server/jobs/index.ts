import cron from "node-cron"
import { CleanCache } from "./clean-cache"
import { syncSanDiegoData, syncLosAngelesData, syncDenverData, syncSanFranciscoData } from "./data"
import { UpdatePropertyStatus } from "./property-status"

export function startScheduledJobs() {
    console.log("[CRON] Starting scheduled jobs...")

    // Clean Streetview Cache Every Night at 1:00 AM
    cron.schedule("15 0 * * *", CleanCache, {
        timezone: "America/Los_Angeles"
    })

    // Check property market status every night at 1:15 AM
    cron.schedule("30 0 * * *", UpdatePropertyStatus, {
        timezone: "America/Los_Angeles"
    })

    // Start San Diego-Chula Vista-Carlsbad, CA property data sync every night at 1:00 AM
    cron.schedule("0 1 * * *", syncSanDiegoData, {
        timezone: "America/Los_Angeles"
    })

    // Start Los Angeles-Long Beach-Anaheim, CA property data sync every night at 2:0 AM
    cron.schedule("0 2 * * *", syncLosAngelesData, {
        timezone: "America/Los_Angeles"
    })

    // Start Denver-Aurora-Centennial, CO property data sync every night at 3:00 AM
    cron.schedule("0 3 * * *", syncDenverData, {
        timezone: "America/Los_Angeles"
    })

    // Start San Francisco-Oakland-Fremont, CA property data sync every night at 4:00 AM
    cron.schedule("0 4 * * *", syncSanFranciscoData, {
        timezone: "America/Los_Angeles"
    })


    /**
     * 
     * TESTING SCHEDULERS
     * 
     */
    // // Check property market status every night at 1:15 AM
    // cron.schedule("47 * * * *", UpdatePropertyStatus, {
    //     timezone: "America/Los_Angeles"
    // })

    // // Start San Diego-Chula Vista-Carlsbad, CA property data sync every night at 2:00 AM
    // cron.schedule("40 * * * *", syncSanDiegoData, {
    //     timezone: "America/Los_Angeles"
    // })

    // // Start Los Angeles-Long Beach-Anaheim, CA property data sync every night at 2:15 AM
    // cron.schedule("59 * * * *", syncLosAngelesData, {
    //     timezone: "America/Los_Angeles"
    // })

    // // Start Denver-Aurora-Centennial, CO property data sync every night at 2:30 AM
    // cron.schedule("41 * * * *", syncDenverData, {
    //     timezone: "America/Los_Angeles"
    // })

    // // Start San Francisco-Oakland-Fremont, CA property data sync every night at 2:30 AM
    // cron.schedule("59 * * * *", syncSanFranciscoData, {
    //     timezone: "America/Los_Angeles"
    // })
    
}
