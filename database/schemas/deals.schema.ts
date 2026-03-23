import { pgTable, bigserial, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { properties } from "./properties.schema";
import { users } from "./users.schema";
import { msas } from "./msas.schema";

export const deals = pgTable("deals", {
  id:         bigserial("id", { mode: "number" }).primaryKey(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  postedBy:   uuid("posted_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  msaId:      integer("msa_id").notNull().references(() => msas.id, { onDelete: "restrict" }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
