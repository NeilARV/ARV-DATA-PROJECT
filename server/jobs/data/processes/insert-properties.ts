import { db } from "server/storage";
import {
  properties,
  addresses,
  propertyTransactions,
  assessments,
  exemptions,
  parcels,
  schoolDistricts,
  structures,
  taxRecords,
  valuations,
  preForeclosures,
  lastSales,
  currentSales,
} from "@database/schemas/properties.schema";
import { eq } from "drizzle-orm";
import { normalizeDateToYMD } from "server/utils/normalization";
import type { PropertyWithStatus } from "./resolve-status";
import type { TransactionWithIds } from "./resolve-ids";
import type { SfrPropertyData } from "server/utils/propertyDataHelpers";
import {
  transformStructureData,
  transformAssessmentData,
  transformExemptionData,
  transformParcelData,
  transformSchoolDistrictData,
  transformTaxRecordData,
  transformValuationData,
  transformPreForeclosureData,
  transformLastSaleData,
  transformCurrentSaleData,
} from "server/utils/propertyDataHelpers";

export interface InsertPropertiesParams {
  properties: PropertyWithStatus[];
  msa: string;
  cityCode: string;
}

export interface InsertPropertiesResult {
  propertiesInserted: number;
  propertiesUpdated: number;
  transactionsInserted: number;
}

function getString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function toDecimal(value: string | number | null | undefined | unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") return String(value);
  const s = String(value).trim();
  return s === "" ? null : s;
}

function mapPropertyRow(
  item: PropertyWithStatus,
  msa: string
): typeof properties.$inferInsert {
  const p = item.property as Record<string, unknown>;
  return {
    sfrPropertyId: Number(p.property_id ?? 0),
    buyerId: (p.buyer_id as string) ?? null,
    sellerId: (p.seller_id as string) ?? null,
    propertyClassDescription: getString(p, "property_class_description") ?? null,
    propertyType: getString(p, "property_type") ?? null,
    vacant: getString(p, "vacant") ?? null,
    hoa: getString(p, "hoa") ?? null,
    ownerType: getString(p, "owner_type") ?? null,
    purchaseMethod: getString(p, "purchase_method") ?? null,
    listingStatus: getString(p, "listing_status") ?? null,
    status: (p.status as string) ?? "in-renovation",
    monthsOwned: typeof p.months_owned === "number" ? p.months_owned : null,
    msa: getString(p, "msa") ?? msa,
    county: getString(p, "county") ?? null,
    updatedAt: new Date(),
  };
}

function mapAddressRow(
  propertyId: string,
  item: PropertyWithStatus
): typeof addresses.$inferInsert | null {
  const p = item.property as Record<string, unknown>;
  const addr = p.address as Record<string, unknown> | undefined;
  if (!addr || typeof addr !== "object") return null;

  return {
    propertyId,
    formattedStreetAddress: getString(addr, "formatted_street_address") ?? null,
    streetNumber: getString(addr, "street_number") ?? null,
    streetSuffix: getString(addr, "street_suffix") ?? null,
    streetPreDirection: getString(addr, "street_pre_direction") ?? null,
    streetName: getString(addr, "street_name") ?? null,
    streetPostDirection: getString(addr, "street_post_direction") ?? null,
    unitType: getString(addr, "unit_type") ?? null,
    unitNumber: getString(addr, "unit_number") ?? null,
    city: getString(addr, "city") ?? null,
    county: getString(addr, "county") ?? null,
    state: getString(addr, "state") ?? null,
    zipCode: getString(addr, "zip_code") ?? null,
    zipPlusFourCode: getString(addr, "zip_plus_four_code") ?? null,
    carrierCode: getString(addr, "carrier_code") ?? null,
    latitude: toDecimal(addr.latitude) ?? null,
    longitude: toDecimal(addr.longitude) ?? null,
    geocodingAccuracy: getString(addr, "geocoding_accuracy") ?? null,
    censusTract: getString(addr, "census_tract") ?? null,
    censusBlock: getString(addr, "census_block") ?? null,
  };
}

