/**
 * Property Data Helpers
 * 
 * Helper functions for transforming SFR API property data to database schema format
 * and inserting property-related data. Used by both single property creation and batch sync.
 */

import { db } from "server/storage";
import { eq } from "drizzle-orm";
import {
    addresses,
    structures,
    assessments,
    exemptions,
    parcels,
    schoolDistricts,
    taxRecords,
    valuations,
    preForeclosures,
    lastSales,
    currentSales,
} from "../../database/schemas/properties.schema";
import {
    normalizeAddress,
    normalizeToTitleCase,
    normalizeSubdivision,
    normalizeCompanyNameForStorage,
    normalizeDateToYMD,
} from "./normalization";

// ============================================================================
// TYPES
// ============================================================================

/** SFR API property data structure (partial - covers fields we use) */
export interface SfrPropertyData {
    property_id?: string | number;
    property_class_description?: string;
    property_type?: string;
    vacant?: boolean | string | null;
    hoa?: boolean | string;
    owner_type?: string;
    purchase_method?: string;
    listing_status?: string;
    months_owned?: number;
    msa?: string;
    county?: string;
    assessed_year?: number;
    market_year?: number | null;
    tax_year?: number;
    tax_amount?: number;
    tax_delinquent_year?: number | null;
    tax_rate_code_area?: string;
    school_tax_district_1?: string;
    school_tax_district_2?: string | null;
    school_tax_district_3?: string | null;
    school_district_name?: string;
    address?: {
        formatted_street_address?: string;
        street_number?: string;
        street_suffix?: string | null;
        street_pre_direction?: string | null;
        street_name?: string;
        street_post_direction?: string | null;
        unit_type?: string | null;
        unit_number?: string | null;
        city?: string;
        state?: string;
        zip_code?: string;
        zip_plus_four_code?: string;
        carrier_code?: string;
        latitude?: number | string;
        longitude?: number | string;
        geocoding_accuracy?: string;
        census_tract?: string;
        census_block?: string;
    };
    structure?: {
        total_area_sq_ft?: number;
        year_built?: number;
        effective_year_built?: number;
        beds_count?: number;
        rooms_count?: number;
        baths?: number | string;
        partial_baths_count?: number;
        basement_type?: string | null;
        condition?: string;
        construction_type?: string | null;
        exterior_wall_type?: string | null;
        fireplaces?: number;
        heating_type?: string;
        heating_fuel_type?: string | null;
        parking_spaces_count?: number;
        pool_type?: string | null;
        quality?: string;
        roof_material_type?: string | null;
        roof_style_type?: string | null;
        sewer_type?: string | null;
        stories?: number | string;  // Can be number or string like "1 Story"
        units_count?: number | null;
        water_type?: string | null;
        living_area_sqft?: number;
        ac_description?: string | null;
        garage_description?: string;
        building_class_description?: string | null;
        sqft_description?: string;
    };
    assessments?: {
        land_value?: number | null;
        improvement_value?: number | null;
        assessed_value?: number;
        market_value?: number | null;
    };
    exemptions?: {
        homeowner?: boolean | null;
        veteran?: boolean | null;
        disabled?: boolean | null;
        widow?: boolean | null;
        senior?: boolean | null;
        school?: boolean | null;
        religious?: boolean | null;
        welfare?: boolean | null;
        public?: boolean | null;
        cemetery?: boolean | null;
        hospital?: boolean | null;
        library?: boolean | null;
    };
    parcel?: {
        apn_original?: string;
        fips_code?: string;
        frontage_ft?: number | string;  // Can be string like "730"
        depth_ft?: number | string;     // Can be string like "1050"
        area_acres?: number | string;   // Can be string like "0000000175"
        area_sq_ft?: number;
        zoning?: string;
        county_land_use_code?: string;
        lot_number?: string;
        subdivision?: string;
        section_township_range?: string | null;
        legal_description?: string;
        state_land_use_code?: string | null;
        building_count?: number;
    };
    valuation?: {
        value?: number;
        high?: number;
        low?: number;
        forecast_standard_deviation?: number;
        date?: string;
    };
    pre_foreclosure?: {
        flag?: boolean;
        ind?: string;
        reason?: string;
        doc_type?: string;
        recording_date?: string;
    };
    last_sale?: SfrSaleData;
    lastSale?: SfrSaleData;
    current_sale?: SfrCurrentSaleData;
    currentSale?: SfrCurrentSaleData;
    owner?: {
        // Full owner info from SFR API
        owner_occupied?: boolean;
        name?: string;
        second_name?: string | null;
        formatted_street_address?: string;
        city?: string;
        state?: string;
        zip_code?: string;
        zip_plus_four_code?: string | null;
        corporate_owner?: boolean;
        care_of_name?: string | null;
        // Contact info (may be in some responses)
        contact_email?: string;
        phone?: string;
    };
}

