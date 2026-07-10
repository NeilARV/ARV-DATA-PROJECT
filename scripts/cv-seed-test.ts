/**
 * Dev helper: make the Code Violations feature *visibly* testable end-to-end.
 *
 * Finds a real property that resolves to a company owner (preferring a company whose operator group
 * has NO members, so only YOU get emailed), links the given user into that company's operator group
 * (notifications on + email verified), and writes a ready-to-upload CSV whose address is built from that property — so
 * the complaint is guaranteed to match. The CSV includes a New + an Active Enforcement row (should
 * email) and a Closed + a TMP row (should be stored, never emailed), so one upload demonstrates the
 * whole send filter.
 *
 * Usage:
 *   npx tsx scripts/cv-seed-test.ts                      # dry run — shows the plan, writes nothing
 *   npx tsx scripts/cv-seed-test.ts --apply              # seed + write cv-test-seeded.csv (email defaults to your account)
 *   npx tsx scripts/cv-seed-test.ts --apply --email=you@example.com
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { db } from 'server/storage';
import { properties, addresses, propertyTransactions } from '@database/schemas/properties.schema';
import { companies } from '@database/schemas/companies.schema';
import { users } from '@database/schemas/users.schema';
import {
    addMemberToCompany,
    getCompanyGroupNotificationTarget,
    GroupServiceError,
} from 'server/services/groups/groups.services';
import { resolveOwner } from 'server/jobs/code-violations/processes/resolve-owner';
import {
    parseCsvAddress,
    matchParsedAddress,
} from 'server/jobs/code-violations/processes/match-address';
import { normalizeAddressForMatch } from '@shared/utils/formatAddress';

const APPLY = process.argv.includes('--apply');
const emailArg = process.argv.find((a) => a.startsWith('--email='));
const EMAIL = (emailArg ? emailArg.split('=')[1] : 'justindosaj@gmail.com').trim().toLowerCase();
const OUT = resolve(process.cwd(), 'cv-test-seeded.csv');

async function scalar(q: Promise<Array<{ n: number }>>): Promise<number> {
    const [row] = await q;
    return row?.n ?? 0;
}

/** Build the Accela raw-address string from a stored address so it normalizes back to a match. */
function buildRawAddress(a: {
    formattedStreetAddress: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
}): string {
    const locality = [a.city, a.state, a.zipCode].filter(Boolean).join(' ');
    return locality ? `${a.formattedStreetAddress}, ${locality}` : `${a.formattedStreetAddress}`;
}

function csvRow(fields: string[]): string {
    return fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(',');
}