function mapTransactionRow(
  propertyId: string,
  tx: TransactionWithIds
): typeof propertyTransactions.$inferInsert | null {
  const r = tx as Record<string, unknown>;
  const saleDate = normalizeDateToYMD(
    getString(r, "SALE_DATE", "sale_date") ?? undefined
  );
  const recordingDate = normalizeDateToYMD(
    getString(r, "RECORDING_DATE", "recording_date") ?? undefined
  );
  if (!saleDate || !recordingDate) return null;

  return {
    propertyId,
    sellerId: (tx.seller_id as string) ?? null,
    sellerName: getString(r, "SELLER1_NAME", "seller1_name") ?? null,
    buyerId: (tx.buyer_id as string) ?? null,
    buyerName: getString(r, "BUYER_BORROWER1_NAME", "buyer_borrower1_name") ?? null,
    apn: getString(r, "APN", "apn") ?? null,
    transactionType: getString(r, "TRANSACTION_TYPE", "transaction_type") ?? null,
    saleDate,
    recordingDate,
    salePrice: toDecimal(r.SALE_AMT ?? r.sale_amt) ?? null,
    firstMtgRecordingDate: normalizeDateToYMD(
      getString(r, "FIRST_MTG_RECORDING_DATE", "first_mtg_recording_date") ?? undefined
    ) ?? null,
    firstMtgAmount: toDecimal(r.FIRST_MTG_AMT ?? r.first_mtg_amt) ?? null,
    firstMtgLenderName: getString(r, "FIRST_MTG_LENDER_NAME", "first_mtg_lender_name") ?? null,
    firstMtgDueDate: normalizeDateToYMD(
      getString(r, "FIRST_MTG_DUE_DATE", "first_mtg_due_date") ?? undefined
    ) ?? null,
    updatedAt: new Date(),
  };
}

/**
 * Inserts or updates properties, their addresses, and transaction history.
 * Uses sfr_property_id for upsert; replaces transactions per property on each run.
 */
