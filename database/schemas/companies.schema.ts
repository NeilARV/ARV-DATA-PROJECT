import { pgTable, uuid, varchar, text, timestamp, integer, boolean, primaryKey, serial, index } from "drizzle-orm/pg-core";
import { msas } from "./msas.schema";
import { users } from "./users.schema";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyName: text("company").unique().notNull(),
  isArvClient: boolean("is_arv_client").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companyContacts = pgTable("company_contacts", {
  id: serial("id").primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  title: text("title"),
  sortOrder: integer("sort_order").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("idx_company_contacts_company_id").on(t.companyId),
]);

export const companyCounties = pgTable(
  "company_counties",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    county: text("county").notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.county, t.state] })]
);

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