interface SfrSaleData {
    date?: string;
    recording_date?: string;
    price?: number;
    document_type?: string;
    mtg_amount?: number;
    mtg_type?: string;
    lender?: string;
    mtg_interest_rate?: number | string;  // Can be string like " 00617"
    mtg_term_months?: number | string;    // Can be string like "12"
}

interface SfrCurrentSaleData {
    doc_num?: string;
    buyer_1?: string;
    buyer1?: string;
    buyer_2?: string;
    buyer2?: string;
    seller_1?: string;
    seller1?: string;
    seller_2?: string;
    seller2?: string;
}

// ============================================================================
// TRANSFORMATION FUNCTIONS
// These functions transform SFR API data to database record format
// ============================================================================

export function transformAddressData(propertyId: string, propertyData: SfrPropertyData, normalizedCounty: string | null) {
    const addr = propertyData.address;
    if (!addr) return null;

    return {
        propertyId,
        formattedStreetAddress: normalizeAddress(addr.formatted_street_address) || null,
        streetNumber: addr.street_number || null,
        streetSuffix: addr.street_suffix || null,
        streetPreDirection: addr.street_pre_direction || null,
        streetName: normalizeToTitleCase(addr.street_name) || null,
        streetPostDirection: addr.street_post_direction || null,
        unitType: addr.unit_type || null,
        unitNumber: addr.unit_number || null,
        city: normalizeToTitleCase(addr.city) || null,
        county: normalizedCounty,
        state: addr.state || null,
        zipCode: addr.zip_code || null,
        zipPlusFourCode: addr.zip_plus_four_code || null,
        carrierCode: addr.carrier_code || null,
        latitude: addr.latitude ? String(addr.latitude) : null,
        longitude: addr.longitude ? String(addr.longitude) : null,
        geocodingAccuracy: addr.geocoding_accuracy || null,
        censusTract: addr.census_tract || null,
        censusBlock: addr.census_block || null,
    };
}

export function transformStructureData(propertyId: string, propertyData: SfrPropertyData) {
    const struct = propertyData.structure;
    if (!struct) return null;

    return {
        propertyId,
        totalAreaSqFt: struct.total_area_sq_ft || null,
        yearBuilt: struct.year_built || null,
        effectiveYearBuilt: struct.effective_year_built || null,
        bedsCount: struct.beds_count || null,
        roomsCount: struct.rooms_count || null,
        baths: struct.baths ? String(struct.baths) : null,
        basementType: struct.basement_type || null,
        condition: struct.condition || null,
        constructionType: struct.construction_type || null,
        exteriorWallType: struct.exterior_wall_type || null,
        fireplaces: struct.fireplaces || null,
        heatingType: struct.heating_type || null,
        heatingFuelType: struct.heating_fuel_type || null,
        parkingSpacesCount: struct.parking_spaces_count || null,
        poolType: struct.pool_type || null,
        quality: struct.quality || null,
        roofMaterialType: struct.roof_material_type || null,
        roofStyleType: struct.roof_style_type || null,
        sewerType: struct.sewer_type || null,
        stories: struct.stories != null ? String(struct.stories) : null,
        unitsCount: struct.units_count || null,
        waterType: struct.water_type || null,
        livingAreaSqft: struct.living_area_sqft || null,
        acDescription: struct.ac_description || null,
        garageDescription: struct.garage_description || null,
        buildingClassDescription: struct.building_class_description || null,
        sqftDescription: struct.sqft_description || null,
    };
}

export function transformAssessmentData(propertyId: string, propertyData: SfrPropertyData) {
    if (!propertyData.assessments || !propertyData.assessed_year) return null;

    return {
        propertyId,
        assessedYear: propertyData.assessed_year,
        landValue: propertyData.assessments.land_value ? String(propertyData.assessments.land_value) : null,
        improvementValue: propertyData.assessments.improvement_value ? String(propertyData.assessments.improvement_value) : null,
        assessedValue: propertyData.assessments.assessed_value ? String(propertyData.assessments.assessed_value) : null,
        marketValue: propertyData.assessments.market_value ? String(propertyData.assessments.market_value) : null,
    };
}

