import { pgTable, uuid, text, timestamp, serial, integer, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users.schema";

export const msas = pgTable("msas", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userMsaSubscriptions = pgTable(
  "user_msa_subscriptions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    msaId: integer("msa_id")
      .notNull()
      .references(() => msas.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.msaId] })]
);
