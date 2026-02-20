import { db } from "server/storage";
import { companies, companyMsas } from "@database/schemas/companies.schema";
import { msas } from "@database/schemas/msas.schema";
import { eq, inArray } from "drizzle-orm";
import {
    normalizeCompanyNameForStorage,
    normalizeCompanyNameForComparison,
} from "server/utils/normalization";
import { addCountiesToCompanyIfNeeded } from "server/utils/dataSyncHelpers";

const BATCH_SIZE = 100;

export interface InsertCompaniesParams {
    companyNames: string[];
    msa: string;
    cityCode: string;
    /** Map of company compareKey -> counties (from clean-transactions); used to set/update company county array. */
    companyCounties?: Record<string, string[]>;
}

export interface InsertCompaniesResult {
    companiesInserted: number;
    companyMsasAdded: number;
}

/**
 * Ensures the MSA exists in msas table. Returns msa_id.
 */
async function getOrCreateMsaId(msaName: string): Promise<number> {
    const [existing] = await db
        .select({ id: msas.id })
        .from(msas)
        .where(eq(msas.name, msaName))
        .limit(1);

    if (existing) return existing.id;

    const [inserted] = await db
        .insert(msas)
        .values({ name: msaName })
        .returning({ id: msas.id });
    if (!inserted) throw new Error(`Failed to insert MSA: ${msaName}`);
    return inserted.id;
}

/**
 * Inserts or updates companies and company_msas from cleaned market data.
 * - New companies: batch insert companies, then batch insert company_msas
 * - Existing companies: batch insert company_msas for this MSA if not yet associated
 * Uses chunks of BATCH_SIZE (100) and onConflictDoNothing to avoid duplicates.
 */
