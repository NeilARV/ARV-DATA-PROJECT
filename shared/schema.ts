import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, boolean, serial, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Address info
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),

  // Core property details
  price: real("price"), // nullable in DB
  bedrooms: integer("bedrooms"),
  bathrooms: real("bathrooms"),
  squareFeet: integer("square_feet"),
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
});

export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: integer("expire").notNull(),
});

export const sfrSyncState = pgTable("sfr_sync_state", {
  id: serial("id").primaryKey(),
  msa: varchar("msa", { length: 255}).notNull().unique(),
  lastRecordingDate: date("last_recording_date"),
  totalRecordsSynced: integer("total_records_synced").default(0).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: false}).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
})

/* OLD INSERT SCHEMA FOR PROPERTIES */
// export const insertPropertySchema = createInsertSchema(properties).omit({
//   id: true,
// });

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});


export const insertCompanyContactSchema = createInsertSchema(companyContacts).omit({
  id: true,
});

export const insertSyncStateSchema = createInsertSchema(sfrSyncState, {
  id: z.never(),
  createdAt: z.never(),
  lastSyncAt: z.never(),
  totalRecordsSynced: z.number().int().optional(),
  lastRecordingDate: z.coerce.date().optional(),
})

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  passwordHash: true,
  createdAt: true,
}).extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;
export type CompanyContact = typeof companyContacts.$inferSelect;
export type InsertCompanyContact = z.infer<typeof insertCompanyContactSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