export function transformExemptionData(propertyId: string, propertyData: SfrPropertyData) {
    if (!propertyData.exemptions) return null;

    return {
        propertyId,
        homeowner: propertyData.exemptions.homeowner || null,
        veteran: propertyData.exemptions.veteran || null,
        disabled: propertyData.exemptions.disabled || null,
        widow: propertyData.exemptions.widow || null,
        senior: propertyData.exemptions.senior || null,
        school: propertyData.exemptions.school || null,
        religious: propertyData.exemptions.religious || null,
        welfare: propertyData.exemptions.welfare || null,
        public: propertyData.exemptions.public || null,
        cemetery: propertyData.exemptions.cemetery || null,
        hospital: propertyData.exemptions.hospital || null,
        library: propertyData.exemptions.library || null,
    };
}

export function transformParcelData(propertyId: string, propertyData: SfrPropertyData) {
    if (!propertyData.parcel) return null;

    return {
        propertyId,
        apnOriginal: propertyData.parcel.apn_original || null,
        fipsCode: propertyData.parcel.fips_code || null,
        frontageFt: propertyData.parcel.frontage_ft != null ? String(propertyData.parcel.frontage_ft) : null,
        depthFt: propertyData.parcel.depth_ft != null ? String(propertyData.parcel.depth_ft) : null,
        areaAcres: propertyData.parcel.area_acres != null ? String(propertyData.parcel.area_acres) : null,
        areaSqFt: propertyData.parcel.area_sq_ft || null,
        zoning: propertyData.parcel.zoning || null,
        countyLandUseCode: propertyData.parcel.county_land_use_code || null,
        lotNumber: propertyData.parcel.lot_number || null,
        subdivision: normalizeSubdivision(propertyData.parcel.subdivision) || null,
        sectionTownshipRange: propertyData.parcel.section_township_range || null,
        legalDescription: propertyData.parcel.legal_description || null,
        stateLandUseCode: propertyData.parcel.state_land_use_code || null,
        buildingCount: propertyData.parcel.building_count || null,
    };
}

export function transformSchoolDistrictData(propertyId: string, propertyData: SfrPropertyData) {
    if (!propertyData.school_tax_district_1 && !propertyData.school_district_name) return null;

    return {
        propertyId,
        schoolTaxDistrict1: normalizeToTitleCase(propertyData.school_tax_district_1) || null,
        schoolTaxDistrict2: normalizeToTitleCase(propertyData.school_tax_district_2) || null,
        schoolTaxDistrict3: normalizeToTitleCase(propertyData.school_tax_district_3) || null,
        schoolDistrictName: propertyData.school_district_name || null,
    };
}

export function transformTaxRecordData(propertyId: string, propertyData: SfrPropertyData) {
    if (!propertyData.tax_year) return null;

    return {
        propertyId,
        taxYear: propertyData.tax_year,
        taxAmount: propertyData.tax_amount ? String(propertyData.tax_amount) : null,
        taxDelinquentYear: propertyData.tax_delinquent_year || null,
        taxRateCodeArea: propertyData.tax_rate_code_area || null,
    };
}

export function transformValuationData(propertyId: string, propertyData: SfrPropertyData) {
    if (!propertyData.valuation) return null;

    return {
        propertyId,
        value: propertyData.valuation.value ? String(propertyData.valuation.value) : null,
        high: propertyData.valuation.high ? String(propertyData.valuation.high) : null,
        low: propertyData.valuation.low ? String(propertyData.valuation.low) : null,
        forecastStandardDeviation: propertyData.valuation.forecast_standard_deviation ? String(propertyData.valuation.forecast_standard_deviation) : null,
        valuationDate: propertyData.valuation.date || null,
    };
}

export function transformPreForeclosureData(propertyId: string, propertyData: SfrPropertyData) {
    if (!propertyData.pre_foreclosure) return null;

    return {
        propertyId,
        flag: propertyData.pre_foreclosure.flag || null,
        ind: propertyData.pre_foreclosure.ind || null,
        reason: propertyData.pre_foreclosure.reason || null,
        docType: propertyData.pre_foreclosure.doc_type || null,
        recordingDate: propertyData.pre_foreclosure.recording_date || null,
    };
}

