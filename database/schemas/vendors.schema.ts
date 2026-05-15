import {
    pgTable,
    uuid,
    varchar,
    text,
    integer,
    serial,
    boolean,
    timestamp,
    primaryKey,
    index,
    type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./users.schema";

// Shared categories for vendors and posts (General Contractor, Plumber, Roofer, etc.)
export const categories = pgTable("categories", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    iconName: varchar("icon_name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Vendor profiles — user_id is nullable for vendors not yet registered on the platform
export const vendors = pgTable("vendors", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    address: text("address"),
    city: text("city"),
    state: varchar("state", { length: 2 }),
    zipCode: varchar("zip_code", { length: 10 }),
    phone: text("phone"),
    website: text("website"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    logoUrl: text("logo_url"),
    headerUrl: text("header_url"),
    isRecommended: boolean("is_recommended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index("idx_vendors_user_id").on(t.userId),
]);

// Vendor ↔ category many-to-many
export const vendorCategories = pgTable("vendor_categories", {
    vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.vendorId, t.categoryId] })]);

// Community posts — users share renovation/project updates
export const posts = pgTable("posts", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    address: text("address"),
    city: text("city"),
    state: varchar("state", { length: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index("idx_posts_user_id").on(t.userId),
    index("idx_posts_created_at").on(t.createdAt),
]);

// Post ↔ category many-to-many (posts can span multiple trades, e.g. Roofing + HVAC)
export const postCategories = pgTable(
    "post_categories",
    {
        postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
        categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.postId, t.categoryId] })]
);

// Images attached to a post (placeholder until storage is configured)
export const postImages = pgTable("post_images", {
    id: serial("id").primaryKey(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    displayOrder: integer("display_order").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index("idx_post_images_post_id").on(t.postId),
]);

// Post likes — one like per user per post
export const postLikes = pgTable(
    "post_likes",
    {
        userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.postId] })]
);

// Post comments — supports one level of threaded replies via parent_comment_id
export const postComments = pgTable("post_comments", {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => postComments.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index("idx_post_comments_post_id").on(t.postId),
    index("idx_post_comments_parent_id").on(t.parentCommentId),
]);

// Vendors tagged/mentioned in a post
export const postVendorTags = pgTable(
    "post_vendor_tags",
    {
        postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
        vendorId: uuid("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.postId, t.vendorId] })]
);

// Users tagged/mentioned in a post (e.g. collaborators on a project)
export const postUserTags = pgTable(
    "post_user_tags",
    {
        postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
        taggedUserId: uuid("tagged_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.postId, t.taggedUserId] })]
);
