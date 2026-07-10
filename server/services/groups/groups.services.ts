import { db } from 'server/storage';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import { companies, companyGroups, groupMembers } from '@database/schemas/companies.schema';
import { users } from '@database/schemas/users.schema';
import type { CompanyGroup, GroupMember } from '@database/types/companies';
import type { GroupSummary, GroupDetail } from '@shared/types/groups';
import type { MemberRoleInput } from '@database/validation/groups.validation';
import { isUniqueViolation } from 'server/utils/dbErrors';

export class GroupServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'GroupServiceError';
    }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

async function requireGroup(groupId: string): Promise<CompanyGroup> {
    const [group] = await db
        .select()
        .from(companyGroups)
        .where(eq(companyGroups.id, groupId))
        .limit(1);
    if (!group) throw new GroupServiceError(404, 'Group not found');
    return group;
}

async function requireUser(userId: string): Promise<void> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new GroupServiceError(404, 'User not found');
}

/**
 * Inserts a group membership, rejecting a user who is already a member (409). The unique-violation
 * catch covers the race between the pre-check and the insert (neon-http has no interactive tx).
 */
async function insertMembership(
    groupId: string,
    userId: string,
    role: MemberRoleInput | null,
): Promise<GroupMember> {
    const [existing] = await db
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
    if (existing) throw new GroupServiceError(409, 'User is already a member of this group');

    try {
        const [row] = await db.insert(groupMembers).values({ groupId, userId, role }).returning();
        return row;
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new GroupServiceError(409, 'User is already a member of this group');
        }
        throw err;
    }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Lists all groups (name order) with their company + member counts for the admin list view. */
export async function listGroups(): Promise<GroupSummary[]> {
    const [groups, companyCounts, memberCounts] = await Promise.all([
        db.select().from(companyGroups).orderBy(companyGroups.name),
        db
            .select({ groupId: companies.groupId, count: sql<number>`count(*)::int` })
            .from(companies)
            .where(isNotNull(companies.groupId))
            .groupBy(companies.groupId),
        db
            .select({ groupId: groupMembers.groupId, count: sql<number>`count(*)::int` })
            .from(groupMembers)
            .groupBy(groupMembers.groupId),
    ]);

    const companyCountByGroup = new Map(companyCounts.map((r) => [r.groupId, r.count]));
    const memberCountByGroup = new Map(memberCounts.map((r) => [r.groupId, r.count]));

    return groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt ? g.updatedAt.toISOString() : null,
        companyCount: companyCountByGroup.get(g.id) ?? 0,
        memberCount: memberCountByGroup.get(g.id) ?? 0,
    }));
}

/** Returns a group with its companies and members (each member's identity + role); 404 if missing. */
export async function getGroupDetail(groupId: string): Promise<GroupDetail> {
    const group = await requireGroup(groupId);

    const [groupCompanies, memberRows] = await Promise.all([
        db
            .select({ id: companies.id, companyName: companies.companyName })
            .from(companies)
            .where(eq(companies.groupId, groupId))
            .orderBy(companies.companyName),
        db
            .select({
                userId: groupMembers.userId,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
                role: groupMembers.role,
                isPrimary: groupMembers.isPrimary,
                createdAt: groupMembers.createdAt,
            })
            .from(groupMembers)
            .innerJoin(users, eq(users.id, groupMembers.userId))
            .where(eq(groupMembers.groupId, groupId))
            .orderBy(users.firstName, users.lastName),
    ]);

    return {
        group: {
            id: group.id,
            name: group.name,
            description: group.description,
            createdAt: group.createdAt.toISOString(),
            updatedAt: group.updatedAt ? group.updatedAt.toISOString() : null,
        },
        companies: groupCompanies,
        members: memberRows.map((m) => ({
            userId: m.userId,
            firstName: m.firstName,
            lastName: m.lastName,
            email: m.email,
            role: m.role,
            isPrimary: m.isPrimary,
            createdAt: m.createdAt.toISOString(),
        })),
    };
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/** Creates an operator group; 409 if the name is already taken (company_groups.name is UNIQUE). */
export async function createGroup(input: {
    name: string;
    description?: string | null;
    createdBy: string;
}): Promise<CompanyGroup> {
    try {
        const [row] = await db
            .insert(companyGroups)
            .values({
                name: input.name,
                description: input.description ?? null,
                createdBy: input.createdBy,
            })
            .returning();
        return row;
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new GroupServiceError(409, 'A group with this name already exists');
        }
        throw err;
    }
}