export function transformLastSaleData(propertyId: string, propertyData: SfrPropertyData, recordingDateOverride?: string | null) {
    const lastSale = propertyData.last_sale || propertyData.lastSale;
    if (!lastSale) return null;

    return {
        propertyId,
        saleDate: lastSale.date || null,
        recordingDate: recordingDateOverride !== undefined ? recordingDateOverride : (lastSale.recording_date || null),
        price: lastSale.price ? String(lastSale.price) : null,
        documentType: lastSale.document_type || null,
        mtgAmount: lastSale.mtg_amount ? String(lastSale.mtg_amount) : null,
        mtgType: lastSale.mtg_type || null,
        lender: normalizeCompanyNameForStorage(lastSale.lender) || null,
        mtgInterestRate: lastSale.mtg_interest_rate != null ? String(lastSale.mtg_interest_rate) : null,
        mtgTermMonths: lastSale.mtg_term_months != null ? String(lastSale.mtg_term_months) : null,
    };
}

export function transformCurrentSaleData(propertyId: string, propertyData: SfrPropertyData) {
    const currentSale = propertyData.current_sale || propertyData.currentSale;
    if (!currentSale) return null;

    return {
        propertyId,
        docNum: currentSale.doc_num || null,
        buyer1: normalizeCompanyNameForStorage(currentSale.buyer_1 || currentSale.buyer1) || null,
        buyer2: normalizeCompanyNameForStorage(currentSale.buyer_2 || currentSale.buyer2) || null,
        seller1: normalizeCompanyNameForStorage(currentSale.seller_1 || currentSale.seller1) || null,
        seller2: normalizeCompanyNameForStorage(currentSale.seller_2 || currentSale.seller2) || null,
    };
}

// ============================================================================
// AGGREGATE TRANSFORMATION
// Returns all property-related data as a single object for batch processing
// ============================================================================

export interface TransformedPropertyData {
    address: ReturnType<typeof transformAddressData>;
    structure: ReturnType<typeof transformStructureData>;
    assessment: ReturnType<typeof transformAssessmentData>;
    exemption: ReturnType<typeof transformExemptionData>;
    parcel: ReturnType<typeof transformParcelData>;
    schoolDistrict: ReturnType<typeof transformSchoolDistrictData>;
    taxRecord: ReturnType<typeof transformTaxRecordData>;
    valuation: ReturnType<typeof transformValuationData>;
    preForeclosure: ReturnType<typeof transformPreForeclosureData>;
    lastSale: ReturnType<typeof transformLastSaleData>;
    currentSale: ReturnType<typeof transformCurrentSaleData>;
}

export function transformAllPropertyData(
    propertyId: string,
    propertyData: SfrPropertyData,
    normalizedCounty: string | null,
    recordingDateOverride?: string | null
): TransformedPropertyData {
    return {
        address: transformAddressData(propertyId, propertyData, normalizedCounty),
        structure: transformStructureData(propertyId, propertyData),
        assessment: transformAssessmentData(propertyId, propertyData),
        exemption: transformExemptionData(propertyId, propertyData),
        parcel: transformParcelData(propertyId, propertyData),
        schoolDistrict: transformSchoolDistrictData(propertyId, propertyData),
        taxRecord: transformTaxRecordData(propertyId, propertyData),
        valuation: transformValuationData(propertyId, propertyData),
        preForeclosure: transformPreForeclosureData(propertyId, propertyData),
        lastSale: transformLastSaleData(propertyId, propertyData, recordingDateOverride),
        currentSale: transformCurrentSaleData(propertyId, propertyData),
    };
}

// ============================================================================
// INSERTION FUNCTIONS
// For single property insertion (used by properties.routes.ts)
// ============================================================================

/**
 * Inserts all property-related data for a single property.
 * This is used by the single property creation endpoint.
 * @param recordingDateOverride - Optional override for last_sale.recording_date (used during sync)
 */
