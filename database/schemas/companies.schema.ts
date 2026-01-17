import { pgTable, uuid, varchar, text, timestamp, json } from "drizzle-orm/pg-core";

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