import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { properties, companyContacts, type Property, type InsertProperty, type CompanyContact } from "@shared/schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);