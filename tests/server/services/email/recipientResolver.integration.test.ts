import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { msas, userCountySubscriptions } from '@database/schemas/msas.schema';
import { users, userNotificationPreferences } from '@database/schemas/users.schema';
import {
    resolveDealRecipients,
    resolveDataAppRecipients,
    type DealRecipientQuery,
    type DataAppRecipient,
} from 'server/services/email/recipientResolver';
import { getTestDb, seedTestUser, deleteTestUser } from '../../../helpers/db';

// The recipient resolver is the single "who receives this deal" seam (issue #116). These tests
// assert the pure resolver contract against seeded county subscriptions (TST.INT-SIDE-EFFECT) —
// membership in/out per case, never set-equality, because the shared test branch holds rows
// from other parallel files and possibly real backfilled data.

// UUIDs unique to this file (TST.UNIQUE-UUID) — files run in parallel.
const ORANGE_SUB = '00000116-0000-4000-8000-000000000001';
const LA_SUB = '00000116-0000-4000-8000-000000000002';
const SD_SUB = '00000116-0000-4000-8000-000000000003';
const RIVERSIDE_SUB = '00000116-0000-4000-8000-000000000004';
const MULTI_MSA_SUB = '00000116-0000-4000-8000-000000000005';
const MASTER_OFF = '00000116-0000-4000-8000-000000000006';
const DEAL_TOGGLE_OFF = '00000116-0000-4000-8000-000000000007';
const WHOLESALE_ONLY = '00000116-0000-4000-8000-000000000008';
// Subscribed to two counties of the same MSA (Orange + Los Angeles) — exercises dedup and
// poster exclusion.
const POSTER = '00000116-0000-4000-8000-000000000009';
// Never seeded — a poster with no subscription rows, so poster exclusion is a no-op.
const OUTSIDE_POSTER = '00000116-0000-4000-8000-00000000000a';
// Daily-digest cases (issue #117): the Data App toggle and status filter are independent of
// the deal-side toggles above.
const DATA_APP_OFF = '00000116-0000-4000-8000-00000000000b';
const SOLD_STATUS_FILTER = '00000116-0000-4000-8000-00000000000c';

const SEEDED_USERS = [
    ORANGE_SUB,
    LA_SUB,
    SD_SUB,
    RIVERSIDE_SUB,
    MULTI_MSA_SUB,
    MASTER_OFF,
    DEAL_TOGGLE_OFF,
    WHOLESALE_ONLY,
    POSTER,
    DATA_APP_OFF,
    SOLD_STATUS_FILTER,
];

const LA_MSA = 'Los Angeles-Long Beach-Anaheim, CA';
const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA';
const RIVERSIDE_MSA = 'Riverside-San Bernardino-Ontario, CA';

const db = getTestDb();

async function ensureMsa(name: string): Promise<number> {
    // MSAs are shared reference data — never deleted in teardown; ensure-then-read repeats safely.
    await db.insert(msas).values({ name }).onConflictDoNothing();
    const [row] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, name));
    return row.id;
}

let laMsaId: number;
let sdMsaId: number;
let riversideMsaId: number;

function orangeDeal(overrides: Partial<DealRecipientQuery> = {}): DealRecipientQuery {
    return {
        msaId: laMsaId,
        dealType: 'agent',
        county: 'Orange',
        city: 'Irvine',
        state: 'CA',
        posterUserId: OUTSIDE_POSTER,
        ...overrides,
    };
}

async function recipientIds(query: DealRecipientQuery): Promise<Set<string>> {
    const { recipients } = await resolveDealRecipients(query);
    return new Set(recipients.map((r) => r.userId));
}

