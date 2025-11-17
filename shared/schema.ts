import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  price: real("price").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: real("bathrooms").notNull(),
  squareFeet: integer("square_feet").notNull(),
  propertyType: text("property_type").notNull(),
  imageUrl: text("image_url"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  description: text("description"),
  yearBuilt: integer("year_built"),
  propertyOwner: text("property_owner"),
  companyContactName: text("company_contact_name"),
  companyContactEmail: text("company_contact_email"),
  purchasePrice: real("purchase_price"),
  dateSold: text("date_sold"),
});

export const companyContacts = pgTable("company_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull().unique(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email"),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
});

export const insertCompanyContactSchema = createInsertSchema(companyContacts).omit({
  id: true,
});

export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;
export type CompanyContact = typeof companyContacts.$inferSelect;
export type InsertCompanyContact = z.infer<typeof insertCompanyContactSchema>;
