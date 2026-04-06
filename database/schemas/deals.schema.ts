import { pgTable, bigserial, bigint, uuid, integer, timestamp, pgEnum, text, varchar, decimal } from "drizzle-orm/pg-core";
import { users } from "./users.schema";
import { msas } from "./msas.schema";

export const dealTypeEnum = pgEnum("deal_type", ["wholesale", "agent", "sold"]);

export const deals = pgTable("deals", {

  id:              bigserial("id", { mode: "number" }).primaryKey(),

  // Nullable — populated when SFR property lookup succeeds
  sfrPropertyId:   bigint("sfr_property_id", { mode: "number" }),
  userId:          uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  msaId:        integer("msa_id").notNull().references(() => msas.id, { onDelete: "restrict" }),
  type:         dealTypeEnum("type").notNull(),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  
  // Address fields (full address optional; city + state always set by app logic)
  address:      text("address"),
  city:         text("city"),
  state:        varchar("state", { length: 2 }),
  zipCode:      varchar("zip_code", { length: 10 }).notNull(),

  // Property details (fetched from SFR when address provided, else manually entered)
  price:        decimal("price", { precision: 15, scale: 2 }),
  beds:         integer("beds"),
  baths:        decimal("baths", { precision: 3, scale: 1 }),
  sqft:         integer("sqft"),
  propertyType: varchar("property_type", { length: 100 }),
});