beforeAll(async () => {
    laMsaId = await ensureMsa(LA_MSA);
    sdMsaId = await ensureMsa(SD_MSA);
    riversideMsaId = await ensureMsa(RIVERSIDE_MSA);

    for (const id of SEEDED_USERS) {
        await deleteTestUser(id); // clear leftovers from an aborted previous run
        await seedTestUser(id);
    }

    await db
        .insert(userNotificationPreferences)
        .values([
            { userId: ORANGE_SUB },
            { userId: LA_SUB },
            { userId: SD_SUB },
            { userId: RIVERSIDE_SUB },
            { userId: MULTI_MSA_SUB },
            { userId: MASTER_OFF },
            { userId: DEAL_TOGGLE_OFF, dealNotificationsEnabled: false },
            { userId: WHOLESALE_ONLY, dealTypeFilter: ['wholesale'] },
            { userId: POSTER },
            { userId: DATA_APP_OFF, dataAppEnabled: false },
            { userId: SOLD_STATUS_FILTER, dataAppStatusFilter: ['sold'] },
        ]);
    await db.update(users).set({ notifications: false }).where(eq(users.id, MASTER_OFF));

    await db.insert(userCountySubscriptions).values([
        { userId: ORANGE_SUB, county: 'Orange', state: 'CA', msaId: laMsaId },
        { userId: LA_SUB, county: 'Los Angeles', state: 'CA', msaId: laMsaId },
        { userId: SD_SUB, county: 'San Diego', state: 'CA', msaId: sdMsaId },
        { userId: RIVERSIDE_SUB, county: 'Riverside', state: 'CA', msaId: riversideMsaId },
        { userId: MULTI_MSA_SUB, county: 'San Diego', state: 'CA', msaId: sdMsaId },
        { userId: MULTI_MSA_SUB, county: 'Orange', state: 'CA', msaId: laMsaId },
        { userId: MASTER_OFF, county: 'Orange', state: 'CA', msaId: laMsaId },
        { userId: DEAL_TOGGLE_OFF, county: 'Orange', state: 'CA', msaId: laMsaId },
        { userId: WHOLESALE_ONLY, county: 'Orange', state: 'CA', msaId: laMsaId },
        { userId: POSTER, county: 'Orange', state: 'CA', msaId: laMsaId },
        { userId: POSTER, county: 'Los Angeles', state: 'CA', msaId: laMsaId },
        { userId: DATA_APP_OFF, county: 'Orange', state: 'CA', msaId: laMsaId },
        { userId: SOLD_STATUS_FILTER, county: 'Orange', state: 'CA', msaId: laMsaId },
    ]);
});

afterAll(async () => {
    // Prefs and county-subscription rows cascade with each user delete.
    for (const id of SEEDED_USERS) {
        await deleteTestUser(id);
    }
});

describe('resolveDealRecipients — exact-county targeting', () => {
    it('tracked county — notifies only that county’s subscribers, not the rest of the MSA', async () => {
        const ids = await recipientIds(orangeDeal());
        expect(ids).toContain(ORANGE_SUB);
        expect(ids).not.toContain(LA_SUB); // the anti-flooding point of county granularity
        expect(ids).not.toContain(SD_SUB);
        expect(ids).not.toContain(RIVERSIDE_SUB);
    });

    it('multi-MSA subscriber — receives the deal matching their county in each MSA', async () => {
        const orangeIds = await recipientIds(orangeDeal());
        expect(orangeIds).toContain(MULTI_MSA_SUB);

        const sdIds = await recipientIds(
            orangeDeal({ msaId: sdMsaId, county: 'San Diego', city: 'San Diego' }),
        );
        expect(sdIds).toContain(MULTI_MSA_SUB);
        expect(sdIds).toContain(SD_SUB);

        const laProperIds = await recipientIds(
            orangeDeal({ county: 'Los Angeles', city: 'Los Angeles' }),
        );
        expect(laProperIds).toContain(LA_SUB);
        expect(laProperIds).not.toContain(MULTI_MSA_SUB); // subscribed to Orange, not LA proper
        expect(laProperIds).not.toContain(ORANGE_SUB);
    });

    it('returns one msaId (the deal’s own) for a non-companion deal', async () => {
        const { msaIds } = await resolveDealRecipients(orangeDeal());
        expect(msaIds).toEqual([laMsaId]);
    });
});

