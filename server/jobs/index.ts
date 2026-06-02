import cron from 'node-cron';
import { CleanCache } from './clean-cache';
import { sendDenverEmail } from './email/denver-email';
import { sendMiamiEmail } from './email/miami-email';
import { sendLosAngelesEmail } from './email/los-angeles-email';
import { sendSanDiegoEmail } from './email/san-diego-email';
import { sendSanFranciscoEmail } from './email/san-francisco-email';
import { sendPortStLucieEmail } from './email/port-st-lucie-email';
import { sendSeattleEmail } from './email/seattle-email';
import { scanWindowA } from './data_v2/scan-window-a';
import { scanWindowB } from './data_v2/scan-window-b';
import { scanWindowC } from './data_v2/scan-window-c';
import { scanWindowD } from './data_v2/scan-window-d';
import { scanWindowE } from './data_v2/scan-window-e';
import { scanWindowInit } from './data_v2/scan-window-init';
import { runConsumer } from './data_v2/consumer';
import { sendTampaEmail } from './email/tampa-email';
import { cleanEmailCache } from './email/clean-email-cache';
import { cleanMarketCache } from './data_v2/clean-market-cache';

export function startScheduledJobs() {
    console.log('[CRON] Starting scheduled jobs...');

    // =========================================================================
    // Clean Cache
    // =========================================================================

    // Clean Streetview Cache Every Night at 11:30 PM
    cron.schedule('30 23 * * *', CleanCache, {
        timezone: 'America/Los_Angeles',
    });

    // Clean sent property ids (sent email cache) at 11:40 PM
    cron.schedule('40 23 * * *', cleanEmailCache, {
        timezone: 'America/Los_Angeles',
    });

    // Clean market scan queue (older than 90 days with status = 'complete') at 11:50 PM
    cron.schedule('50 23 * * *', cleanMarketCache, {
        timezone: 'America/Los_Angeles',
    });

    // =========================================================================
    // DATA PIPELINE V2 — MARKET SCAN QUEUE
    // =========================================================================
    if (process.env.NODE_ENV === 'production') {
        // Scanner A (0-15d): nightly at 12:00am (midnight) — primary ingestion window
        cron.schedule('0 0 * * *', scanWindowA, {
            timezone: 'America/Los_Angeles',
        });

        // Scanner B (15-30d): every other day at 1:00 AM — catches late backfills in 15-30d range
        cron.schedule('0 1 */2 * *', scanWindowB, {
            timezone: 'America/Los_Angeles',
        });

        // Scanner C (30-60d): Mondays at 2:00 AM — weekly sweep of 30-60d range
        cron.schedule('0 2 * * 1', scanWindowC, {
            timezone: 'America/Los_Angeles',
        });

        // Scanner D (60-90d): At 3:00 AM On the 1st and 15th of every month
        cron.schedule('0 3 1,15 * *', scanWindowD, {
            timezone: 'America/Los_Angeles',
        });

        // // Scanner E (90-180d): 1st of each month at 4:00 AM — one-time deep historical backfill
        // cron.schedule("0 4 1 * *", scanWindowE, {
        //     timezone: "America/Los_Angeles"
        // })

        // Init scanner — single MSA backfill (see scan-window-init.ts to set MSA_NAME and MODE)
        // Set the cron time below to whatever works locally, then comment this out when done.
        // cron.schedule("33 * * * *", scanWindowInit, {
        //     timezone: "America/Los_Angeles"
        // })
    } else {
        console.log(
            `[CRON] Scan windows skipped — not running in production (NODE_ENV="${process.env.NODE_ENV}")`,
        );
    }

    // Consumer: Run at 30 minute mark every hour from 5am to 10pm — processes all pending market_scan_queue rows
    // Earliest Run Time: 5am | Latest Run Time: 10:30pm
    // Can adjust time based on whether or not Scanner E is active
    if (process.env.NODE_ENV === 'production') {
        cron.schedule('*/30 5-22 * * *', runConsumer, {
            timezone: 'America/Los_Angeles',
        });
        // cron.schedule("28 * * * *", runConsumer, {
        //     timezone: "America/Los_Angeles"
        // })
    } else {
        console.log(
            `[CRON] Consumer skipped — not running in production (NODE_ENV="${process.env.NODE_ENV}")`,
        );
    }

    // =========================================================================
    // Email Jobs by MSA
    // =========================================================================
    if (process.env.NODE_ENV === 'production') {
        // EST
        cron.schedule('0 6 * * *', sendMiamiEmail, { timezone: 'America/Los_Angeles' });
        cron.schedule('5 6 * * *', sendTampaEmail, { timezone: 'America/Los_Angeles' });
        cron.schedule('10 6 * * *', sendPortStLucieEmail, { timezone: 'America/Los_Angeles' });

        // CST
        cron.schedule('0 8 * * *', sendDenverEmail, { timezone: 'America/Los_Angeles' });

        // PST
        cron.schedule('0 9 * * *', sendSanDiegoEmail, { timezone: 'America/Los_Angeles' });
        cron.schedule('5 9 * * *', sendLosAngelesEmail, { timezone: 'America/Los_Angeles' });
        cron.schedule('10 9 * * *', sendSanFranciscoEmail, { timezone: 'America/Los_Angeles' });
        cron.schedule('15 9 * * *', sendSeattleEmail, { timezone: 'America/Los_Angeles' });
    } else {
        console.log(
            `[CRON] Email updates skipped — not running in production (NODE_ENV="${process.env.NODE_ENV}")`,
        );
    }
}
