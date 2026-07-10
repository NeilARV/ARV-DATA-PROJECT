import { db } from 'server/storage';
import { eq, and } from 'drizzle-orm';
import { companies, companyGroups, groupMembers } from '@database/schemas/companies.schema';
import { users } from '@database/schemas/users.schema';
import type { CompanyGroup, GroupMember } from '@database/types/companies';
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
