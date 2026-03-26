import { pgTable, bigserial, uuid, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { properties } from "./properties.schema";
import { users } from "./users.schema";
import { msas } from "./msas.schema";

export const dealTypeEnum = pgEnum("deal_type", ["wholesale", "agent"]);

export const deals = pgTable("deals", {
  id:         bigserial("id", { mode: "number" }).primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  userId:     uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  msaId:      integer("msa_id").notNull().references(() => msas.id, { onDelete: "restrict" }),
  type:       dealTypeEnum("type").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
