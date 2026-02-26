import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  serial,
  primaryKey,
} from "drizzle-orm/pg-core";

// Sessions
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: integer("expire").notNull(),
});

// Email Whitelist (msa references msas.id)
export const emailWhitelist = pgTable("email_whitelist", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  msa: integer("msa"),
  relationshipManagerId: uuid("relationship_manager_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Users (admin/owner determined via user_roles + roles, not a column here)
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  notifications: boolean("notifications").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Roles (owner, admin, relationship-manager)
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User–role assignment (many-to-many)
export const userRoles = pgTable("user_roles", {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })]
);

// User–relationship manager assignment (many-to-many)
export const userRelationshipManagers = pgTable("user_relationship_managers", {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relationshipManagerId: uuid("relationship_manager_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  }, 
  (t) => [primaryKey({ columns: [t.userId, t.relationshipManagerId] })]
);