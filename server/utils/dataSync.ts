/**
 * Data Sync V2
 *
 * Syncs SFR property data from the buyers/market API into the database.
 * Designed to be run per MSA from jobs, with resumable pagination and batch processing.
 */

import { db } from "server/storage";
import {
  properties,
  propertyTransactions,
} from "../../database/schemas/properties.schema";
import { companies } from "../../database/schemas/companies.schema";
import { sfrSyncState } from "../../database/schemas/sync.schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  normalizeDateToYMD,
  normalizeCountyName,
  normalizePropertyType,
  normalizeCompanyNameForStorage,
  normalizeCompanyNameForComparison,
} from "server/utils/normalization";
import {
  isFlippingCompany,
  findAndCacheCompany,
  addCountiesToCompanyIfNeeded,
} from "server/utils/dataSyncHelpers";
import {
  createPropertyDataCollectors,
  collectPropertyData,
  batchInsertPropertyData,
  updatePropertyRelatedDataForExisting,
  addPropertyOneToManyDataIfNew,
  SfrPropertyData,
} from "server/utils/propertyDataHelpers";

const DEFAULT_START_DATE = "2025-12-03";
const BATCH_SIZE = 100;

export interface SyncMSAV2Params {
  msa: string;
  cityCode: string;
  API_KEY: string;
  API_URL: string;
  today: string;
  excludedAddresses?: string[];
}

export interface SyncMSAV2Result {
  success: boolean;
  msa: string;
  totalProcessed: number;
  totalInserted: number;
  totalUpdated: number;
  dateRange: { from: string; to: string };
  lastSaleDate: string | null;
}

/**
 * Sync SFR data for a single MSA.
 * 1. Reads last_sale_date from sfr_sync_state
 * 2. Paginates /buyers/market, persisting last_sale_date after each page
 * 3. Filters to corporate buyer or seller (trusts = individuals)
 * 4. Batch fetches property details via /properties/batch
 * 5. Inserts new properties, updates existing (by sfr_property_id)
 */