describe('resolveDealRecipients — MSA safety net', () => {
    it('null county — falls back to every subscriber of the deal’s whole MSA', async () => {
        const ids = await recipientIds(orangeDeal({ county: null, city: 'Somewhere' }));
        expect(ids).toContain(ORANGE_SUB);
        expect(ids).toContain(LA_SUB);
        expect(ids).toContain(MULTI_MSA_SUB);
        expect(ids).not.toContain(SD_SUB);
        expect(ids).not.toContain(RIVERSIDE_SUB);
    });

    it('untracked county — falls back to the whole MSA rather than dropping the deal', async () => {
        const ids = await recipientIds(orangeDeal({ county: 'Nowhere' }));
        expect(ids).toContain(ORANGE_SUB);
        expect(ids).toContain(LA_SUB);
    });

    it('tracked county with a null state — treated as unresolvable, falls back to the MSA', async () => {
        const ids = await recipientIds(orangeDeal({ state: null }));
        expect(ids).toContain(LA_SUB);
    });

    it('never returns the same user twice in a fallback fan-out', async () => {
        // POSTER holds two counties in the LA MSA, so the MSA-wide scope matches them twice.
        const { recipients } = await resolveDealRecipients(
            orangeDeal({ county: null, city: 'Somewhere' }),
        );
        const ids = recipients.map((r) => r.userId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('resolveDealRecipients — companion cities', () => {
    it('Temecula deal (county Riverside, posted under the SD MSA) — reaches San Diego subscribers, preserving today’s behavior', async () => {
        const query = orangeDeal({
            msaId: sdMsaId,
            county: 'Riverside',
            city: 'Temecula',
        });
        const ids = await recipientIds(query);
        expect(ids).toContain(SD_SUB);
        expect(ids).toContain(MULTI_MSA_SUB);
        expect(ids).not.toContain(RIVERSIDE_SUB); // exact-county match is bypassed for companions
        expect(ids).not.toContain(ORANGE_SUB);

        const { msaIds } = await resolveDealRecipients(query);
        expect(msaIds).toEqual([sdMsaId]);
    });

    it('companion deal carrying a different primary MSA — fans out over primary ∪ companion', async () => {
        const query = orangeDeal({
            msaId: riversideMsaId,
            county: 'Riverside',
            city: 'Murrieta',
        });
        const ids = await recipientIds(query);
        expect(ids).toContain(RIVERSIDE_SUB);
        expect(ids).toContain(SD_SUB);

        const { msaIds } = await resolveDealRecipients(query);
        expect(msaIds).toEqual([riversideMsaId, sdMsaId]);
    });
});

describe('resolveDealRecipients — toggles, filters, poster', () => {
    it('master kill-switch off — excluded even with a matching subscription', async () => {
        const ids = await recipientIds(orangeDeal());
        expect(ids).not.toContain(MASTER_OFF);
    });

    it('deal notifications toggle off — excluded even with a matching subscription', async () => {
        const ids = await recipientIds(orangeDeal());
        expect(ids).not.toContain(DEAL_TOGGLE_OFF);
    });

    it('deal-type filter — excluded when the deal type is not in the filter, included when it is', async () => {
        const agentIds = await recipientIds(orangeDeal({ dealType: 'agent' }));
        expect(agentIds).not.toContain(WHOLESALE_ONLY);

        const wholesaleIds = await recipientIds(orangeDeal({ dealType: 'wholesale' }));
        expect(wholesaleIds).toContain(WHOLESALE_ONLY);
        expect(wholesaleIds).toContain(ORANGE_SUB); // empty filter receives all types
    });

    it('poster — excluded from their own deal’s recipients', async () => {
        const ids = await recipientIds(orangeDeal({ posterUserId: POSTER }));
        expect(ids).not.toContain(POSTER);
        expect(ids).toContain(ORANGE_SUB);
    });
});

async function dataAppRecipientsById(msaId: number): Promise<Map<string, DataAppRecipient>> {
    const recipients = await resolveDataAppRecipients(msaId);
    return new Map(recipients.map((r) => [r.userId, r]));
}

describe('resolveDataAppRecipients — daily digest membership', () => {
    it('county subscriber in the MSA — included, carrying their subscribed counties', async () => {
        const byId = await dataAppRecipientsById(laMsaId);
        expect(byId.get(ORANGE_SUB)?.counties).toEqual(['Orange']);
        expect(byId.get(LA_SUB)?.counties).toEqual(['Los Angeles']);
    });

    it('subscriber of a different MSA only — excluded', async () => {
        const byId = await dataAppRecipientsById(laMsaId);
        expect(byId.has(SD_SUB)).toBe(false);
        expect(byId.has(RIVERSIDE_SUB)).toBe(false);
    });

    it('master kill-switch off — excluded even with a matching subscription', async () => {
        const byId = await dataAppRecipientsById(laMsaId);
        expect(byId.has(MASTER_OFF)).toBe(false);
    });

    it('Data App toggle off — excluded even with a matching subscription', async () => {
        const byId = await dataAppRecipientsById(laMsaId);
        expect(byId.has(DATA_APP_OFF)).toBe(false);
    });

    it('deal toggle off — still included (app toggles are independent)', async () => {
        const byId = await dataAppRecipientsById(laMsaId);
        expect(byId.has(DEAL_TOGGLE_OFF)).toBe(true);
    });

    it('multi-county subscriber — one recipient row carrying every county in the MSA', async () => {
        const byId = await dataAppRecipientsById(laMsaId);
        expect(byId.get(POSTER)?.counties?.sort()).toEqual(['Los Angeles', 'Orange']);
    });

    it('multi-MSA subscriber — counties are scoped to the queried MSA', async () => {
        const laById = await dataAppRecipientsById(laMsaId);
        expect(laById.get(MULTI_MSA_SUB)?.counties).toEqual(['Orange']);

        const sdById = await dataAppRecipientsById(sdMsaId);
        expect(sdById.get(MULTI_MSA_SUB)?.counties).toEqual(['San Diego']);
    });

    it('returns each user’s dataAppStatusFilter for the job’s per-user content filter', async () => {
        const byId = await dataAppRecipientsById(laMsaId);
        expect(byId.get(SOLD_STATUS_FILTER)?.dataAppStatusFilter).toEqual(['sold']);
        expect(byId.get(ORANGE_SUB)?.dataAppStatusFilter).toEqual([]);
    });
});
