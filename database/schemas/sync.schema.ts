import { pgTable, serial, varchar, date, integer, timestamp, uuid, text, decimal, boolean, bigint, jsonb } from "drizzle-orm/pg-core";
import { msas } from "./msas.schema";

export const sfrSyncState = pgTable("sfr_sync_state", {
  id: serial("id").primaryKey(),
  msa: varchar("msa", { length: 255 }).unique().notNull(),
  lastSaleDate: date("last_sale_date"),
  lastRecordingDate: date("last_recording_date"),
  totalRecordsSynced: integer("total_records_synced").default(0),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketScanQueue = pgTable("market_scan_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  sfrMarketId: integer("sfr_market_id").unique().notNull(),
  sfrPropertyId: bigint("sfr_property_id", { mode: "number" }).notNull(),
  address: text("address"),
  city: text("city"),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zip_code", { length: 10 }),
  msaId: integer("msa_id").notNull().references(() => msas.id, { onDelete: "restrict" }),
  saleDate: date("sale_date").notNull(),
  recordingDate: date("recording_date").notNull(),
  buyerName: text("buyer_name"),
  sellerName: text("seller_name"),
  saleValue: decimal("sale_value", { precision: 15, scale: 2 }),
  lenderName: text("lender_name"),
  isCorporate: boolean("is_corporate"),
  isPrivateLender: boolean("is_private_lender"),
  propertyType: text("property_type"),
  rawData: jsonb("raw_data").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  scanWindow: varchar("scan_window", { length: 10 }),
  errorMessage: text("error_message"),
  enqueuedAt: timestamp("enqueued_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export const emailSyncState = pgTable("email_sync_state", {
  id: serial("id").primaryKey(),
  msa: varchar("msa", { length: 255 }).unique().notNull(),
  lastEmailSent: date("last_email_sent"),
  lastEmailAt: timestamp("last_email_at").defaultNow(),
  lastPropertyId: uuid("last_property_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});