async function main() {
    console.log(`\n=== cv-seed-test (${APPLY ? 'APPLY' : 'dry run'}) — recipient: ${EMAIL} ===\n`);

    // ── DB snapshot ────────────────────────────────────────────────────────────
    const propCount = await scalar(db.select({ n: sql<number>`count(*)::int` }).from(properties));
    const addrCount = await scalar(db.select({ n: sql<number>`count(*)::int` }).from(addresses));
    const companyCount = await scalar(db.select({ n: sql<number>`count(*)::int` }).from(companies));
    const buyerTxCount = await scalar(
        db
            .select({ n: sql<number>`count(*)::int` })
            .from(propertyTransactions)
            .where(isNotNull(propertyTransactions.buyerId)),
    );
    console.log(
        `DB: ${propCount} properties · ${addrCount} addresses · ${companyCount} companies · ${buyerTxCount} txns with a company buyer\n`,
    );

    // ── Recipient ────────────────────────────────────────────────────────────────
    const [user] = await db
        .select({
            id: users.id,
            email: users.email,
            notifications: users.notifications,
            emailVerifiedAt: users.emailVerifiedAt,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${EMAIL}`)
        .limit(1);

    if (!user) {
        console.log(
            `⚠️  No user with email "${EMAIL}". Sign up with it first, or pass --email=<your account email>.`,
        );
    } else {
        const killSwitch =
            user.notifications && user.emailVerifiedAt
                ? 'passes'
                : 'BLOCKED (will be fixed on --apply)';
        console.log(
            `Recipient user ${user.id} — notifications=${user.notifications}, emailVerified=${Boolean(user.emailVerifiedAt)} → kill-switch ${killSwitch}\n`,
        );
    }

    // ── Find a matchable, company-owned property (prefer a member-less company) ───
    const txProps = await db
        .selectDistinct({ propertyId: propertyTransactions.propertyId })
        .from(propertyTransactions)
        .where(isNotNull(propertyTransactions.buyerId))
        .limit(300);

    let chosen: {
        propertyId: string;
        companyId: string;
        companyName: string | null;
        memberCount: number;
        raw: string;
    } | null = null;

    for (const { propertyId } of txProps) {
        const owner = await resolveOwner(propertyId);
        if (!owner.ownerCompanyId) continue; // individual/unlinked — can't use

        const [addr] = await db
            .select({
                formattedStreetAddress: addresses.formattedStreetAddress,
                city: addresses.city,
                state: addresses.state,
                zipCode: addresses.zipCode,
            })
            .from(addresses)
            .where(eq(addresses.propertyId, propertyId))
            .limit(1);
        if (!addr?.formattedStreetAddress) continue;

        // Prove the built address actually matches this property before trusting it.
        const raw = buildRawAddress(addr);
        const outcome = matchParsedAddress(parseCsvAddress(raw), [
            {
                propertyId,
                normalizedStreet: normalizeAddressForMatch(addr.formattedStreetAddress),
                city: addr.city,
                state: addr.state,
                zipCode: addr.zipCode,
            },
        ]);
        if (outcome.kind !== 'matched') continue;

        // Notifiability is group-wide now (#93): a company with no operator group, or a group with
        // no members, emails nobody — the ideal target, since only the recipient we add will be told.
        const target = await getCompanyGroupNotificationTarget(owner.ownerCompanyId);
        const memberCount = target ? target.memberUserIds.length : 0;
        const [co] = await db
            .select({ companyName: companies.companyName })
            .from(companies)
            .where(eq(companies.id, owner.ownerCompanyId))
            .limit(1);

        const cand = {
            propertyId,
            companyId: owner.ownerCompanyId,
            companyName: co?.companyName ?? null,
            memberCount,
            raw,
        };
        if (memberCount === 0) {
            chosen = cand; // ideal: only the recipient will be a member → only they get emailed
            break;
        }
        if (!chosen) chosen = cand; // fallback (its existing members would also be emailed)
    }

    if (!chosen) {
        console.log(
            '❌ No company-owned property whose address matches was found. Your DB may only have individual-owned properties. Tell me and I can extend this to CREATE a test company + transaction.',
        );
        process.exit(1);
    }

    console.log('Chosen target:');
    console.log(`  property   ${chosen.propertyId}`);
    console.log(`  company    ${chosen.companyId} (${chosen.companyName ?? '—'})`);
    console.log(
        `  members    ${chosen.memberCount}${chosen.memberCount === 0 ? ' ✅ (only you will be emailed)' : ' ⚠️ existing members will ALSO be emailed'}`,
    );
    console.log(`  address    ${chosen.raw}\n`);

    const ts = Date.now();
    const today = new Date();
    const date = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
    const rows = [
        { rn: `CE-TEST-${ts}-NEW`, status: 'New', desc: 'TEST New complaint — should EMAIL' },
        {
            rn: `CE-TEST-${ts}-AE`,
            status: 'Active Enforcement',
            desc: 'TEST Active Enforcement — should EMAIL',
        },
        {
            rn: `CE-TEST-${ts}-CLOSED`,
            status: 'Closed - No Violation',
            desc: 'TEST Closed — should NOT email',
        },
        { rn: `26TMP-TEST-${ts}`, status: '', desc: 'TEST temporary permit — should NOT email' },
    ];

    console.log('Planned CSV rows (all matching the property above):');
    for (const r of rows) {
        const willEmail =
            r.rn.toUpperCase().startsWith('CE') &&
            (r.status === 'New' || r.status.startsWith('Active'));
        console.log(
            `  ${willEmail ? '📧 EMAIL ' : '🗄️  store '} ${r.rn.padEnd(22)} ${r.status || '(no status)'}`,
        );
    }

    if (!APPLY) {
        console.log('\nDry run — nothing written. Re-run with --apply to seed + write the CSV.\n');
        process.exit(0);
    }

    if (!user) {
        console.log(
            '\n❌ Cannot --apply without a matching user. Pass --email=<your account email>.\n',
        );
        process.exit(1);
    }

    // ── Seed ──────────────────────────────────────────────────────────────────────
    await db
        .update(users)
        .set({ notifications: true, emailVerifiedAt: user.emailVerifiedAt ?? new Date() })
        .where(eq(users.id, user.id));

    // Adding the recipient to the company's operator group (auto-creating a singleton group if the
    // company is ungrouped) is what makes the violation notifiable to them (#93). Re-runs are no-ops.
    try {
        await addMemberToCompany({
            companyId: chosen.companyId,
            userId: user.id,
            role: null,
            createdBy: user.id,
        });
    } catch (err) {
        if (!(err instanceof GroupServiceError) || err.statusCode !== 409) throw err;
    }
    const seededTarget = await getCompanyGroupNotificationTarget(chosen.companyId);

    const header = 'Date,Record Number,Record Type,Address,Application Name,Status,Description';
    const body = rows
        .map((r) =>
            csvRow([
                date,
                r.rn,
                'Complaint',
                chosen!.raw,
                'Building-Substandard Housing',
                r.status,
                r.desc,
            ]),
        )
        .join('\n');
    writeFileSync(OUT, `${header}\n${body}\n`);

    console.log(
        `\n✅ Seeded. Linked ${EMAIL} into the operator group for company ${chosen.companyId}.`,
    );
    console.log(`✅ Wrote ${OUT}\n`);
    console.log(
        'Next: launch the app, open Admin → Code Violations, and upload cv-test-seeded.csv.',
    );
    console.log(
        'Expect: the New + Active Enforcement rows email you; Closed + TMP are stored, not emailed.\n',
    );
    console.log('Cleanup when done:');
    if (seededTarget) {
        console.log(
            `  DELETE FROM group_members WHERE user_id='${user.id}' AND group_id='${seededTarget.groupId}';`,
        );
    }
    console.log(
        `  DELETE FROM cv_violations WHERE record_number LIKE 'CE-TEST-%' OR record_number LIKE '26TMP-TEST-%';\n`,
    );
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