export async function insertPropertyRelatedData(
    propertyId: string,
    propertyData: SfrPropertyData,
    normalizedCounty: string | null,
    recordingDateOverride?: string | null
): Promise<void> {
    const data = transformAllPropertyData(propertyId, propertyData, normalizedCounty, recordingDateOverride);

    // Insert each table's data if it exists
    if (data.address) {
        await db.insert(addresses).values(data.address);
    }
    if (data.structure) {
        await db.insert(structures).values(data.structure);
    }
    if (data.assessment) {
        await db.insert(assessments).values(data.assessment);
    }
    if (data.exemption) {
        await db.insert(exemptions).values(data.exemption);
    }
    if (data.parcel) {
        await db.insert(parcels).values(data.parcel);
    }
    if (data.schoolDistrict) {
        await db.insert(schoolDistricts).values(data.schoolDistrict);
    }
    if (data.taxRecord) {
        await db.insert(taxRecords).values(data.taxRecord);
    }
    if (data.valuation) {
        await db.insert(valuations).values(data.valuation);
    }
    if (data.preForeclosure) {
        await db.insert(preForeclosures).values(data.preForeclosure);
    }
    if (data.lastSale) {
        await db.insert(lastSales).values(data.lastSale);
    }
    if (data.currentSale) {
        await db.insert(currentSales).values(data.currentSale);
    }
}

// ============================================================================
// BATCH INSERTION HELPERS
// For collecting and batch inserting property data (used by data.routes.ts)
// ============================================================================

export interface PropertyDataCollectors {
    addresses: NonNullable<ReturnType<typeof transformAddressData>>[];
    structures: NonNullable<ReturnType<typeof transformStructureData>>[];
    assessments: NonNullable<ReturnType<typeof transformAssessmentData>>[];
    exemptions: NonNullable<ReturnType<typeof transformExemptionData>>[];
    parcels: NonNullable<ReturnType<typeof transformParcelData>>[];
    schoolDistricts: NonNullable<ReturnType<typeof transformSchoolDistrictData>>[];
    taxRecords: NonNullable<ReturnType<typeof transformTaxRecordData>>[];
    valuations: NonNullable<ReturnType<typeof transformValuationData>>[];
    preForeclosures: NonNullable<ReturnType<typeof transformPreForeclosureData>>[];
    lastSales: NonNullable<ReturnType<typeof transformLastSaleData>>[];
    currentSales: NonNullable<ReturnType<typeof transformCurrentSaleData>>[];
}

export function createPropertyDataCollectors(): PropertyDataCollectors {
    return {
        addresses: [],
        structures: [],
        assessments: [],
        exemptions: [],
        parcels: [],
        schoolDistricts: [],
        taxRecords: [],
        valuations: [],
        preForeclosures: [],
        lastSales: [],
        currentSales: [],
    };
}

/**
 * Collects transformed property data into the collectors for batch insertion.
 */
export function collectPropertyData(
    collectors: PropertyDataCollectors,
    propertyId: string,
    propertyData: SfrPropertyData,
    normalizedCounty: string | null,
    recordingDateOverride?: string | null
): void {
    const data = transformAllPropertyData(propertyId, propertyData, normalizedCounty, recordingDateOverride);

    if (data.address) collectors.addresses.push(data.address);
    if (data.structure) collectors.structures.push(data.structure);
    if (data.assessment) collectors.assessments.push(data.assessment);
    if (data.exemption) collectors.exemptions.push(data.exemption);
    if (data.parcel) collectors.parcels.push(data.parcel);
    if (data.schoolDistrict) collectors.schoolDistricts.push(data.schoolDistrict);
    if (data.taxRecord) collectors.taxRecords.push(data.taxRecord);
    if (data.valuation) collectors.valuations.push(data.valuation);
    if (data.preForeclosure) collectors.preForeclosures.push(data.preForeclosure);
    if (data.lastSale) collectors.lastSales.push(data.lastSale);
    if (data.currentSale) collectors.currentSales.push(data.currentSale);
}

/**
 * Batch inserts all collected property data.
 */
export async function batchInsertPropertyData(collectors: PropertyDataCollectors): Promise<void> {
    if (collectors.addresses.length > 0) {
        await db.insert(addresses).values(collectors.addresses);
    }
    if (collectors.structures.length > 0) {
        await db.insert(structures).values(collectors.structures);
    }
    if (collectors.assessments.length > 0) {
        await db.insert(assessments).values(collectors.assessments);
    }
    if (collectors.exemptions.length > 0) {
        await db.insert(exemptions).values(collectors.exemptions);
    }
    if (collectors.parcels.length > 0) {
        await db.insert(parcels).values(collectors.parcels);
    }
    if (collectors.schoolDistricts.length > 0) {
        await db.insert(schoolDistricts).values(collectors.schoolDistricts);
    }
    if (collectors.taxRecords.length > 0) {
        await db.insert(taxRecords).values(collectors.taxRecords);
    }
    if (collectors.valuations.length > 0) {
        await db.insert(valuations).values(collectors.valuations);
    }
    if (collectors.preForeclosures.length > 0) {
        await db.insert(preForeclosures).values(collectors.preForeclosures);
    }
    if (collectors.lastSales.length > 0) {
        await db.insert(lastSales).values(collectors.lastSales);
    }
    if (collectors.currentSales.length > 0) {
        await db.insert(currentSales).values(collectors.currentSales);
    }
}

