import {
    pgTable,
    serial,
    text,
    integer,
    uuid,
    timestamp,
    primaryKey,
    index,
} from 'drizzle-orm/pg-core';
import { properties } from './properties.schema';

export const statuses = pgTable('statuses', {
    id: serial('id').primaryKey(),
    name: text('name').unique().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const propertyStatuses = pgTable(
    'property_statuses',
    {
        propertyId: uuid('property_id')
            .notNull()
            .references(() => properties.id, { onDelete: 'cascade' }),
        statusId: integer('status_id')
            .notNull()
            .references(() => statuses.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.propertyId, t.statusId] }),
        index('idx_property_statuses_property_id').on(t.propertyId),
        index('idx_property_statuses_status_id').on(t.statusId),
    ],
);
