import { pgTable, uuid, text, timestamp, serial, integer, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const msas = pgTable('msas', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const userMsaSubscriptions = pgTable(
    'user_msa_subscriptions',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        msaId: integer('msa_id')
            .notNull()
            .references(() => msas.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.msaId] })],
);

// County-grained subscriptions (issue #113): the sub-MSA control userMsaSubscriptions can't express.
// Lives alongside userMsaSubscriptions, which stays authoritative until later county-granularity
// tickets re-point consumers and drop the MSA table. msaId is denormalized (derivable from county via
// COUNTY_TO_MSA) so per-MSA email queries stay a single-column filter without a join back through counties.
export const userCountySubscriptions = pgTable(
    'user_county_subscriptions',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        county: text('county').notNull(),
        state: text('state').notNull(),
        msaId: integer('msa_id')
            .notNull()
            .references(() => msas.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.county, t.state] })],
);
