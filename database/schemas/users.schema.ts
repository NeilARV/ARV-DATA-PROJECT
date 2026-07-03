import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    boolean,
    integer,
    serial,
    bigserial,
    primaryKey,
    unique,
} from 'drizzle-orm/pg-core';

// Sessions
export const sessions = pgTable('sessions', {
    sid: varchar('sid').primaryKey(),
    sess: text('sess').notNull(),
    expire: integer('expire').notNull(),
});

// Email Subscription List (msa references msas.id)
export const emailSubscriptionList = pgTable('email_subscription_list', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').unique().notNull(),
    msa: integer('msa'),
    relationshipManagerId: uuid('relationship_manager_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Subscriptions lookup table (basic, pro, premium)
export const subscriptions = pgTable('subscriptions', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 20 }).notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Users (ARV team roles via user_roles + roles; subscription tier via subscription_id FK)
export const users = pgTable(
    'users',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        firstName: text('first_name').notNull(),
        lastName: text('last_name').notNull(),
        phone: text('phone').notNull(),
        email: text('email').unique().notNull(),
        passwordHash: text('password_hash').notNull(),
        mustResetPassword: boolean('must_reset_password').notNull().default(false),
        // Null = unverified. Existing users were grandfathered to verified by a
        // one-off rollout backfill (UPDATE users SET email_verified_at = now()).
        emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        notifications: boolean('notifications').notNull().default(true),
        updatedAt: timestamp('updated_at').defaultNow(),
        subscriptionId: integer('subscription_id').references(() => subscriptions.id, {
            onDelete: 'set null',
        }),
        county: text('county').default('San Diego'),
        state: varchar('state', { length: 2 }).default('CA'),
        profileImageUrl: text('profile_image_url'),
    },
    (t) => [unique('users_id_uuid_unique').on(t.id)],
);

// Roles (owner, admin, relationship-manager, member)
export const roles = pgTable('roles', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User–role assignment (many-to-many)
export const userRoles = pgTable(
    'user_roles',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        roleId: integer('role_id')
            .notNull()
            .references(() => roles.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

// Account types lookup (agent, investor, wholesaler)
export const accountTypes = pgTable('account_types', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User–account type assignment (many-to-many)
export const userAccountTypes = pgTable(
    'user_account_types',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        accountTypeId: integer('account_type_id')
            .notNull()
            .references(() => accountTypes.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.accountTypeId] })],
);

// Per-user notification preferences (one row per user; created on first save)
export const userNotificationPreferences = pgTable('user_notification_preferences', {
    userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id, { onDelete: 'cascade' }),

    // Per-app toggles
    dataAppEnabled: boolean('data_app_enabled').notNull().default(true),
    dealNotificationsEnabled: boolean('deal_notifications_enabled').notNull().default(true),
    vendorNotificationsEnabled: boolean('vendor_notifications_enabled').notNull().default(false),
    analyticsEnabled: boolean('analytics_enabled').notNull().default(false),

    // Data App: which property statuses to include ('in-renovation' | 'on-market' | 'wholesale' | 'sold')
    // Empty array = all statuses
    dataAppStatusFilter: text('data_app_status_filter').array().notNull().default([]),

    // Deals: which deal types to receive ('wholesale' | 'agent' | 'sold' | 'reo')
    // Empty array = all types
    dealTypeFilter: text('deal_type_filter').array().notNull().default([]),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// User–relationship manager assignment (many-to-many)
export const userRelationshipManagers = pgTable(
    'user_relationship_managers',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        relationshipManagerId: uuid('relationship_manager_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.relationshipManagerId] })],
);
