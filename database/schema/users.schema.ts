import { pgTable, uuid, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";

// Sessions
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: varchar("expire").notNull(),
});

// Email Whitelist
export const emailWhitelist = pgTable("email_whitelist", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isAdmin: boolean("is_admin").notNull().default(false),
  notifications: boolean("notifications").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});