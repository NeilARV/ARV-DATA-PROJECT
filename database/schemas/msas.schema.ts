import { pgTable, uuid, text, timestamp, serial, integer, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const msas = pgTable('msas', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// County-grained subscriptions (issue #113) — the subscription unit since user_msa_subscriptions
// was dropped (#118). msaId is denormalized (derivable from county via COUNTY_TO_MSA) so per-MSA
// email queries stay a single-column filter without a join back through counties.
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
