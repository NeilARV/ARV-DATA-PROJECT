import {
    pgTable,
    uuid,
    varchar,
    text,
    timestamp,
    integer,
    boolean,
    primaryKey,
    serial,
    index,
    uniqueIndex,
    date,
    pgEnum,
    jsonb,
    decimal,
} from 'drizzle-orm/pg-core';
import { msas } from './msas.schema';
import { users } from './users.schema';

export const addressTypeEnum = pgEnum('address_type', ['registered', 'mailing', 'head_office']);
export const memberRoleEnum = pgEnum('member_role', ['owner', 'member']);

export const companies = pgTable('companies', {
    id: uuid('id').defaultRandom().primaryKey(),
    companyName: text('company').unique().notNull(),
    isArvClient: boolean('is_arv_client').notNull().default(false),
    // Average, across every Arms Length sale where this company was the seller, of
    // (its purchase price for the property ÷ its sale price). Stored as the raw ratio
    // (e.g. 0.7143 → 71%) and formatted as a percent at the display edge. NULL when no
    // such sale has a traceable acquisition price. Recomputed by the data pipeline and
    // the backfill script (server/services/companies/purchaseArvRatio.services.ts).
    purchaseToArvRatio: decimal('purchase_to_arv_ratio', { precision: 6, scale: 4 }),
    // The operator group this company belongs to; null = ungrouped. Disbanding a group
    // SET NULLs this rather than deleting the company (grouping is non-destructive).
    groupId: uuid('group_id').references(() => companyGroups.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const companyDetails = pgTable('company_details', {
    id: serial('id').primaryKey(),
    companyId: uuid('company_id')
        .notNull()
        .unique()
        .references(() => companies.id, { onDelete: 'cascade' }),
    jurisdictionCode: varchar('jurisdiction_code', { length: 20 }).notNull(),
    ocCompanyNumber: varchar('oc_company_number', { length: 50 }).notNull(),
    incorporationDate: date('incorporation_date'),
    dissolutionDate: date('dissolution_date'),
    companyType: varchar('company_type', { length: 100 }),
    registryUrl: text('registry_url'),
    branch: text('branch'),
    branchStatus: text('branch_status'),
    inactive: boolean('inactive').notNull().default(false),
    sourceName: text('source_name'),
    sourceUrl: text('source_url'),
    agentName: text('agent_name'),
    agentAddress: text('agent_address'),
    alternativeNames: jsonb('alternative_names'),
    previousNames: jsonb('previous_names'),
    numberOfEmployees: integer('number_of_employees'),
    nativeCompanyNumber: varchar('native_company_number', { length: 50 }),
    alternateRegistrationEntities: jsonb('alternate_registration_entities'),
    previousRegistrationEntities: jsonb('previous_registration_entities'),
    subsequentRegistrationEntities: jsonb('subsequent_registration_entities'),
    industryCodes: jsonb('industry_codes'),
    identifiers: jsonb('identifiers'),
    trademarkRegistrations: jsonb('trademark_registrations'),
    corporateGroupings: jsonb('corporate_groupings'),
    financialSummary: text('financial_summary'),
    homeCompany: text('home_company'),
    controllingEntity: text('controlling_entity'),
    ultimateBeneficialOwners: jsonb('ultimate_beneficial_owners'),
    ultimateControllingCompany: text('ultimate_controlling_company'),
    filings: jsonb('filings'),
    enrichedAt: timestamp('enriched_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const companyAddresses = pgTable(
    'company_addresses',
    {
        id: serial('id').primaryKey(),
        companyId: uuid('company_id')
            .notNull()
            .references(() => companies.id, { onDelete: 'cascade' }),
        addressType: addressTypeEnum('address_type').notNull(),
        streetAddress: text('street_address'),
        locality: text('locality'),
        region: varchar('region', { length: 10 }),
        postalCode: varchar('postal_code', { length: 20 }),
        country: text('country'),
        addressInFull: text('address_in_full'),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [index('idx_company_addresses_company_id').on(t.companyId)],
);

export const companyContacts = pgTable(
    'company_contacts',
    {
        id: serial('id').primaryKey(),
        companyId: uuid('company_id')
            .notNull()
            .references(() => companies.id, { onDelete: 'cascade' }),
        userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
        firstName: text('first_name').notNull(),
        lastName: text('last_name'),
        email: text('email'),
        phoneNumber: varchar('phone_number', { length: 20 }),
        title: text('title'),
        address: text('address'),
        sortOrder: integer('sort_order').notNull().default(1),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [
        index('idx_company_contacts_company_id').on(t.companyId),
        uniqueIndex('idx_company_contacts_unique_name').on(t.companyId, t.firstName, t.lastName),
    ],
);

export const companyCounties = pgTable(
    'company_counties',
    {
        companyId: uuid('company_id')
            .notNull()
            .references(() => companies.id, { onDelete: 'cascade' }),
        county: text('county').notNull(),
        state: varchar('state', { length: 2 }).notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.companyId, t.county, t.state] })],
);

export const companyMsas = pgTable(
    'company_msas',
    {
        companyId: uuid('company_id')
            .notNull()
            .references(() => companies.id, { onDelete: 'cascade' }),
        msaId: integer('msa_id')
            .notNull()
            .references(() => msas.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.companyId, t.msaId] })],
);

// An admin-managed umbrella tying several company records together as one operator.
export const companyGroups = pgTable('company_groups', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').unique().notNull(),
    description: text('description'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    // DEPRECATED: the per-group approval gate is retired — every group with members is always
    // notified (a per-user opt-out will replace it). Nothing reads or writes this column anymore;
    // it's retained only so the schema mirrors the live DB and is dropped in the final-cleanup branch.
    codeViolationNotificationsEnabled: boolean('code_violation_notifications_enabled')
        .notNull()
        .default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Membership lives on the group: a member is associated with every company in the group.
export const groupMembers = pgTable(
    'group_members',
    {
        groupId: uuid('group_id')
            .notNull()
            .references(() => companyGroups.id, { onDelete: 'cascade' }),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        role: memberRoleEnum('role'),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.userId, t.groupId] }),
        index('idx_group_members_user_id').on(t.userId),
        index('idx_group_members_group_id').on(t.groupId),
    ],
);