/** Renames a group and/or edits its description; 404 if missing, 409 on a name collision. */
export async function updateGroup(
    groupId: string,
    input: { name?: string; description?: string | null },
): Promise<CompanyGroup> {
    await requireGroup(groupId);

    const patch: Partial<typeof companyGroups.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;

    try {
        const [row] = await db
            .update(companyGroups)
            .set(patch)
            .where(eq(companyGroups.id, groupId))
            .returning();
        // Guard the requireGroup→update race: a concurrent disband empties the update.
        if (!row) throw new GroupServiceError(404, 'Group not found');
        return row;
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new GroupServiceError(409, 'A group with this name already exists');
        }
        throw err;
    }
}

/**
 * Disbands (deletes) a group; 404 if missing. Relies on the schema's FK behaviors: companies
 * revert to ungrouped (group_id ON DELETE SET NULL) and memberships end (group_members cascade).
 */
export async function disbandGroup(groupId: string): Promise<{ id: string }> {
    const [row] = await db
        .delete(companyGroups)
        .where(eq(companyGroups.id, groupId))
        .returning({ id: companyGroups.id });
    if (!row) throw new GroupServiceError(404, 'Group not found');
    return row;
}

// ── Companies ───────────────────────────────────────────────────────────────

/**
 * Adds a company to a group, moving it if it already belongs to another one — the single nullable
 * companies.group_id FK enforces one-group-per-company, so a reassignment simply overwrites it.
 */
export async function addCompanyToGroup(groupId: string, companyId: string): Promise<void> {
    await requireGroup(groupId);
    const [company] = await db
        .select({ id: companies.id, groupId: companies.groupId })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
    if (!company) throw new GroupServiceError(404, 'Company not found');

    if (company.groupId === groupId) return; // already in this group — idempotent no-op
    await db.update(companies).set({ groupId }).where(eq(companies.id, companyId));
}

/**
 * Removes a company from a group, reverting it to ungrouped (group_id = null); 404 if the company
 * is not in that group. Membership lives on the group, so no group_members rows change.
 */
export async function removeCompanyFromGroup(groupId: string, companyId: string): Promise<void> {
    const [company] = await db
        .select({ id: companies.id, groupId: companies.groupId })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
    if (!company) throw new GroupServiceError(404, 'Company not found');
    if (company.groupId !== groupId) throw new GroupServiceError(404, 'Company is not in this group');

    await db.update(companies).set({ groupId: null }).where(eq(companies.id, companyId));
}

// ── Members ─────────────────────────────────────────────────────────────────

/** Adds a user to a group (associating them with every company in it); 404 group/user, 409 dup. */
export async function addGroupMember(
    groupId: string,
    userId: string,
    role: MemberRoleInput | null,
): Promise<GroupMember> {
    await requireGroup(groupId);
    await requireUser(userId);
    return insertMembership(groupId, userId, role);
}

/** Removes a user's group membership; 404 if they are not a member. */
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
    const [row] = await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .returning({ userId: groupMembers.userId });
    if (!row) throw new GroupServiceError(404, 'Membership not found');
}

/** Sets a group member's role (owner|member); 404 if they are not a member. */
export async function setGroupMemberRole(
    groupId: string,
    userId: string,
    role: MemberRoleInput,
): Promise<GroupMember> {
    const [row] = await db
        .update(groupMembers)
        .set({ role })
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .returning();
    if (!row) throw new GroupServiceError(404, 'Membership not found');
    return row;
}

/**
 * Adds a member to a company, auto-creating a singleton group named after the company's raw name if
 * it is ungrouped (otherwise adds to the company's existing group). 404 company/user, 409 dup member.
 * Side effect: may create a company_groups row and set companies.group_id.
 */
