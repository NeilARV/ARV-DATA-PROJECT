import { pgTable, serial, varchar, date, integer, timestamp, uuid, text, decimal, boolean, bigint, jsonb, unique } from "drizzle-orm/pg-core";
import { msas } from "./msas.schema";
import { properties } from "./properties.schema";

export const marketScanQueue = pgTable("market_scan_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  sfrMarketId: bigint("sfr_market_id", { mode: "number" }).unique().notNull(),
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
}, (t) => [
  unique("uq_msq_msa_property").on(t.msaId, t.sfrPropertyId),
]);

export const sentPropertyIds = pgTable("sent_property_ids", {
  propertyId: uuid("property_id").primaryKey().references(() => properties.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
