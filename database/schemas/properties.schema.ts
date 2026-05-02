import {
  pgTable,
  uuid,
  bigint,
  varchar,
  boolean,
  integer,
  timestamp,
  serial,
  decimal,
  text,
  date,
  customType,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.schema";

// Custom type for BYTEA (binary data) in PostgreSQL
// BYTEA stores binary data efficiently without base64 encoding overhead
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value: Buffer) => value,
  fromDriver: (value: Buffer) => value,
});

// Main properties table
export const properties = pgTable("properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  sfrPropertyId: bigint("sfr_property_id", { mode: "number" }).unique().notNull(),
  propertyClassDescription: text("property_class_description"),
  propertyType: varchar("property_type", { length: 100 }),
  vacant: varchar("vacant", { length: 50 }),
  hoa: varchar("hoa", { length: 50 }),
  ownerType: varchar("owner_type", { length: 50 }),
  purchaseMethod: varchar("purchase_method", { length: 50 }),
  listingStatus: varchar("listing_status", { length: 50 }),
  status: varchar("status", { length: 50 }).default("in-renovation"),
  monthsOwned: integer("months_owned"),
  msa: varchar("msa", { length: 200 }),
  county: varchar("county", { length: 200 }),
  isArvFunded: boolean("is_arv_funded").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Addresses
export const addresses = pgTable("addresses", {
  addressesId: serial("addresses_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  formattedStreetAddress: varchar("formatted_street_address", { length: 200 }),
  streetNumber: varchar("street_number", { length: 20 }),
  streetSuffix: varchar("street_suffix", { length: 20 }),
  streetPreDirection: varchar("street_pre_direction", { length: 10 }),
  streetName: varchar("street_name", { length: 100 }),
  streetPostDirection: varchar("street_post_direction", { length: 10 }),
  unitType: varchar("unit_type", { length: 20 }),
  unitNumber: varchar("unit_number", { length: 20 }),
  city: varchar("city", { length: 100 }),
  county: varchar("county", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zip_code", { length: 10 }),
  zipPlusFourCode: varchar("zip_plus_four_code", { length: 10 }),
  carrierCode: varchar("carrier_code", { length: 20 }),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  geocodingAccuracy: varchar("geocoding_accuracy", { length: 200 }),
  censusTract: varchar("census_tract", { length: 20 }),
  censusBlock: varchar("census_block", { length: 20 }),
});

// Assessments
export const assessments = pgTable("assessments", {
  assessmentsId: serial("assessments_id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  assessedYear: integer("assessed_year").notNull(),
  landValue: decimal("land_value", { precision: 15, scale: 2 }),
  improvementValue: decimal("improvement_value", { precision: 15, scale: 2 }),
  assessedValue: decimal("assessed_value", { precision: 15, scale: 2 }),
  marketValue: decimal("market_value", { precision: 15, scale: 2 }),
}, (t) => [unique().on(t.propertyId, t.assessedYear)]);

// Exemptions
export const exemptions = pgTable("exemptions", {
  exemptionsId: serial("exemptions_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  homeowner: boolean("homeowner"),
  veteran: boolean("veteran"),
  disabled: boolean("disabled"),
  widow: boolean("widow"),
  senior: boolean("senior"),
  school: boolean("school"),
  religious: boolean("religious"),
  welfare: boolean("welfare"),
  public: boolean("public"),
  cemetery: boolean("cemetery"),
  hospital: boolean("hospital"),
  library: boolean("library"),
});

// Parcels
export const parcels = pgTable("parcels", {
  parcelsId: serial("parcels_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  apnOriginal: varchar("apn_original", { length: 50 }),
  fipsCode: varchar("fips_code", { length: 10 }),
  frontageFt: varchar("frontage_ft", { length: 20 }),
  depthFt: varchar("depth_ft", { length: 20 }),
  areaAcres: varchar("area_acres", { length: 20 }),
  areaSqFt: integer("area_sq_ft"),
  zoning: varchar("zoning", { length: 50 }),
  countyLandUseCode: varchar("county_land_use_code", { length: 20 }),
  lotNumber: varchar("lot_number", { length: 50 }),
  subdivision: varchar("subdivision", { length: 200 }),
  sectionTownshipRange: text("section_township_range"),
  legalDescription: text("legal_description"),
  stateLandUseCode: varchar("state_land_use_code", { length: 20 }),
  buildingCount: integer("building_count"),
});

// School Districts
export const schoolDistricts = pgTable("school_districts", {
  schoolDistrictsId: serial("school_districts_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  schoolTaxDistrict1: text("school_tax_district_1"),
  schoolTaxDistrict2: text("school_tax_district_2"),
  schoolTaxDistrict3: text("school_tax_district_3"),
  schoolDistrictName: varchar("school_district_name", { length: 200 }),
});

// Structures
export const structures = pgTable("structures", {
  structuresId: serial("structures_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  totalAreaSqFt: integer("total_area_sq_ft"),
  yearBuilt: integer("year_built"),
  effectiveYearBuilt: integer("effective_year_built"),
  bedsCount: integer("beds_count"),
  roomsCount: integer("rooms_count"),
  baths: decimal("baths", { precision: 3, scale: 1 }),
  basementType: varchar("basement_type", { length: 50 }),
  condition: varchar("condition", { length: 50 }),
  constructionType: varchar("construction_type", { length: 50 }),
  exteriorWallType: varchar("exterior_wall_type", { length: 50 }),
  fireplaces: integer("fireplaces"),
  heatingType: varchar("heating_type", { length: 50 }),
  heatingFuelType: varchar("heating_fuel_type", { length: 50 }),
  parkingSpacesCount: integer("parking_spaces_count"),
  poolType: varchar("pool_type", { length: 50 }),
  quality: varchar("quality", { length: 50 }),
  roofMaterialType: varchar("roof_material_type", { length: 50 }),
  roofStyleType: varchar("roof_style_type", { length: 50 }),
  sewerType: varchar("sewer_type", { length: 50 }),
  stories: varchar("stories", { length: 50 }),
  unitsCount: integer("units_count"),
  waterType: varchar("water_type", { length: 50 }),
  livingAreaSqft: integer("living_area_sqft"),
  acDescription: text("ac_description"),
  garageDescription: text("garage_description"),
  buildingClassDescription: text("building_class_description"),
  sqftDescription: text("sqft_description"),
});

// Tax Records
export const taxRecords = pgTable("tax_records", {
  taxRecordsId: serial("tax_records_id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  taxYear: integer("tax_year").notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }),
  taxDelinquentYear: integer("tax_delinquent_year"),
  taxRateCodeArea: varchar("tax_rate_code_area", { length: 50 }),
}, (t) => [unique().on(t.propertyId, t.taxYear)]);

// Valuations
export const valuations = pgTable("valuations", {
  valuationsId: serial("valuations_id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  value: decimal("value", { precision: 15, scale: 2 }),
  high: decimal("high", { precision: 15, scale: 2 }),
  low: decimal("low", { precision: 15, scale: 2 }),
  forecastStandardDeviation: decimal("forecast_standard_deviation", { precision: 18, scale: 15 }),
  valuationDate: date("valuation_date"),
}, (t) => [unique().on(t.propertyId, t.valuationDate)]);

// Pre-foreclosures
export const preForeclosures = pgTable("pre_foreclosures", {
  preForeclosuresId: serial("pre_foreclosures_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  flag: boolean("flag"),
  ind: varchar("ind", { length: 50 }),
  reason: text("reason"),
  docType: text("doc_type"),
  recordingDate: date("recording_date"),
});

// Last Sales
export const lastSales = pgTable("last_sales", {
  lastSalesId: serial("last_sales_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  saleDate: date("sale_date"),
  recordingDate: date("recording_date"),
  price: decimal("price", { precision: 15, scale: 2 }),
  documentType: text("document_type"),
  mtgAmount: decimal("mtg_amount", { precision: 15, scale: 2 }),
  mtgType: text("mtg_type"),
  lender: varchar("lender", { length: 200 }),
  mtgInterestRate: varchar("mtg_interest_rate", { length: 20 }),
  mtgTermMonths: varchar("mtg_term_months", { length: 10 }),
});

// Current Sales
export const currentSales = pgTable("current_sales", {
  currentSalesId: serial("current_sales_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  docNum: varchar("doc_num", { length: 50 }),
  buyer1: varchar("buyer_1", { length: 200 }),
  buyer2: varchar("buyer_2", { length: 200 }),
  seller1: varchar("seller_1", { length: 200 }),
  seller2: varchar("seller_2", { length: 200 }),
});

// Streetview Cache
export const streetviewCache = pgTable("streetview_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  sfrPropertyId: bigint("sfr_property_id", { mode: "number" }),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  size: text("size").notNull().default("600x400"),
  // Store image as binary data (BYTEA) - more efficient than base64 text
  // Nullable because we may cache metadata indicating no image is available
  imageData: bytea("image_data"),
  contentType: text("content_type").default("image/jpeg"),
  // Metadata status from Google API (e.g., "OK", "ZERO_RESULTS", "NOT_FOUND")
  metadataStatus: text("metadata_status"),
  // Source of the cached image: 'streetview' | 'satellite' | null (cached failures)
  imageSource: text("image_source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Property Transactions
export const propertyTransactions = pgTable("property_transactions", {
  propertyTransactionsId: serial("property_transactions_id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").references(() => companies.id, { onDelete: "set null" }),
  sellerName: varchar("seller_name", { length: 200 }),
  buyerId: uuid("buyer_id").references(() => companies.id, { onDelete: "set null" }),
  buyerName: varchar("buyer_name", { length: 200 }),
  apn: varchar("apn", { length: 50 }),
  transactionType: varchar("transaction_type", { length: 50 }),
  saleDate: date("sale_date").notNull(),
  recordingDate: date("recording_date").notNull(),
  salePrice: decimal("sale_price", { precision: 15, scale: 2 }),
  firstMtgRecordingDate: date("first_mtg_recording_date"),
  firstMtgAmount: decimal("first_mtg_amount", { precision: 15, scale: 2 }),
  firstMtgLenderName: varchar("first_mtg_lender_name", { length: 200 }),
  firstMtgDueDate: date("first_mtg_due_date"),
  sortOrder: integer("sort_order"),
  userCreated: boolean("user_created").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  // Covers all correlated subqueries that filter by property_id + LOWER(TRIM(transaction_type))
  // and sort by COALESCE(sort_order, 999999) / recording_date. This is the most critical index
  // for the properties grid query performance.
  index("idx_pt_property_tx_type_sort").on(
    t.propertyId,
    sql`lower(trim(${t.transactionType}))`,
    sql`coalesce(${t.sortOrder}, 999999)`,
    t.recordingDate,
  ),
  // Covers buyer/seller company lookups and filtering
  index("idx_pt_property_buyer_date").on(t.propertyId, t.buyerId, t.recordingDate),
  index("idx_pt_seller_date").on(t.sellerId, t.recordingDate),
  // Partial index: fast lookup of the most recent transaction per buyer
  index("idx_pt_buyer_sort1").on(t.buyerId).where(sql`${t.sortOrder} = 1`),
]);