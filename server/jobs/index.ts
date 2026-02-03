import cron from "node-cron"
import { CleanCache } from "./clean-cache"
import { syncSanDiegoData, syncLosAngelesData, syncDenverData, syncSanFranciscoData } from "./data"
import { UpdatePropertyStatus } from "./property-status"

export function startScheduledJobs() {
    console.log("[CRON] Starting scheduled jobs...")

    // Clean Streetview Cache Every Night at 1:00 AM
    cron.schedule("0 1 * * *", CleanCache, {
        timezone: "America/Los_Angeles"
    })

    // Check property market status every night at 1:15 AM
    cron.schedule("15 1 * * *", UpdatePropertyStatus, {
        timezone: "America/Los_Angeles"
    })

    // Start San Diego-Chula Vista-Carlsbad, CA property data sync every night at 2:00 AM
    cron.schedule("0 2 * * *", syncSanDiegoData, {
        timezone: "America/Los_Angeles"
    })

    // Start Los Angeles-Long Beach-Anaheim, CA property data sync every night at 2:15 AM
    cron.schedule("10 2 * * *", syncLosAngelesData, {
        timezone: "America/Los_Angeles"
    })

    // Start Denver-Aurora-Centennial, CO property data sync every night at 2:30 AM
    cron.schedule("20 2 * * *", syncDenverData, {
        timezone: "America/Los_Angeles"
    })

    // Start San Francisco-Oakland-Fremont, CA property data sync every night at 2:30 AM
    cron.schedule("30 2 * * *", syncSanFranciscoData, {
        timezone: "America/Los_Angeles"
    })


    /**
     * 
     * TESTING SCHEDULERS
     * 
     */
    // // Check property market status every night at 1:15 AM
    // cron.schedule("1 * * * *", UpdatePropertyStatus, {
    //     timezone: "America/Los_Angeles"
    // })

    // // // Start San Diego-Chula Vista-Carlsbad, CA property data sync every night at 2:00 AM
    // cron.schedule("58 * * * *", syncSanDiegoData, {
    //     timezone: "America/Los_Angeles"
    // })

    // // Start Los Angeles-Long Beach-Anaheim, CA property data sync every night at 2:15 AM
    // cron.schedule("55 * * * *", syncLosAngelesData, {
    //     timezone: "America/Los_Angeles"
    // })

    // Start Denver-Aurora-Centennial, CO property data sync every night at 2:30 AM
    cron.schedule("42 * * * *", syncDenverData, {
        timezone: "America/Los_Angeles"
    })

    // Start San Francisco-Oakland-Fremont, CA property data sync every night at 2:30 AM
    // cron.schedule("8 * * * *", syncSanFranciscoData, {
    //     timezone: "America/Los_Angeles"
    // })
    
}
