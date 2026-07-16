import {
    pgTable,
    uuid,
    text,
    timestamp,
    serial,
    integer,
    bigint,
    primaryKey,
    foreignKey,
} from 'drizzle-orm/pg-core';
import { users, emailSubscriptionList } from './users.schema';

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

// County-grained whitelist subscriptions (issue #131) — structural mirror of
// user_county_subscriptions keyed by whitelist entry instead of user. Expand half of an
// expand–contract: the parent's msa column stays live until every consumer migrates.
// Constraint names are explicit because the drizzle-generated ones exceed Postgres's
// 63-char identifier limit.
export const emailSubscriptionListCounties = pgTable(
    'email_subscription_list_counties',
    {
        subscriptionListId: bigint('subscription_list_id', { mode: 'number' }).notNull(),
        county: text('county').notNull(),
        state: text('state').notNull(),
        msaId: integer('msa_id')
            .notNull()
            .references(() => msas.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [
        primaryKey({
            name: 'email_subscription_list_counties_list_id_county_state_pk',
            columns: [t.subscriptionListId, t.county, t.state],
        }),
        foreignKey({
            name: 'email_subscription_list_counties_list_id_fk',
            columns: [t.subscriptionListId],
            foreignColumns: [emailSubscriptionList.id],
        }).onDelete('cascade'),
    ],
);
