import { db } from 'server/storage';
import {
    companies,
    companyContacts,
    companyDetails,
    companyMsas,
} from '@database/schemas/companies.schema';
import { msas } from '@database/schemas/msas.schema';
import { enrichCompany } from 'server/services/companies/companies.services';
import { OpenCorporatesService } from 'server/services/opencorporates';
import { and, eq, isNull, sql } from 'drizzle-orm';

const LOG = '[ENRICH CRON]';
const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA';
const STATE = 'CA';
const MONTHLY_CALL_BUDGET = 500;

export async function enrichCompaniesJob(): Promise<void> {
    console.log(`${LOG} Starting monthly OpenCorporates enrichment sweep (San Diego, CA)`);

    let callLimit: number;
    try {
        const accountStatus = await OpenCorporatesService.getAccountStatus();
        const { this_month: remainingThisMonth, today: remainingToday } =
            accountStatus.calls_remaining;

        // Self-imposed monthly budget: cap at MONTHLY_CALL_BUDGET or whatever the API has left.
        // If daily remaining is lower, use that instead to avoid exhausting the day's quota.
        const monthlyAvailable = Math.min(remainingThisMonth, MONTHLY_CALL_BUDGET);
        callLimit = Math.min(monthlyAvailable, remainingToday);

        console.log(
            `${LOG} API quota — remaining this month: ${remainingThisMonth}, today: ${remainingToday}. Call limit for this run: ${callLimit}`,
        );
    } catch (err) {
        console.warn(`${LOG} Could not fetch account status, falling back to limit of 50:`, err);
        callLimit = 50;
    }

    if (callLimit <= 0) {
        console.log(`${LOG} No API calls available (quota exhausted). Skipping sweep.`);
        return;
    }

    // Companies in the San Diego MSA that have no contacts yet, ordered:
    //   1. Never enriched (no company_details row) — NULLS FIRST
    //   2. Least recently enriched
    // Companies with existing contacts are already populated and skipped.
    const candidates = await db
        .select({ id: companies.id, companyName: companies.companyName })
        .from(companies)
        .innerJoin(companyMsas, eq(companyMsas.companyId, companies.id))
        .innerJoin(msas, and(eq(msas.id, companyMsas.msaId), eq(msas.name, SD_MSA)))
        .leftJoin(companyDetails, eq(companyDetails.companyId, companies.id))
        .leftJoin(companyContacts, eq(companyContacts.companyId, companies.id))
        .where(isNull(companyContacts.id))
        .orderBy(sql`${companyDetails.enrichedAt} ASC NULLS FIRST`);

    console.log(`${LOG} ${candidates.length} San Diego companies without contacts queued`);

    let processed = 0;
    let enriched = 0;
    let noMatch = 0;
    let errors = 0;

    for (const company of candidates) {
        if (processed >= callLimit) {
            console.log(
                `${LOG} Call limit of ${callLimit} reached. Enriched: ${enriched}, No match: ${noMatch}, Errors: ${errors}`,
            );
            return;
        }

        const result = await enrichCompany(company.id, STATE);
        processed++;

        switch (result.status) {
            case 'ok':
                enriched++;
                if (enriched % 10 === 0) {
                    console.log(
                        `${LOG} [${processed}/${candidates.length}] Enriched ${enriched} so far`,
                    );
                }
                break;
            case 'no-match':
                noMatch++;
                break;
            case 'oc-error':
                // 403 = monthly quota exhausted — stop immediately
                if (result.message.includes('403')) {
                    console.log(
                        `${LOG} Rate limit reached (403) after ${processed} requests. Enriched: ${enriched}, No match: ${noMatch}, Errors: ${errors}`,
                    );
                    return;
                }
                errors++;
                console.warn(`${LOG} OC error for "${company.companyName}": ${result.message}`);
                break;
            case 'not-found':
            case 'unknown-jurisdiction':
                break;
        }
    }

    console.log(
        `${LOG} Sweep complete — ${processed} processed. Enriched: ${enriched}, No match: ${noMatch}, Errors: ${errors}`,
    );
}