export async function insertCompanies(
    params: InsertCompaniesParams
): Promise<InsertCompaniesResult> {
    const { companyNames, msa, cityCode, companyCounties = {} } = params;

    const msaId = await getOrCreateMsaId(msa);

    // Dedupe: unique (storageName, compareKey) per raw name
    const seenKeys = new Set<string>();
    const toProcess: { storageName: string; compareKey: string }[] = [];
    for (const rawName of companyNames) {
        const storageName = normalizeCompanyNameForStorage(rawName);
        if (!storageName) continue;
        const compareKey = normalizeCompanyNameForComparison(storageName);
        if (!compareKey || seenKeys.has(compareKey)) continue;
        seenKeys.add(compareKey);
        toProcess.push({ storageName, compareKey });
    }

    // Load existing companies and company_msas for this MSA
    const existingCompanies = await db.select().from(companies);
    const companyByCompareKey = new Map<string, (typeof existingCompanies)[0]>();
    for (const company of existingCompanies) {
        const key = normalizeCompanyNameForComparison(company.companyName);
        if (key) companyByCompareKey.set(key, company);
    }

    const existingCompanyMsas = await db
        .select({ companyId: companyMsas.companyId })
        .from(companyMsas)
        .where(eq(companyMsas.msaId, msaId));
    const companyIdsWithThisMsa = new Set(
        existingCompanyMsas.map((r) => r.companyId)
    );

    // Partition: need only MSA link vs need company + MSA; track existing companies that need county updates
    const needMsaOnly: { companyId: string }[] = [];
    const needCompanyAndMsa: { storageName: string; compareKey: string }[] = [];
    const needCountyUpdate: { company: (typeof existingCompanies)[0]; counties: string[] }[] = [];
    for (const { storageName, compareKey } of toProcess) {
        const existing = companyByCompareKey.get(compareKey);
        if (existing) {
            if (!companyIdsWithThisMsa.has(existing.id)) {
                needMsaOnly.push({ companyId: existing.id });
            }
            const counties = companyCounties[compareKey];
            if (counties?.length) {
                needCountyUpdate.push({ company: existing, counties });
            }
        } else {
            needCompanyAndMsa.push({ storageName, compareKey });
        }
    }

    let companiesInserted = 0;
    const companyMsasToAdd: { companyId: string; msaId: number }[] = [];

    // Batch insert company_msas for existing companies (no new company row)
    for (let i = 0; i < needMsaOnly.length; i += BATCH_SIZE) {
        const chunk = needMsaOnly.slice(i, i + BATCH_SIZE);
        const values = chunk.map((r) => ({
            companyId: r.companyId,
            msaId,
        }));
        try {
            await db
                .insert(companyMsas)
                .values(values)
                .onConflictDoNothing({
                    target: [companyMsas.companyId, companyMsas.msaId],
                });
        } catch (err) {
            console.error(`[${cityCode} SYNC] Error batch inserting company_msas (existing companies):`, err);
        }
    }

    // Add missing counties to existing companies (same as dataSync addCountiesToCompanyIfNeeded)
    for (const { company, counties } of needCountyUpdate) {
        try {
            await addCountiesToCompanyIfNeeded(company, counties);
        } catch (err) {
            console.error(`[${cityCode} SYNC] Error adding counties to company ${company.companyName}:`, err);
        }
    }

    // Batch insert new companies, then collect (companyId, msaId) for company_msas
    for (let i = 0; i < needCompanyAndMsa.length; i += BATCH_SIZE) {
        const chunk = needCompanyAndMsa.slice(i, i + BATCH_SIZE);
        const companyValues = chunk.map(({ storageName, compareKey }) => ({
            companyName: storageName,
            contactName: null,
            contactEmail: null,
            phoneNumber: null,
            counties: (companyCounties[compareKey] ?? []) as string[],
            updatedAt: new Date(),
        }));

        try {
            const inserted = await db
                .insert(companies)
                .values(companyValues)
                .onConflictDoNothing({ target: companies.companyName })
                .returning({ id: companies.id, companyName: companies.companyName });

            companiesInserted += inserted.length;
            for (const row of inserted) {
                const key = normalizeCompanyNameForComparison(row.companyName);
                if (key) companyByCompareKey.set(key, row as (typeof existingCompanies)[0]);
                if (!companyIdsWithThisMsa.has(row.id)) {
                    companyMsasToAdd.push({ companyId: row.id, msaId });
                    companyIdsWithThisMsa.add(row.id);
                }
            }

            // Names that conflicted (already in DB): fetch ids and add to company_msas
            const insertedNames = new Set(inserted.map((r) => r.companyName));
            const conflictNames = chunk
                .map((r) => r.storageName)
                .filter((name) => !insertedNames.has(name));
            if (conflictNames.length > 0) {
                const fetched = await db
                    .select({ id: companies.id, companyName: companies.companyName })
                    .from(companies)
                    .where(inArray(companies.companyName, conflictNames));
                for (const row of fetched) {
                    const key = normalizeCompanyNameForComparison(row.companyName);
                    if (key && !companyByCompareKey.has(key)) {
                        companyByCompareKey.set(key, row as (typeof existingCompanies)[0]);
                    }
                    if (!companyIdsWithThisMsa.has(row.id)) {
                        companyMsasToAdd.push({ companyId: row.id, msaId });
                        companyIdsWithThisMsa.add(row.id);
                    }
                }
            }
        } catch (err) {
            console.error(`[${cityCode} SYNC] Error batch inserting companies:`, err);
        }
    }

    // Batch insert company_msas for newly inserted / conflicted companies
    for (let i = 0; i < companyMsasToAdd.length; i += BATCH_SIZE) {
        const chunk = companyMsasToAdd.slice(i, i + BATCH_SIZE);
        try {
            await db
                .insert(companyMsas)
                .values(chunk)
                .onConflictDoNothing({
                    target: [companyMsas.companyId, companyMsas.msaId],
                });
        } catch (err) {
            console.error(`[${cityCode} SYNC] Error batch inserting company_msas (new companies):`, err);
        }
    }

    const companyMsasAdded = needMsaOnly.length + companyMsasToAdd.length;
    console.log(`[${cityCode} SYNC] Companies: ${companiesInserted} new, ${companyMsasAdded} MSA associations added`);

    return {
        companiesInserted,
        companyMsasAdded,
    };
}
