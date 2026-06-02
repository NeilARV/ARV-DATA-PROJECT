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
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { msas } from './msas.schema';

export const dealTypeEnum = pgEnum('deal_type', ['wholesale', 'agent', 'sold']);

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
