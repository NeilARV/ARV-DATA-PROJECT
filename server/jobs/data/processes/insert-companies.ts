import { db } from "server/storage";
import { companies, companyMsas } from "@database/schemas/companies.schema";
import { msas } from "@database/schemas/msas.schema";
import { eq } from "drizzle-orm";
import {
    normalizeCompanyNameForStorage,
    normalizeCompanyNameForComparison,
} from "server/utils/normalization";
import type { CleanMarketResult } from "./clean-market";

export interface InsertCompaniesParams {
    cleaned: CleanMarketResult;
    msa: string;
    cityCode: string;
}

export interface InsertCompaniesResult {
    records: CleanMarketResult["records"];
    companyNames: string[];
    dateRange: CleanMarketResult["dateRange"];
    lastSaleDate: CleanMarketResult["lastSaleDate"];
    stats: CleanMarketResult["stats"];
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
 * - New companies: insert company + company_msas
 * - Existing companies: add company_msas if this MSA is not yet associated
 */
export async function insertCompanies(
    params: InsertCompaniesParams
): Promise<InsertCompaniesResult> {
    const { cleaned, msa, cityCode } = params;
    const { records, companyNames, dateRange, lastSaleDate, stats } = cleaned;

    const msaId = await getOrCreateMsaId(msa);

    // Load all companies and their company_msas for this MSA
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

    let companiesInserted = 0;
    let companyMsasAdded = 0;

    for (const rawName of companyNames) {
        const storageName = normalizeCompanyNameForStorage(rawName);
        if (!storageName) continue;

        const compareKey = normalizeCompanyNameForComparison(storageName);
        if (!compareKey) continue;

        const existingCompany = companyByCompareKey.get(compareKey);

        if (!existingCompany) {
            // Company does not exist: insert company + company_msas
            try {
                const [inserted] = await db
                .insert(companies)
                .values({
                    companyName: storageName,
                    contactName: null,
                    contactEmail: null,
                    phoneNumber: null,
                    counties: [],
                    updatedAt: new Date(),
                })
                .onConflictDoNothing({ target: companies.companyName })
                .returning();

                if (inserted) {
                    companiesInserted++;
                    companyByCompareKey.set(compareKey, inserted);
                    await db
                        .insert(companyMsas)
                        .values({
                            companyId: inserted.id,
                            msaId,
                        })
                        .onConflictDoNothing({
                            target: [companyMsas.companyId, companyMsas.msaId],
                        });
                    companyMsasAdded++;
                } else {
                    // Conflict - another process inserted; fetch and add msa if needed
                    const [fetched] = await db
                        .select()
                        .from(companies)
                        .where(eq(companies.companyName, storageName))
                        .limit(1);

                    if (fetched) {
                        companyByCompareKey.set(compareKey, fetched);
                        
                        if (!companyIdsWithThisMsa.has(fetched.id)) {
                            await db
                                .insert(companyMsas)
                                .values({
                                companyId: fetched.id,
                                msaId,
                                })
                                .onConflictDoNothing({
                                target: [companyMsas.companyId, companyMsas.msaId],
                                });
                            companyMsasAdded++;
                            companyIdsWithThisMsa.add(fetched.id);
                        }
                    }
                }
            } catch (err) {
                console.error(
                    `[${cityCode} SYNC] Error inserting company ${storageName}:`,
                        err
                );
            }
        } else {
            // Company exists: add company_msas if this MSA not yet associated
            if (!companyIdsWithThisMsa.has(existingCompany.id)) {
                try {
                    await db
                        .insert(companyMsas)
                        .values({
                            companyId: existingCompany.id,
                            msaId,
                        })
                        .onConflictDoNothing({
                            target: [companyMsas.companyId, companyMsas.msaId],
                        });
                        
                    companyMsasAdded++;
                    companyIdsWithThisMsa.add(existingCompany.id);

                } catch (err) {
                    console.error(`[${cityCode} SYNC] Error adding company_msa for ${storageName}:`, err);
                }
            }
        }
    }

    console.log(`[${cityCode} SYNC] Companies: ${companiesInserted} new, ${companyMsasAdded} MSA associations added`);

    return {
        records,
        companyNames,
        dateRange,
        lastSaleDate,
        stats,
        companiesInserted,
        companyMsasAdded,
    };
}
