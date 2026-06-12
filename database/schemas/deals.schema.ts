import {
    pgTable,
    bigserial,
    bigint,
    uuid,
    integer,
    timestamp,
    pgEnum,
    text,
    varchar,
    decimal,
    primaryKey,
    boolean,
    index,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { msas } from './msas.schema';

export const dealTypeEnum = pgEnum('deal_type', ['wholesale', 'agent', 'sold', 'reo']);

export const deals = pgTable('deals', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),

    // Nullable — populated when SFR property lookup succeeds
    sfrPropertyId: bigint('sfr_property_id', { mode: 'number' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),

    msaId: integer('msa_id').references(() => msas.id, { onDelete: 'restrict' }),
    type: dealTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    // Address fields (full address optional; city + state always set by app logic)
    address: text('address'),
    city: text('city'),
    state: varchar('state', { length: 2 }),
    zipCode: varchar('zip_code', { length: 10 }).notNull(),
    county: varchar('county', { length: 100 }),

    // Property details (fetched from SFR when address provided, else manually entered)
    price: decimal('price', { precision: 15, scale: 2 }),
    potentialARV: decimal('potential_arv', { precision: 15, scale: 2 }),
    beds: integer('beds'),
    baths: decimal('baths', { precision: 3, scale: 1 }),
    sqft: integer('sqft'),
    propertyType: varchar('property_type', { length: 100 }),
    notes: text('notes'),
    adminNotes: text('admin_notes'),
    showingTime: timestamp('showing_time', { mode: 'string' }),
    estimatedBudget: integer('estimated_budget'),
    photosUrl: text('photos_url'),

    // Admin / RM-only fields
    isArvExclusive: boolean('is_arv_exclusive').notNull().default(false),
    onBehalfOfEmail: text('on_behalf_of_email'),
});

export const dealLinks = pgTable(
    'deal_links',
    {
        dealId: bigint('deal_id', { mode: 'number' })
            .notNull()
            .references(() => deals.id, { onDelete: 'cascade' }),
        sortOrder: integer('sort_order').notNull().default(1),
        url: text('url').notNull(),
        domain: text('domain').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.dealId, t.sortOrder] })],
);

// Non-binding offers an investor submits on a deal. Full history: a user may submit
// multiple offers on the same deal over time, each a separate row. Contact fields are a
// snapshot of what the bidder entered, so later profile edits don't rewrite past offers.
export const dealBids = pgTable(
    'deal_bids',
    {
        id: bigserial('id', { mode: 'number' }).primaryKey(),
        dealId: bigint('deal_id', { mode: 'number' })
            .notNull()
            .references(() => deals.id, { onDelete: 'cascade' }),
        bidderUserId: uuid('bidder_user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
        firstName: text('first_name').notNull(),
        lastName: text('last_name').notNull(),
        email: text('email').notNull(),
        phone: text('phone'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index('idx_deal_bids_deal_created').on(t.dealId, t.createdAt.desc())],
);