export async function insertProperties(
  params: InsertPropertiesParams
): Promise<InsertPropertiesResult> {
  const { properties: items, msa: defaultMsa, cityCode } = params;

  let propertiesInserted = 0;
  let propertiesUpdated = 0;
  let transactionsInserted = 0;

  for (const item of items) {
    const p = item.property as Record<string, unknown>;
    const sfrId = Number(p.property_id ?? 0);
    if (!sfrId) continue;

    const msa = getString(p, "msa") ?? defaultMsa;
    const propertyValues = mapPropertyRow(item, msa);

    const [existing] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.sfrPropertyId, sfrId))
      .limit(1);

    const [upserted] = await db
      .insert(properties)
      .values(propertyValues)
      .onConflictDoUpdate({
        target: properties.sfrPropertyId,
        set: {
          buyerId: propertyValues.buyerId,
          sellerId: propertyValues.sellerId,
          listingStatus: propertyValues.listingStatus,
          status: propertyValues.status,
          monthsOwned: propertyValues.monthsOwned,
          updatedAt: propertyValues.updatedAt,
        },
      })
      .returning({ id: properties.id });

    if (!upserted) continue;

    const propertyId = upserted.id;
    if (!existing) propertiesInserted += 1;
    else propertiesUpdated += 1;

    const addressRow = mapAddressRow(propertyId, item);
    if (addressRow) {
      await db
        .insert(addresses)
        .values(addressRow)
        .onConflictDoUpdate({
          target: addresses.propertyId,
          set: {
            formattedStreetAddress: addressRow.formattedStreetAddress,
            streetNumber: addressRow.streetNumber,
            streetSuffix: addressRow.streetSuffix,
            streetPreDirection: addressRow.streetPreDirection,
            streetName: addressRow.streetName,
            streetPostDirection: addressRow.streetPostDirection,
            unitType: addressRow.unitType,
            unitNumber: addressRow.unitNumber,
            city: addressRow.city,
            county: addressRow.county,
            state: addressRow.state,
            zipCode: addressRow.zipCode,
            zipPlusFourCode: addressRow.zipPlusFourCode,
            carrierCode: addressRow.carrierCode,
            latitude: addressRow.latitude,
            longitude: addressRow.longitude,
            geocodingAccuracy: addressRow.geocodingAccuracy,
            censusTract: addressRow.censusTract,
            censusBlock: addressRow.censusBlock,
          },
        });
    }

    // Persist all SFR batch lookup child data (assessments, structure, parcel, etc.)
    const propertyData = p as unknown as SfrPropertyData;
    const structureRow = transformStructureData(propertyId, propertyData);
    if (structureRow) {
      const { propertyId: _pid, ...structureSet } = structureRow;
      await db
        .insert(structures)
        .values(structureRow)
        .onConflictDoUpdate({
          target: structures.propertyId,
          set: structureSet,
        });
    }
    const assessmentRow = transformAssessmentData(propertyId, propertyData);
    if (assessmentRow) {
      await db
        .insert(assessments)
        .values(assessmentRow)
        .onConflictDoUpdate({
          target: [assessments.propertyId, assessments.assessedYear],
          set: {
            landValue: assessmentRow.landValue,
            improvementValue: assessmentRow.improvementValue,
            assessedValue: assessmentRow.assessedValue,
            marketValue: assessmentRow.marketValue,
          },
        });
    }
    const exemptionRow = transformExemptionData(propertyId, propertyData);
    if (exemptionRow) {
      const { propertyId: _eid, ...exemptionSet } = exemptionRow;
      await db
        .insert(exemptions)
        .values(exemptionRow)
        .onConflictDoUpdate({
          target: exemptions.propertyId,
          set: exemptionSet,
        });
    }
    const parcelRow = transformParcelData(propertyId, propertyData);
    if (parcelRow) {
      const { propertyId: _parid, ...parcelSet } = parcelRow;
      await db
        .insert(parcels)
        .values(parcelRow)
        .onConflictDoUpdate({
          target: parcels.propertyId,
          set: parcelSet,
        });
    }
    const schoolRow = transformSchoolDistrictData(propertyId, propertyData);
    if (schoolRow) {
      const { propertyId: _sid, ...schoolSet } = schoolRow;
      await db
        .insert(schoolDistricts)
        .values(schoolRow)
        .onConflictDoUpdate({
          target: schoolDistricts.propertyId,
          set: schoolSet,
        });
    }
    const taxRow = transformTaxRecordData(propertyId, propertyData);
    if (taxRow) {
      await db
        .insert(taxRecords)
        .values(taxRow)
        .onConflictDoUpdate({
          target: [taxRecords.propertyId, taxRecords.taxYear],
          set: {
            taxAmount: taxRow.taxAmount,
            taxDelinquentYear: taxRow.taxDelinquentYear,
            taxRateCodeArea: taxRow.taxRateCodeArea,
          },
        });
    }
    const valuationRow = transformValuationData(propertyId, propertyData);
    if (valuationRow) {
      await db
        .insert(valuations)
        .values(valuationRow)
        .onConflictDoUpdate({
          target: [valuations.propertyId, valuations.valuationDate],
          set: {
            value: valuationRow.value,
            high: valuationRow.high,
            low: valuationRow.low,
            forecastStandardDeviation: valuationRow.forecastStandardDeviation,
          },
        });
    }
    const preForeclosureRow = transformPreForeclosureData(propertyId, propertyData);
    if (preForeclosureRow) {
      const { propertyId: _pfid, ...preForeclosureSet } = preForeclosureRow;
      await db
        .insert(preForeclosures)
        .values(preForeclosureRow)
        .onConflictDoUpdate({
          target: preForeclosures.propertyId,
          set: preForeclosureSet,
        });
    }
    const lastSaleRow = transformLastSaleData(propertyId, propertyData);
    if (lastSaleRow) {
      const { propertyId: _lsid, ...lastSaleSet } = lastSaleRow;
      await db
        .insert(lastSales)
        .values(lastSaleRow)
        .onConflictDoUpdate({
          target: lastSales.propertyId,
          set: lastSaleSet,
        });
    }
    const currentSaleRow = transformCurrentSaleData(propertyId, propertyData);
    if (currentSaleRow) {
      const { propertyId: _csid, ...currentSaleSet } = currentSaleRow;
      await db
        .insert(currentSales)
        .values(currentSaleRow)
        .onConflictDoUpdate({
          target: currentSales.propertyId,
          set: currentSaleSet,
        });
    }

    await db
      .delete(propertyTransactions)
      .where(eq(propertyTransactions.propertyId, propertyId));

    const transactions = item.transactions ?? [];
    for (const tx of transactions) {
      const row = mapTransactionRow(propertyId, tx);
      if (row) {
        await db.insert(propertyTransactions).values(row);
        transactionsInserted += 1;
      }
    }
  }

  console.log(
    `[${cityCode} SYNC] Properties: ${propertiesInserted} inserted, ${propertiesUpdated} updated; transactions: ${transactionsInserted} inserted`
  );

  return {
    propertiesInserted,
    propertiesUpdated,
    transactionsInserted,
  };
}