export async function syncMSAV2(params: SyncMSAV2Params): Promise<SyncMSAV2Result> {
  const { msa, cityCode, API_KEY, API_URL, today, excludedAddresses = [] } = params;

  let minSaleDate: string = "";
  let syncStateId: number | null = null;
  let initialTotalSynced = 0;
  let syncState: Array<{ id: number; msa: string; lastSaleDate: Date | string | null; totalRecordsSynced: number | null }> = [];

  let totalProcessed = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let boundaryDate: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Read from sfr_sync_state to get last_sale_date
    // -------------------------------------------------------------------------
    syncState = await db
      .select()
      .from(sfrSyncState)
      .where(eq(sfrSyncState.msa, msa))
      .limit(1);

    if (syncState.length === 0) {
      minSaleDate = DEFAULT_START_DATE;
      const [newSyncState] = await db
        .insert(sfrSyncState)
        .values({
          msa,
          lastSaleDate: null,
          totalRecordsSynced: 0,
        })
        .returning();
      syncStateId = newSyncState.id;
      initialTotalSynced = 0;
    } else {
      const lastSale = syncState[0].lastSaleDate;
      minSaleDate = normalizeDateToYMD(lastSale) || DEFAULT_START_DATE;
      syncStateId = syncState[0].id;
      initialTotalSynced = syncState[0].totalRecordsSynced || 0;
    }

    console.log(`[${cityCode} SYNC V2] Starting sync for ${msa} from sale_date ${minSaleDate} to ${today}`);

    // Load all companies into memory for fast lookup
    const allCompanies = await db.select().from(companies);
    const contactsMap = new Map<string, (typeof allCompanies)[0]>();
    for (const company of allCompanies) {
      const normalizedKey = normalizeCompanyNameForComparison(company.companyName);
      if (normalizedKey) {
        contactsMap.set(normalizedKey, company);
      }
    }
    console.log(`[${cityCode} SYNC V2] Loaded ${contactsMap.size} companies into cache`);

    // -------------------------------------------------------------------------
    // STEP 2: Paginate /buyers/market, persist last_sale_date after each call
    // -------------------------------------------------------------------------
    const addressesSet = new Set<string>();
    /** Maps address -> all records. Same property can appear multiple times (e.g. acquisition + flip). */
    const recordsMap = new Map<string, Array<{ record: Record<string, unknown>; recordingDate: string }>>();

    let currentMinDate = minSaleDate;
    let pageNum = 1;
    let shouldContinue = true;

    while (shouldContinue) {
      const buyersMarketParams = new URLSearchParams({
        msa,
        sales_date_min: currentMinDate,
        sales_date_max: today,
        page_size: String(BATCH_SIZE),
        sort: "sale_date",
      });

      const response = await fetch(`${API_URL}/buyers/market?${buyersMarketParams.toString()}`, {
        method: "GET",
        headers: { "X-API-TOKEN": API_KEY },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${cityCode} SYNC V2] Buyers market API error on page ${pageNum}: ${response.status} - ${errorText}`);
        shouldContinue = false;
        break;
      }

      const buyersMarketData = await response.json();

      if (!buyersMarketData || !Array.isArray(buyersMarketData) || buyersMarketData.length === 0) {
        console.log(`[${cityCode} SYNC V2] No more data on page ${pageNum}, stopping`);
        shouldContinue = false;
        break;
      }

      console.log(`[${cityCode} SYNC V2] Fetched page ${pageNum} (from ${currentMinDate}) with ${buyersMarketData.length} records`);

      // -----------------------------------------------------------------------
      // STEP 3 & 4: Corporate filter, add addresses to list
      // -----------------------------------------------------------------------
      for (const record of buyersMarketData as Record<string, unknown>[]) {
        const buyerName = (record.buyerName as string) || "";
        const sellerName = (record.sellerName as string) || "";
        const buyerOwnershipCode = (record.buyerOwnershipCode as string) || null;

        const isBuyerCorporate = isFlippingCompany(buyerName, buyerOwnershipCode);
        const isSellerCorporate = isFlippingCompany(sellerName, null);

        if (!isBuyerCorporate && !isSellerCorporate) {
          continue;
        }

        const address = record.address as string;
        const city = record.city as string;
        const state = record.state as string;

        if (!address || !city || !state) continue;

        const addressStr = `${address}, ${city}, ${state}`;

        const shouldExclude = excludedAddresses.some((excluded) => {
          const excludedLower = excluded.toLowerCase().trim();
          const recordAddressLower = String(address).toLowerCase().trim();
          return recordAddressLower.includes(excludedLower) || excludedLower.includes(recordAddressLower);
        });

        if (shouldExclude) {
          console.log(`[${cityCode} SYNC V2] Skipping excluded address: ${addressStr}`);
          continue;
        }

        const recordingDateStr = normalizeDateToYMD(record.recordingDate as string) || "";

        const existing = recordsMap.get(addressStr);
        if (existing) {
          existing.push({ record, recordingDate: recordingDateStr });
        } else {
          addressesSet.add(addressStr);
          recordsMap.set(addressStr, [{ record, recordingDate: recordingDateStr }]);
        }
      }

      const lastRecord = buyersMarketData[buyersMarketData.length - 1] as Record<string, unknown>;
      const pageLastSaleDate = lastRecord ? normalizeDateToYMD(lastRecord.saleDate as string) : null;

      if (pageLastSaleDate && (!boundaryDate || pageLastSaleDate > boundaryDate)) {
        boundaryDate = pageLastSaleDate;
      }

      // Persist last_sale_date after each /buyers/market call (furthest sale_date minus 1)
      if (pageLastSaleDate && syncStateId) {
        const saleDateToSet = normalizeDateToYMD(pageLastSaleDate, { subtractDays: 1 });
        await db
          .update(sfrSyncState)
          .set({
            lastSaleDate: saleDateToSet,
            lastSyncAt: sql`now()`,
          })
          .where(eq(sfrSyncState.id, syncStateId));
        console.log(`[${cityCode} SYNC V2] Persisted last_sale_date: ${saleDateToSet} after page ${pageNum}`);
      }

      if (buyersMarketData.length < BATCH_SIZE) {
        shouldContinue = false;
      } else if (pageLastSaleDate) {
        currentMinDate = pageLastSaleDate;
      }

      pageNum++;
    }

    const addressesArray = Array.from(addressesSet);
    console.log(`[${cityCode} SYNC V2] Collected ${addressesArray.length} unique addresses for batch lookup`);

    if (addressesArray.length === 0) {
      const saleDateToSet = boundaryDate ? normalizeDateToYMD(boundaryDate, { subtractDays: 1 }) : null;
      if (syncStateId) {
        await db
          .update(sfrSyncState)
          .set({
            lastSaleDate: saleDateToSet,
            totalRecordsSynced: initialTotalSynced,
            lastSyncAt: sql`now()`,
          })
          .where(eq(sfrSyncState.id, syncStateId));
      }
      return {
        success: true,
        msa,
        totalProcessed: 0,
        totalInserted: 0,
        totalUpdated: 0,
        dateRange: { from: minSaleDate, to: boundaryDate || today },
        lastSaleDate: saleDateToSet,
      };
    }

    // -------------------------------------------------------------------------
    // STEP 5: Batch fetch via /properties/batch
    // -------------------------------------------------------------------------
    const BATCH_FETCH_SIZE = 100;

    for (let i = 0; i < addressesArray.length; i += BATCH_FETCH_SIZE) {
      const batchDataCollectors = createPropertyDataCollectors();
      const batchAddresses = addressesArray.slice(i, i + BATCH_FETCH_SIZE);
      const batchNum = Math.floor(i / BATCH_FETCH_SIZE) + 1;
      const totalBatches = Math.ceil(addressesArray.length / BATCH_FETCH_SIZE);

      console.log(`[${cityCode} SYNC V2] Fetching batch ${batchNum}/${totalBatches} (${batchAddresses.length} addresses)`);

      const addressesParam = batchAddresses.join("|");
      const batchResponse = await fetch(
        `${API_URL}/properties/batch?addresses=${encodeURIComponent(addressesParam)}`,
        {
          method: "GET",
          headers: { "X-API-TOKEN": API_KEY },
        }
      );

      if (!batchResponse.ok) {
        const errorText = await batchResponse.text();
        console.error(`[${cityCode} SYNC V2] Batch API error on batch ${batchNum}:`, errorText);
        continue;
      }

      const batchData = (await batchResponse.json()) as Array<{ address?: string; property?: Record<string, unknown>; error?: unknown }>;

      if (!batchData || !Array.isArray(batchData)) {
        console.warn(`[${cityCode} SYNC V2] Invalid batch response format, skipping batch ${batchNum}`);
        continue;
      }

      // -----------------------------------------------------------------------
      // STEP 6: Insert or update properties (prevent duplicates by sfr_property_id)
      // Collect companies for batch insert
      // -----------------------------------------------------------------------
      const validBatchItems: Array<{
        batchItem: (typeof batchData)[0];
        propertyData: Record<string, unknown>;
        recordInfo: { record: Record<string, unknown>; recordingDate: string };
        normalizedCounty: string | null;
        isBuyerCorporate: boolean;
        isSellerCorporate: boolean;
      }> = [];
      const companyToCountiesMap = new Map<string, Set<string>>();

      for (const batchItem of batchData) {
        if (batchItem.error || !batchItem.property) continue;

        const batchAddress = batchItem.address;
        if (!batchAddress) continue;

        const records = recordsMap.get(batchAddress);
        if (!records || records.length === 0) continue;

        const propertyData = batchItem.property as Record<string, unknown>;
        const sfrPropertyId = propertyData.property_id as number;
        if (!sfrPropertyId) continue;

        const normalizedCounty = normalizeCountyName(propertyData.county as string);

        for (const recordInfo of records) {
          const buyerName = (recordInfo.record.buyerName as string) || "";
          const sellerName = (recordInfo.record.sellerName as string) || "";
          const buyerOwnershipCode = (recordInfo.record.buyerOwnershipCode as string) || null;

          const isBuyerCorporate = isFlippingCompany(buyerName, buyerOwnershipCode);
          const isSellerCorporate = isFlippingCompany(sellerName, null);

          if (!isBuyerCorporate && !isSellerCorporate) continue;

          validBatchItems.push({
            batchItem,
            propertyData,
            recordInfo,
            normalizedCounty,
            isBuyerCorporate,
            isSellerCorporate,
          });

          // Track companies -> counties for batch insert
          if (isBuyerCorporate && normalizedCounty) {
            const storageName = normalizeCompanyNameForStorage(buyerName);
            const compareKey = storageName ? normalizeCompanyNameForComparison(storageName) : null;
            if (compareKey) {
              if (!companyToCountiesMap.has(compareKey)) {
                companyToCountiesMap.set(compareKey, new Set());
              }
              companyToCountiesMap.get(compareKey)!.add(normalizedCounty);
            }
          }
          if (isSellerCorporate && normalizedCounty) {
            const storageName = normalizeCompanyNameForStorage(sellerName);
            const compareKey = storageName ? normalizeCompanyNameForComparison(storageName) : null;
            if (compareKey) {
              if (!companyToCountiesMap.has(compareKey)) {
                companyToCountiesMap.set(compareKey, new Set());
              }
              companyToCountiesMap.get(compareKey)!.add(normalizedCounty);
            }
          }
        }
      }

      // Batch insert new companies, resolve existing ones
      const uniqueCompaniesToInsert: Array<{
        companyName: string;
        normalizedForCompare: string;
        counties: string[];
      }> = [];

      for (const [normalizedName, countiesSet] of Array.from(companyToCountiesMap.entries())) {
        const existingCompany = contactsMap.get(normalizedName);
        if (!existingCompany) {
          const compareKey = normalizeCompanyNameForComparison(normalizedName);
          const storageName = compareKey ? normalizeCompanyNameForStorage(compareKey) : null;
          if (!storageName) continue;

          const dbCompany = await findAndCacheCompany(
            storageName,
            normalizedName,
            contactsMap,
            cityCode,
            countiesSet
          );
          if (!dbCompany) {
            if (!uniqueCompaniesToInsert.some((c) => c.normalizedForCompare === normalizedName)) {
              uniqueCompaniesToInsert.push({
                companyName: storageName,
                normalizedForCompare: normalizedName,
                counties: Array.from(countiesSet),
              });
            }
          }
        } else {
          await addCountiesToCompanyIfNeeded(existingCompany, countiesSet);
        }
      }

      if (uniqueCompaniesToInsert.length > 0) {
        try {
          const newCompanies = await db
            .insert(companies)
            .values(
              uniqueCompaniesToInsert.map((c) => ({
                companyName: c.companyName,
                contactName: null,
                contactEmail: null,
                phoneNumber: null,
                counties: c.counties,
                updatedAt: new Date(),
              }))
            )
            .onConflictDoNothing({ target: companies.companyName })
            .returning();
          for (const company of newCompanies) {
            if (company) {
              const match = uniqueCompaniesToInsert.find(
                (c) => c.companyName === company.companyName
              );
              if (match) contactsMap.set(match.normalizedForCompare, company);
            }
          }
          for (const c of uniqueCompaniesToInsert) {
            if (!contactsMap.has(c.normalizedForCompare)) {
              await findAndCacheCompany(c.companyName, c.normalizedForCompare, contactsMap, cityCode, c.counties);
            }
          }
          console.log(`[${cityCode} SYNC V2] Processed ${uniqueCompaniesToInsert.length} companies (${newCompanies.length} new)`);
        } catch (companyError: unknown) {
          console.error(`[${cityCode} SYNC V2] Error inserting companies:`, companyError);
          for (const c of uniqueCompaniesToInsert) {
            await findAndCacheCompany(c.companyName, c.normalizedForCompare, contactsMap, cityCode, c.counties);
          }
        }
      }

      const sfrPropertyIds = validBatchItems.map((v) => Number(v.propertyData.property_id));
      const existingProps =
        sfrPropertyIds.length > 0
          ? await db.select().from(properties).where(inArray(properties.sfrPropertyId, sfrPropertyIds))
          : [];

      const existingBySfrId = new Map(existingProps.map((p) => [p.sfrPropertyId, p]));

      const toInsert: typeof properties.$inferInsert[] = [];
      const toUpdate: Array<{
        id: string;
        data: Partial<typeof properties.$inferInsert>;
        propertyData: SfrPropertyData;
        normalizedCounty: string | null;
        recordInfo: { record: Record<string, unknown>; recordingDate: string };
      }> = [];

      // Property upsert: one per sfr_property_id, use record with latest recordingDate
      const propertyUpsertBySfrId = new Map<
        number,
        (typeof validBatchItems)[0]
      >();
      for (const item of validBatchItems) {
        const sfrId = Number(item.propertyData.property_id);
        const existing = propertyUpsertBySfrId.get(sfrId);
        if (!existing || item.recordInfo.recordingDate > existing.recordInfo.recordingDate) {
          propertyUpsertBySfrId.set(sfrId, item);
        }
      }

      for (const { propertyData, recordInfo, normalizedCounty, isBuyerCorporate, isSellerCorporate } of Array.from(
        propertyUpsertBySfrId.values()
      )) {
        totalProcessed++;
        const sfrPropertyId = Number(propertyData.property_id);

        const buyerName = (recordInfo.record.buyerName as string) || "";
        const sellerName = (recordInfo.record.sellerName as string) || "";

        let buyerId: string | null = null;
        if (isBuyerCorporate) {
          const storageName = normalizeCompanyNameForStorage(buyerName);
          const compareKey = storageName ? normalizeCompanyNameForComparison(storageName) : null;
          const company = compareKey ? contactsMap.get(compareKey) : null;
          if (company) buyerId = company.id;
        }

        let sellerId: string | null = null;
        if (isSellerCorporate) {
          const storageName = normalizeCompanyNameForStorage(sellerName);
          const compareKey = storageName ? normalizeCompanyNameForComparison(storageName) : null;
          const company = compareKey ? contactsMap.get(compareKey) : null;
          if (company) sellerId = company.id;
        }

        // company_id & property_owner_id = buyer_id (when buyer is corporate)
        const companyId = buyerId;
        const propertyOwnerId = buyerId;

        const propertyListingStatus = ((propertyData.listing_status as string) || "").trim().toLowerCase();
        const listingStatus =
          propertyListingStatus === "on market" || propertyListingStatus === "on_market" ? "on-market" : "off-market";

        // Status logic:
        // 1. If seller is company and buyer is individual/trust → sold (company sold the property)
        // 2. Else if SFR returns On Market → on-market
        // 3. Else if SFR returns Off Market → in-renovation
        let status: string;
        if (sellerId !== null && buyerId === null) {
          status = "sold";
        } else if (propertyListingStatus === "on market" || propertyListingStatus === "on_market") {
          status = "on-market";
        } else {
          status = "in-renovation";
        }

        const propertyRecord = {
          sfrPropertyId,
          companyId,
          propertyOwnerId,
          buyerId,
          sellerId,
          propertyClassDescription: (propertyData.property_class_description as string) || null,
          propertyType: normalizePropertyType(propertyData.property_type as string) || null,
          vacant: propertyData.vacant != null ? String(propertyData.vacant) : null,
          hoa: propertyData.hoa ? String(propertyData.hoa) : null,
          ownerType: (propertyData.owner_type as string) || null,
          purchaseMethod: (propertyData.purchase_method as string) || null,
          listingStatus,
          status,
          monthsOwned: (propertyData.months_owned as number) ?? null,
          msa: (propertyData.msa as string) || msa || null,
          county: normalizedCounty,
        };

        const existing = existingBySfrId.get(sfrPropertyId);

        if (existing) {
          toUpdate.push({
            id: existing.id,
            data: propertyRecord,
            propertyData: propertyData as SfrPropertyData,
            normalizedCounty,
            recordInfo,
          });
        } else {
          toInsert.push(propertyRecord);
        }
      }

      // Batch update existing properties and their related data
      for (const { id, data, propertyData: propData, normalizedCounty: county, recordInfo: recInfo } of toUpdate) {
        await db
          .update(properties)
          .set({ ...data, updatedAt: sql`now()` })
          .where(eq(properties.id, id));

        const recordingDateFromRecord = normalizeDateToYMD(recInfo.record.recordingDate as string);
        await updatePropertyRelatedDataForExisting(id, propData, county, recordingDateFromRecord);
        await addPropertyOneToManyDataIfNew(id, propData, county, recordingDateFromRecord);
      }
      totalUpdated += toUpdate.length;

      // Batch insert new
      let inserted: Array<{ id: string; sfrPropertyId: number }> = [];
      if (toInsert.length > 0) {
        inserted = await db.insert(properties).values(toInsert).returning();
        totalInserted += inserted.length;
      }

      // Insert related data for new properties only
      for (const insertedProp of inserted) {
        const item = validBatchItems.find(
          (v) => Number(v.propertyData.property_id) === insertedProp.sfrPropertyId
        );
        if (!item) continue;

        const recordingDateFromRecord = normalizeDateToYMD(item.recordInfo.record.recordingDate as string);
        collectPropertyData(
          batchDataCollectors,
          insertedProp.id,
          item.propertyData as SfrPropertyData,
          item.normalizedCounty,
          recordingDateFromRecord
        );
      }

      await batchInsertPropertyData(batchDataCollectors);

      // -----------------------------------------------------------------------
      // Insert property_transactions: one per /buyers/market record (same property can have multiple sales)
      // Use recordingDate for transaction_date to handle same-day flips (e.g. saleDate 2026-01-20 for both, recordingDate 2026-01-21 vs 2026-01-26)
      // -----------------------------------------------------------------------
      const transactionsToInsert: Array<{
        propertyId: string;
        transactionDate: string;
        buyerId: string | null;
        sellerId: string | null;
        transactionType: string;
        salePrice: string | null;
        mtgType: string | null;
        mtgAmount: string | null;
        buyerName: string | null;
        sellerName: string | null;
        notes: string | null;
      }> = [];

      const sfrIdToPropertyId = new Map<number, string>();
      for (const u of toUpdate) {
        sfrIdToPropertyId.set(Number(u.propertyData.property_id), u.id);
      }
      for (const p of inserted) {
        sfrIdToPropertyId.set(p.sfrPropertyId, p.id);
      }

      for (const item of validBatchItems) {
        const sfrPropertyId = Number(item.propertyData.property_id);
        const propertyId = sfrIdToPropertyId.get(sfrPropertyId);
        if (!propertyId) continue;

        const { propertyData, recordInfo, isBuyerCorporate, isSellerCorporate } = item;
        const rec = recordInfo.record;

        // Use recordingDate - uniquely identifies each deed; same-day flips share saleDate but have different recordingDates
        const transactionDate = normalizeDateToYMD(recordInfo.recordingDate);
        if (!transactionDate) continue;

        const buyerName = (rec.buyerName as string) || "";
        const sellerName = (rec.sellerName as string) || "";

        let txBuyerId: string | null = null;
        if (isBuyerCorporate) {
          const storageName = normalizeCompanyNameForStorage(buyerName);
          const compareKey = storageName ? normalizeCompanyNameForComparison(storageName) : null;
          const company = compareKey ? contactsMap.get(compareKey) : null;
          if (company) txBuyerId = company.id;
        }

        let txSellerId: string | null = null;
        if (isSellerCorporate) {
          const storageName = normalizeCompanyNameForStorage(sellerName);
          const compareKey = storageName ? normalizeCompanyNameForComparison(storageName) : null;
          const company = compareKey ? contactsMap.get(compareKey) : null;
          if (company) txSellerId = company.id;
        }

        let transactionType: string;
        if (isBuyerCorporate && !isSellerCorporate) {
          transactionType = "acquisition";
        } else if (!isBuyerCorporate && isSellerCorporate) {
          transactionType = "sale";
        } else if (isBuyerCorporate && isSellerCorporate) {
          transactionType = "company-to-company";
        } else {
          continue;
        }

        const lastSale = (propertyData.last_sale || propertyData.lastSale) as Record<string, unknown> | undefined;
        const salePrice =
          rec.saleValue != null
            ? String(rec.saleValue)
            : rec.salePrice != null
              ? String(rec.salePrice)
              : rec.price != null
                ? String(rec.price)
                : lastSale?.price != null
                  ? String(lastSale.price)
                  : null;
        const notes =
          (rec.document_type as string) ||
          (lastSale?.document_type ? `Document Type: ${lastSale.document_type}` : null);

        if (txBuyerId === null && txSellerId === null) {
          console.log(`[${cityCode} SYNC V2] Skipping transaction - no company IDs resolved for property ${propertyId}`);
          continue;
        }

        transactionsToInsert.push({
          propertyId,
          transactionDate,
          buyerId: txBuyerId,
          sellerId: txSellerId,
          transactionType,
          salePrice,
          mtgType: (lastSale?.mtg_type as string) || null,
          mtgAmount: lastSale?.mtg_amount != null ? String(lastSale.mtg_amount) : null,
          buyerName: buyerName ? normalizeCompanyNameForStorage(buyerName) : null,
          sellerName: sellerName ? normalizeCompanyNameForStorage(sellerName) : null,
          notes,
        });
      }

      if (transactionsToInsert.length > 0) {
        const propertyIds = Array.from(new Set(transactionsToInsert.map((t) => t.propertyId)));
        const existingTx = await db
          .select({
            propertyId: propertyTransactions.propertyId,
            transactionDate: propertyTransactions.transactionDate,
            transactionType: propertyTransactions.transactionType,
            buyerId: propertyTransactions.buyerId,
            sellerId: propertyTransactions.sellerId,
          })
          .from(propertyTransactions)
          .where(inArray(propertyTransactions.propertyId, propertyIds));

          const existingKeys = new Set(existingTx.map((e) => 
            `${e.propertyId}-${e.transactionDate}-${e.transactionType}`
          ));
          const newTransactions = transactionsToInsert.filter(
            (t) => !existingKeys.has(`${t.propertyId}-${t.transactionDate}-${t.transactionType}`)
          );

        if (newTransactions.length > 0) {
          await db.insert(propertyTransactions).values(
            newTransactions.map((t) => ({
              propertyId: t.propertyId,
              companyId: t.transactionType === "sale" ? t.sellerId : t.buyerId,
              buyerId: t.buyerId,
              sellerId: t.sellerId,
              transactionType: t.transactionType,
              transactionDate: t.transactionDate,
              salePrice: t.salePrice,
              mtgType: t.mtgType,
              mtgAmount: t.mtgAmount,
              buyerName: t.buyerName,
              sellerName: t.sellerName,
              notes: t.notes,
            }))
          );
          console.log(`[${cityCode} SYNC V2] Inserted ${newTransactions.length} property transactions`);
        }
      }
    }

    // Final sync state update
    const saleDateToSet = boundaryDate ? normalizeDateToYMD(boundaryDate, { subtractDays: 1 }) : null;
    if (syncStateId) {
      await db
        .update(sfrSyncState)
        .set({
          lastSaleDate: saleDateToSet,
          totalRecordsSynced: initialTotalSynced + totalProcessed,
          lastSyncAt: sql`now()`,
        })
        .where(eq(sfrSyncState.id, syncStateId));
    }

    console.log(
      `[${cityCode} SYNC V2] Complete for ${msa}: ${totalProcessed} processed, ${totalInserted} inserted, ${totalUpdated} updated`
    );

    return {
      success: true,
      msa,
      totalProcessed,
      totalInserted,
      totalUpdated,
      dateRange: { from: minSaleDate, to: boundaryDate || today },
      lastSaleDate: saleDateToSet,
    };
  } catch (error) {
    console.error(`[${cityCode} SYNC V2] Error syncing ${msa}:`, error);
    throw error;
  }
}
