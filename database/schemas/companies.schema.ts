import { pgTable, uuid, varchar, text, timestamp, json, integer, primaryKey } from "drizzle-orm/pg-core";
import { msas } from "./msas.schema";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyName: text("company_name").unique().notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  counties: json("counties"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companyMsas = pgTable(
  "company_msas",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    msaId: integer("msa_id")
      .notNull()
      .references(() => msas.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.msaId] })]
);