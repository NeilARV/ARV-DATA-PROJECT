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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { msas } from './msas.schema';
import { users } from './users.schema';

export const addressTypeEnum = pgEnum('address_type', ['registered', 'mailing', 'head_office']);
export const claimStatusEnum = pgEnum('claim_status', ['pending', 'approved', 'rejected']);
export const claimTypeEnum = pgEnum('claim_type', ['claim', 'dispute']);
export const memberRoleEnum = pgEnum('member_role', ['owner', 'member']);

export const companies = pgTable('companies', {
    id: uuid('id').defaultRandom().primaryKey(),
    companyName: text('company').unique().notNull(),
    isArvClient: boolean('is_arv_client').notNull().default(false),
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

export const companyClaims = pgTable(
    'company_claims',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        companyId: uuid('company_id')
            .notNull()
            .references(() => companies.id, { onDelete: 'cascade' }),
        status: claimStatusEnum('status').notNull().default('pending'),
        type: claimTypeEnum('type').notNull().default('claim'),
        userMessage: text('user_message'),
        adminNotes: text('admin_notes'),
        adminMessage: text('admin_message'),
        reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
        reviewedAt: timestamp('reviewed_at'),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (t) => [
        index('idx_company_claims_user_status').on(t.userId, t.status),
        index('idx_company_claims_company_status').on(t.companyId, t.status),
        index('idx_company_claims_status_created').on(t.status, t.createdAt),
        uniqueIndex('idx_company_claims_unique_active_user_company')
            .on(t.userId, t.companyId)
            .where(sql`status != 'rejected'`),
    ],
);

export const companyMembers = pgTable(
    'company_members',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        companyId: uuid('company_id')
            .notNull()
            .references(() => companies.id, { onDelete: 'cascade' }),
        role: memberRoleEnum('role'),
        isPrimary: boolean('is_primary').notNull().default(false),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.userId, t.companyId] }),
        index('idx_company_members_user_id').on(t.userId),
        index('idx_company_members_company_id').on(t.companyId),
    ],
);
