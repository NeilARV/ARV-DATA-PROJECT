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
} from "drizzle-orm/pg-core";
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
  buyerId: uuid("buyer_id").references(() => companies.id, { onDelete: "set null" }),
  sellerId: uuid("seller_id").references(() => companies.id, { onDelete: "set null" }),
  propertyClassDescription: varchar("property_class_description", { length: 100 }),
  propertyType: varchar("property_type", { length: 100 }),
  vacant: varchar("vacant", { length: 10 }),
  hoa: varchar("hoa", { length: 10 }),
  ownerType: varchar("owner_type", { length: 50 }),
  purchaseMethod: varchar("purchase_method", { length: 50 }),
  listingStatus: varchar("listing_status", { length: 50 }),
  status: varchar("status", { length: 50 }).default("in-renovation"),
  monthsOwned: integer("months_owned"),
  msa: varchar("msa", { length: 200 }),
  county: varchar("county", { length: 200 }),
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
});

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
  sectionTownshipRange: varchar("section_township_range", { length: 100 }),
  legalDescription: text("legal_description"),
  stateLandUseCode: varchar("state_land_use_code", { length: 20 }),
  buildingCount: integer("building_count"),
});

// School Districts
export const schoolDistricts = pgTable("school_districts", {
  schoolDistrictsId: serial("school_districts_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  schoolTaxDistrict1: varchar("school_tax_district_1", { length: 100 }),
  schoolTaxDistrict2: varchar("school_tax_district_2", { length: 100 }),
  schoolTaxDistrict3: varchar("school_tax_district_3", { length: 100 }),
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
  quality: varchar("quality", { length: 10 }),
  roofMaterialType: varchar("roof_material_type", { length: 50 }),
  roofStyleType: varchar("roof_style_type", { length: 50 }),
  sewerType: varchar("sewer_type", { length: 50 }),
  stories: varchar("stories", { length: 50 }),
  unitsCount: integer("units_count"),
  waterType: varchar("water_type", { length: 50 }),
  livingAreaSqft: integer("living_area_sqft"),
  acDescription: varchar("ac_description", { length: 100 }),
  garageDescription: varchar("garage_description", { length: 100 }),
  buildingClassDescription: varchar("building_class_description", { length: 100 }),
  sqftDescription: varchar("sqft_description", { length: 100 }),
});

// Tax Records
export const taxRecords = pgTable("tax_records", {
  taxRecordsId: serial("tax_records_id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  taxYear: integer("tax_year").notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }),
  taxDelinquentYear: integer("tax_delinquent_year"),
  taxRateCodeArea: varchar("tax_rate_code_area", { length: 50 }),
});

// Valuations
export const valuations = pgTable("valuations", {
  valuationsId: serial("valuations_id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  value: decimal("value", { precision: 15, scale: 2 }),
  high: decimal("high", { precision: 15, scale: 2 }),
  low: decimal("low", { precision: 15, scale: 2 }),
  forecastStandardDeviation: decimal("forecast_standard_deviation", { precision: 18, scale: 15 }),
  valuationDate: date("valuation_date"),
});

// Pre-foreclosures
export const preForeclosures = pgTable("pre_foreclosures", {
  preForeclosuresId: serial("pre_foreclosures_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  flag: boolean("flag"),
  ind: varchar("ind", { length: 50 }),
  reason: text("reason"),
  docType: varchar("doc_type", { length: 100 }),
  recordingDate: date("recording_date"),
});

// Last Sales
export const lastSales = pgTable("last_sales", {
  lastSalesId: serial("last_sales_id").primaryKey(),
  propertyId: uuid("property_id").unique().notNull().references(() => properties.id, { onDelete: "cascade" }),
  saleDate: date("sale_date"),
  recordingDate: date("recording_date"),
  price: decimal("price", { precision: 15, scale: 2 }),
  documentType: varchar("document_type", { length: 100 }),
  mtgAmount: decimal("mtg_amount", { precision: 15, scale: 2 }),
  mtgType: varchar("mtg_type", { length: 100 }),
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
  propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Property Transactions
export const propertyTransactions = pgTable("property_transactions", {
  propertyTransactionsId: serial("property_transactions_id").primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").references(() => companies.id, { onDelete: "set null" }),
  buyerId: uuid("buyer_id").references(() => companies.id, { onDelete: "set null" }),
  transactionType: varchar("transaction_type", { length: 50 }).notNull(),
  transactionDate: date("transaction_date").notNull(),
  salePrice: decimal("sale_price", { precision: 15, scale: 2 }),
  mtgType: varchar("mtg_type", { length: 100 }),
  mtgAmount: decimal("mtg_amount", { precision: 15, scale: 2 }),
  buyerName: varchar("buyer_name", { length: 200 }),
  sellerName: varchar("seller_name", { length: 200 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});