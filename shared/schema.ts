import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, boolean, serial, date, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Custom type for BYTEA (binary data) in PostgreSQL
// BYTEA stores binary data efficiently without base64 encoding overhead
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value: Buffer) => value,
  fromDriver: (value: Buffer) => value,
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  notifications: boolean("notifications").notNull().default(true),
});

export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Address info
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  county: text("county").notNull(),

  // Core property details
  price: real("price").notNull(), // nullable in DB
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: real("bathrooms").notNull(),
  squareFeet: integer("square_feet").notNull(),
  propertyType: text("property_type").notNull(),

  imageUrl: text("image_url"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  description: text("description"),
  yearBuilt: integer("year_built"),

  // Ownership / company
  propertyOwner: text("property_owner"),
  companyContactName: text("company_contact_name"),
  companyContactEmail: text("company_contact_email"),

  // Purchase / sale
  purchasePrice: real("purchase_price"),
  dateSold: date("date_sold"), // ✅ was text before — fixed
  status: text("status").default("in-renovation"),

  // Buyer info
  buyerName: text("buyer_name"),
  buyerFormattedName: text("buyer_formatted_name"),
  phone: text("phone"),

  isCorporate: boolean("is_corporate"),
  isCashBuyer: boolean("is_cash_buyer"),
  isDiscountedPurchase: boolean("is_discounted_purchase"),
  isPrivateLender: boolean("is_private_lender"),

  buyerPropertiesCount: integer("buyer_properties_count"),
  buyerTransactionsCount: integer("buyer_transactions_count"),

  // Seller / lender
  sellerName: text("seller_name"),
  lenderName: text("lender_name"),

  // Exit info
  exitValue: real("exit_value"),
  exitBuyerName: text("exit_buyer_name"),
  profitLoss: real("profit_loss"),
  holdDays: integer("hold_days"),

  // Financials
  saleValue: real("sale_value"),
  avmValue: real("avm_value"),
  loanAmount: real("loan_amount"),

  // SFR API IDs (unique in DB)
  sfrPropertyId: integer("sfr_property_id").unique(),
  sfrRecordId: integer("sfr_record_id").unique(),

  // Market
  msa: text("msa"),

  // Dates
  recordingDate: date("recording_date"),

  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companyContacts = pgTable("company_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull().unique(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  counties: text("counties"), // JSON array of counties stored as text
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: integer("expire").notNull(),
});

export const sfrSyncState = pgTable("sfr_sync_state", {
  id: serial("id").primaryKey(),
  msa: varchar("msa", { length: 255}).notNull().unique(),
  lastSaleDate: date("last_sale_date"), // Changed from last_recording_date to last_sale_date
  totalRecordsSynced: integer("total_records_synced").default(0).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: false}).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
})

export const emailWhitelist = pgTable("email_whitelist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
})

export const streetviewCache = pgTable("streetview_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // County is fetched from coordinates, so make it optional for insert
  county: z.string().min(1, "County is required").optional(),
});


export const insertCompanyContactSchema = createInsertSchema(companyContacts).omit({
  id: true,
});

export const insertSyncStateSchema = createInsertSchema(sfrSyncState, {
  id: z.never(),
  createdAt: z.never(),
  lastSyncAt: z.never(),
  totalRecordsSynced: z.number().int().optional(),
  lastSaleDate: z.coerce.date().optional(),
})

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
  notifications: true, // Omit notifications so it uses DB default (true)
}).extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const insertEmailWhitelistSchema = createInsertSchema(emailWhitelist).omit({
  id: true,
  createdAt: true,
});


export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Invalid email address").optional(),
  phone: z.string().min(1, "Phone is required").optional(),
  notifications: z.boolean().optional(),
}).strict();

export const updatePropertySchema = z.object({
  address: z.string().min(1, "Address is required").optional(),
  city: z.string().min(1, "City is required").optional(),
  state: z.string().min(1, "State is required").optional(),
  zipCode: z.string().min(1, "Zip code is required").optional(),
  propertyType: z.string().min(1, "Property type is required").optional(),
  price: z.coerce.number().min(0, "Price must be positive").optional(),
  bedrooms: z.coerce
    .number()
    .int()
    .min(0, "Bedrooms must be 0 or more")
    .optional(),
  bathrooms: z.coerce
    .number()
    .min(0, "Bathrooms must be 0 or more")
    .optional(),
  dateSold: z.coerce.date().nullable().optional(),
  squareFeet: z.coerce
    .number()
    .int()
    .min(0, "Square feet must be positive")
    .optional(),
  yearBuilt: z.coerce
    .number()
    .int()
    .min(1800)
    .max(2100)
    .nullable()
    .optional(),
  propertyOwner: z.string().nullable().optional(),
  companyContactName: z.string().nullable().optional(),
  companyContactEmail: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).strict();

export const updateCompanyContactSchema = z.object({
  contactName: z.string().nullable().optional(),
  contactEmail: z.string().email("Invalid email address").nullable().optional(),
  counties: z.string().nullable().optional(), // JSON array stored as text
  companyName: z.string().min(1, "Company name is required").optional(),
}).strict();

export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;
export type CompanyContact = typeof companyContacts.$inferSelect;
export type InsertCompanyContact = z.infer<typeof insertCompanyContactSchema>;
export type UpdateCompanyContact = z.infer<typeof updateCompanyContactSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProperty = z.infer<typeof insertPropertySchema>;
export type StreetviewCache = typeof streetviewCache.$inferSelect;