// ============================================================================
// UPDATE EXISTING PROPERTY DATA
// For properties that already exist - update 1:1 tables, add 1:many only if new
// ============================================================================

/**
 * Updates 1:1 related tables for an existing property.
 * Tables: addresses, current_sales, exemptions, last_sales, parcels, school_districts, structures, pre_foreclosures.
 */
export async function updatePropertyRelatedDataForExisting(
    propertyId: string,
    propertyData: SfrPropertyData,
    normalizedCounty: string | null,
    recordingDateOverride?: string | null
): Promise<void> {
    const data = transformAllPropertyData(propertyId, propertyData, normalizedCounty, recordingDateOverride);

    if (data.address) {
        await db.update(addresses).set(omit(data.address, "propertyId")).where(eq(addresses.propertyId, propertyId));
    }
    if (data.structure) {
        await db.update(structures).set(omit(data.structure, "propertyId")).where(eq(structures.propertyId, propertyId));
    }
    if (data.exemption) {
        await db.update(exemptions).set(omit(data.exemption, "propertyId")).where(eq(exemptions.propertyId, propertyId));
    }
    if (data.parcel) {
        await db.update(parcels).set(omit(data.parcel, "propertyId")).where(eq(parcels.propertyId, propertyId));
    }
    if (data.schoolDistrict) {
        await db.update(schoolDistricts).set(omit(data.schoolDistrict, "propertyId")).where(eq(schoolDistricts.propertyId, propertyId));
    }
    if (data.lastSale) {
        await db.update(lastSales).set(omit(data.lastSale, "propertyId")).where(eq(lastSales.propertyId, propertyId));
    }
    if (data.currentSale) {
        await db.update(currentSales).set(omit(data.currentSale, "propertyId")).where(eq(currentSales.propertyId, propertyId));
    }
    if (data.preForeclosure) {
        await db.update(preForeclosures).set(omit(data.preForeclosure, "propertyId")).where(eq(preForeclosures.propertyId, propertyId));
    }
}

/**
 * Adds assessment/tax_record/valuation only if the year/date doesn't already exist for the property.
 */
export async function addPropertyOneToManyDataIfNew(
    propertyId: string,
    propertyData: SfrPropertyData,
    normalizedCounty: string | null,
    recordingDateOverride?: string | null
): Promise<void> {
    const data = transformAllPropertyData(propertyId, propertyData, normalizedCounty, recordingDateOverride);

    if (data.assessment && propertyData.assessed_year) {
        const existing = await db
            .select({ assessedYear: assessments.assessedYear })
            .from(assessments)
            .where(eq(assessments.propertyId, propertyId));
        const existingYears = new Set(existing.map((r) => r.assessedYear));
        if (!existingYears.has(propertyData.assessed_year)) {
            await db.insert(assessments).values(data.assessment);
        }
    }

    if (data.taxRecord && propertyData.tax_year) {
        const existing = await db
            .select({ taxYear: taxRecords.taxYear })
            .from(taxRecords)
            .where(eq(taxRecords.propertyId, propertyId));
        const existingYears = new Set(existing.map((r) => r.taxYear));
        if (!existingYears.has(propertyData.tax_year)) {
            await db.insert(taxRecords).values(data.taxRecord);
        }
    }

    if (data.valuation && propertyData.valuation?.date) {
        const valDate = normalizeDateToYMD(propertyData.valuation.date);
        if (valDate) {
            const existing = await db
                .select({ valuationDate: valuations.valuationDate })
                .from(valuations)
                .where(eq(valuations.propertyId, propertyId));
            const existingDates = new Set(
                existing.map((r) => (r.valuationDate ? normalizeDateToYMD(r.valuationDate) : null)).filter(Boolean)
            );
            if (!existingDates.has(valDate)) {
                await db.insert(valuations).values(data.valuation);
            }
        }
    }
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): Omit<T, typeof key> {
    const { [key]: _, ...rest } = obj;
    return rest as Omit<T, typeof key>;
}

