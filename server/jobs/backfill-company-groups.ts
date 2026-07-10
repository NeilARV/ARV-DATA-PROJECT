// One-off backfill for Company Groups Phase 1 (ticket #87 of #85). Run once against prod after the
// schema lands; nothing user-facing changes. company_members stays the live write path in Phase 1.

import { db } from 'server/storage';
import { eq, isNull } from 'drizzle-orm';
import {
    companies,
    companyGroups,
    companyMembers,
    groupMembers,
} from '@database/schemas/companies.schema';

export interface CompanyGroupsBackfillResult {
    /** Ungrouped companies with ≥1 member found (and processed) this run. */
    companiesScanned: number;
    /** New `company_groups` rows inserted — 0 on a clean re-run. */
    groupsCreated: number;
    /** New `group_members` rows inserted — 0 on a clean re-run. */
    membersCopied: number;
}

/**
 * Seeds a singleton `company_groups` row per membered company from `company_members`, links
 * `companies.group_id`, and copies each membership verbatim into `group_members` (a user in N
 * companies becomes a member of N singleton groups); member-less companies are left untouched.
 * Idempotent and resumable — the driving filter is `group_id IS NULL`, `companies.group_id` is set
 * LAST as the "done" marker, and every write is conflict-guarded (neon-http has no interactive tx).
 * Side effect: writes company_groups, group_members, and companies.group_id.
 */
export async function backfillCompanyGroups(): Promise<CompanyGroupsBackfillResult> {
    const result: CompanyGroupsBackfillResult = {
        companiesScanned: 0,
        groupsCreated: 0,
        membersCopied: 0,
    };

    // Every ungrouped company that has at least one member, once. Company names are UNIQUE, so
    // each maps to exactly one singleton group named after it — no collision handling needed.
    const targets = await db
        .selectDistinct({ id: companies.id, name: companies.companyName })
        .from(companies)
        .innerJoin(companyMembers, eq(companyMembers.companyId, companies.id))
        .where(isNull(companies.groupId));

    for (const company of targets) {
        result.companiesScanned += 1;

        // Upsert the singleton group. onConflictDoNothing makes a re-run — or a crash-resumed run
        // where the group already exists but group_id was not yet set — a safe no-op.
        const [inserted] = await db
            .insert(companyGroups)
            .values({ name: company.name })
            .onConflictDoNothing({ target: companyGroups.name })
            .returning({ id: companyGroups.id });

        let groupId: string;
        if (inserted) {
            groupId = inserted.id;
            result.groupsCreated += 1;
        } else {
            const [existing] = await db
                .select({ id: companyGroups.id })
                .from(companyGroups)
                .where(eq(companyGroups.name, company.name));
            if (!existing) {
                throw new Error(
                    `company_groups row for "${company.name}" not found after conflict — backfill aborted`,
                );
            }
            groupId = existing.id;
        }

        // Copy each membership verbatim; the (user_id, group_id) PK makes a re-copy a no-op.
        const members = await db
            .select()
            .from(companyMembers)
            .where(eq(companyMembers.companyId, company.id));

        if (members.length > 0) {
            const copied = await db
                .insert(groupMembers)
                .values(
                    members.map((member) => ({
                        groupId,
                        userId: member.userId,
                        role: member.role,
                        isPrimary: member.isPrimary,
                        createdAt: member.createdAt,
                    })),
                )
                .onConflictDoNothing()
                .returning({ userId: groupMembers.userId });
            result.membersCopied += copied.length;
        }

        // Link the company LAST: a set group_id is the "done" marker that excludes this company
        // from the driving filter next run, so an interrupted run resumes without duplicating.
        await db.update(companies).set({ groupId }).where(eq(companies.id, company.id));
    }

    return result;
}
