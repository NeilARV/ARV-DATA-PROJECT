import { pgTable, serial, varchar, date, integer, timestamp } from "drizzle-orm/pg-core";

export const sfrSyncState = pgTable("sfr_sync_state", {
  id: serial("id").primaryKey(),
  msa: varchar("msa", { length: 255 }).unique().notNull(),
  lastSaleDate: date("last_sale_date"),
  totalRecordsSynced: integer("total_records_synced").default(0),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});