export async function addMemberToCompany(input: {
    companyId: string;
    userId: string;
    role: MemberRoleInput | null;
    createdBy: string;
}): Promise<{ group: CompanyGroup; member: GroupMember }> {
    await requireUser(input.userId);
    const [company] = await db
        .select({ id: companies.id, name: companies.companyName, groupId: companies.groupId })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);
    if (!company) throw new GroupServiceError(404, 'Company not found');

    const group = company.groupId
        ? await requireGroup(company.groupId)
        : await createSingletonGroup(company.id, company.name, input.createdBy);

    const member = await insertMembership(group.id, input.userId, input.role);
    return { group, member };
}

/**
 * Creates (or reuses) the singleton group for an ungrouped company and links companies.group_id.
 * The name is the RAW company name (ARV.RAW-COMPANY-NAME) — stored verbatim to stay consistent with
 * the backfill's singletons and the UNIQUE(name) constraint, and formatted at the client render edge.
 * onConflictDoNothing reuses a pre-existing same-named group (e.g. a backfilled singleton) instead of
 * failing; group_id is set LAST as the resumable "done" marker (neon-http has no interactive tx).
 */
async function createSingletonGroup(
    companyId: string,
    rawCompanyName: string,
    createdBy: string,
): Promise<CompanyGroup> {
    const [inserted] = await db
        .insert(companyGroups)
        .values({ name: rawCompanyName, createdBy })
        .onConflictDoNothing({ target: companyGroups.name })
        .returning();

    let group = inserted;
    if (!group) {
        const [existing] = await db
            .select()
            .from(companyGroups)
            .where(eq(companyGroups.name, rawCompanyName))
            .limit(1);
        if (!existing) {
            throw new Error(
                `company_groups row for "${rawCompanyName}" not found after conflict — aborting`,
            );
        }
        group = existing;
    }

    await db.update(companies).set({ groupId: group.id }).where(eq(companies.id, companyId));
    return group;
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merges source group A into target group B: re-points A's companies to B, unions A's members into
 * B, then deletes A. Non-destructive at the company level — no `companies` row is deleted, only
 * regrouped. On a `(user_id, group_id)` collision the existing B membership is kept (its role and
 * isPrimary are not overwritten). 400 if source === target, 404 if either group is missing.
 * @returns the surviving group B, plus counts of companies re-pointed and members newly added to B.
 * Side effect: deletes group A (cascading its now-copied group_members rows).
 */
export async function mergeGroups(
    sourceId: string,
    targetId: string,
): Promise<{ group: CompanyGroup; companiesMoved: number; membersMoved: number }> {
    if (sourceId === targetId) throw new GroupServiceError(400, 'Cannot merge a group into itself');
    await requireGroup(sourceId);
    const target = await requireGroup(targetId);

    // Writes are ordered so an interrupted run resumes cleanly (neon-http has no interactive tx);
    // deleting A is the "done" marker and each step is idempotent on re-run.

    // 1) Union A's companies into B. One-group-per-company holds (single nullable group_id), so each
    //    row simply moves from A to B; a re-run finds none still pointing at A.
    const movedCompanies = await db
        .update(companies)
        .set({ groupId: targetId })
        .where(eq(companies.groupId, sourceId))
        .returning({ id: companies.id });

    // 2) Union A's members into B, preserving role/isPrimary/createdAt. onConflictDoNothing on the
    //    (user_id, group_id) PK keeps B's existing row on a collision; .returning() counts only the
    //    rows newly added to B (colliding users were already members and are left untouched).
    const sourceMembers = await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, sourceId));

    let membersMoved = 0;
    if (sourceMembers.length > 0) {
        const inserted = await db
            .insert(groupMembers)
            .values(
                sourceMembers.map((m) => ({
                    groupId: targetId,
                    userId: m.userId,
                    role: m.role,
                    isPrimary: m.isPrimary,
                    createdAt: m.createdAt,
                })),
            )
            .onConflictDoNothing()
            .returning({ userId: groupMembers.userId });
        membersMoved = inserted.length;
    }

    // 3) Delete A (done marker). Its group_members were copied in step 2 and cascade away here; no
    //    company still references A after step 1, so the group_id SET NULL touches nothing.
    await db.delete(companyGroups).where(eq(companyGroups.id, sourceId));

    return { group: target, companiesMoved: movedCompanies.length, membersMoved };
}
