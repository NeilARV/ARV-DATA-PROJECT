import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { msas, userMsaSubscriptions, userCountySubscriptions } from '@database/schemas/msas.schema';
import { getCountiesForMsa, getStateFromMsaName } from '@shared/constants/countyToMsa';
import { backfillCountySubscriptions } from 'server/services/subscriptions/countySubscriptions.services';
import { getTestDb, seedTestUser, deleteTestUser } from '../../../helpers/db';

// UUIDs unique to this file (TST.UNIQUE-UUID) — files run in parallel.
const DENVER_USER = '00000113-0000-4000-8000-000000000001';
const SD_USER = '00000113-0000-4000-8000-000000000002';

const DENVER_MSA = 'Denver-Aurora-Centennial, CO'; // multi-county
const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA'; // 1:1 (single county)

const db = getTestDb();

async function ensureMsa(name: string): Promise<number> {
    // MSAs are shared reference data — never deleted in teardown; ensure-then-read is safe to repeat.
    await db.insert(msas).values({ name }).onConflictDoNothing();
    const [row] = await db.select({ id: msas.id }).from(msas).where(eq(msas.name, name));
    return row.id;
}

async function countyRowsFor(userId: string) {
    return db
        .select({ county: userCountySubscriptions.county, state: userCountySubscriptions.state })
        .from(userCountySubscriptions)
        .where(eq(userCountySubscriptions.userId, userId));
}

let denverMsaId: number;
let sdMsaId: number;

beforeAll(async () => {
    denverMsaId = await ensureMsa(DENVER_MSA);
    sdMsaId = await ensureMsa(SD_MSA);

    await seedTestUser(DENVER_USER);
    await seedTestUser(SD_USER);
    await db.insert(userMsaSubscriptions).values([
        { userId: DENVER_USER, msaId: denverMsaId },
        { userId: SD_USER, msaId: sdMsaId },
    ]);

    await backfillCountySubscriptions();
});

afterAll(async () => {
    // Cascades to both userMsaSubscriptions and userCountySubscriptions via the user_id FKs.
    await deleteTestUser(DENVER_USER);
    await deleteTestUser(SD_USER);
});

describe('backfillCountySubscriptions', () => {
    it('expands a multi-county MSA subscription into exactly one row per county in that MSA', async () => {
        const rows = await countyRowsFor(DENVER_USER);
        const expectedCounties = getCountiesForMsa(DENVER_MSA);
        const expectedState = getStateFromMsaName(DENVER_MSA);

        expect(rows).toHaveLength(expectedCounties.length);
        expect(new Set(rows.map((r) => r.county))).toEqual(new Set(expectedCounties));
        for (const row of rows) {
            expect(row.state).toBe(expectedState);
        }
    });

    it('expands a 1:1 MSA (San Diego) into exactly one county row', async () => {
        const rows = await countyRowsFor(SD_USER);
        expect(rows).toEqual([{ county: 'San Diego', state: 'CA' }]);
    });

    it('is idempotent — a re-run inserts nothing and leaves the rows unchanged', async () => {
        const before = await countyRowsFor(DENVER_USER);
        const result = await backfillCountySubscriptions();
        expect(result.countyRowsInserted).toBe(0);
        expect(await countyRowsFor(DENVER_USER)).toHaveLength(before.length);
    });
});
