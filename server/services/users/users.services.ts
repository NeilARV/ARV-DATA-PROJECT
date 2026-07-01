import {
    users,
    roles,
    userRoles,
    userRelationshipManagers,
    subscriptions,
    accountTypes,
    userAccountTypes,
} from '@database/schemas/users.schema';
import { companyMembers } from '@database/schemas/companies.schema';
import { db } from 'server/storage';
import {
    desc,
    asc,
    eq,
    and,
    or,
    inArray,
    ilike,
    isNull,
    isNotNull,
    exists,
    notExists,
    sql,
} from 'drizzle-orm';
import { PRIVILEGED_ROLES } from 'server/constants/roles.constants';
import type { SQL } from 'drizzle-orm';

/** Filters accepted by {@link getUserList}. All optional; an absent filter is not applied. */
export interface UserListFilters {
    domain?: string;
    excludeDomain?: string;
    /** Case-insensitive substring matched against email, phone, or "first last" name. */
    search?: string;
    /** Subscription tier name, or 'none' for users with no tier. */
    tier?: 'basic' | 'pro' | 'premium' | 'none';
    /** Match users who have at least one of these account-type names (OR semantics). */
    accountTypes?: string[];
    /** true → only verified emails, false → only unverified. */
    emailVerified?: boolean;
    /** true → only users in ≥1 company, false → only users in no company. */
    hasCompany?: boolean;
}

/**
 * List users for the admin panel, optionally filtered by domain, search text, tier,
 * account types, email-verification status, and company association.
 * @param options filters to apply; combined with AND (account types OR-match internally).
 * @returns matching user rows ordered newest first (roles/RMs are enriched by the caller).
 */
export async function getUserList(options: UserListFilters) {
    const {
        domain,
        excludeDomain,
        search,
        tier,
        accountTypes: accountTypeNames,
        emailVerified,
        hasCompany,
    } = options;

    const conditions: (SQL | undefined)[] = [];

    if (domain) {
        conditions.push(ilike(users.email, '%@arvfinance.com'));
    } else if (excludeDomain) {
        conditions.push(sql`NOT (${users.email} ILIKE ${'%@arvfinance.com'})`);
    }

    if (search) {
        const term = `%${search}%`;
        conditions.push(
            or(
                ilike(users.email, term),
                ilike(users.phone, term),
                ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, term),
            ),
        );
    }

    if (tier === 'none') {
        conditions.push(isNull(users.subscriptionId));
    } else if (tier) {
        conditions.push(eq(subscriptions.name, tier));
    }

    if (emailVerified === true) {
        conditions.push(isNotNull(users.emailVerifiedAt));
    } else if (emailVerified === false) {
        conditions.push(isNull(users.emailVerifiedAt));
    }

    if (accountTypeNames && accountTypeNames.length > 0) {
        conditions.push(
            exists(
                db
                    .select({ one: sql`1` })
                    .from(userAccountTypes)
                    .innerJoin(accountTypes, eq(userAccountTypes.accountTypeId, accountTypes.id))
                    .where(
                        and(
                            eq(userAccountTypes.userId, users.id),
                            inArray(accountTypes.name, accountTypeNames),
                        ),
                    ),
            ),
        );
    }

    if (hasCompany !== undefined) {
        // Correlated (not)EXISTS avoids the empty-set edge cases of NOT IN.
        const memberSubquery = db
            .select({ one: sql`1` })
            .from(companyMembers)
            .where(eq(companyMembers.userId, users.id));
        conditions.push(hasCompany ? exists(memberSubquery) : notExists(memberSubquery));
    }

    return db
        .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            email: users.email,
            createdAt: users.createdAt,
            emailVerifiedAt: users.emailVerifiedAt,
            subscriptionTier: subscriptions.name,
        })
        .from(users)
        .leftJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
        .where(and(...conditions))
        .orderBy(desc(users.createdAt));
}

export async function getUserRoleRows(userIds: string[]) {
    if (userIds.length === 0) return [];
    return db
        .select({ userId: userRoles.userId, roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(inArray(userRoles.userId, userIds));
}

export async function getUserRelationshipManagerRows(userIds: string[]) {
    if (userIds.length === 0) return [];
    return db
        .select({
            userId: userRelationshipManagers.userId,
            relationshipManagerId: userRelationshipManagers.relationshipManagerId,
            rmFirstName: users.firstName,
            rmLastName: users.lastName,
        })
        .from(userRelationshipManagers)
        .innerJoin(users, eq(userRelationshipManagers.relationshipManagerId, users.id))
        .where(inArray(userRelationshipManagers.userId, userIds));
}

export async function getRelationshipManagerUserList() {
    const [rmRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'relationship-manager'))
        .limit(1);
    if (!rmRole) return null;

    const rmUserIds = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.roleId, rmRole.id));
    const ids = rmUserIds.map((r) => r.userId);
    if (ids.length === 0) return null;

    const rmUsers = await db
        .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            email: users.email,
        })
        .from(users)
        .where(inArray(users.id, ids))
        .orderBy(asc(users.lastName), asc(users.firstName));

    const roleRows = await db
        .select({ userId: userRoles.userId, roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(inArray(userRoles.userId, ids));

    return { rmUsers, roleRows };
}

export async function getAllRoles() {
    return db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.id));
}

export async function findRoleByName(name: string) {
    const [role] = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
    return role ?? null;
}

export async function findUserById(userId: string) {
    const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    return user ?? null;
}

export async function findUserProfile(userId: string) {
    const [user] = await db
        .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    return user ?? null;
}

export async function getCallerTeamRoleRows(callerId: string) {
    return db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, callerId), inArray(roles.name, [...PRIVILEGED_ROLES])));
}

export async function getUserTeamRoleRows(userId: string) {
    return db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId));
}

export async function checkRoleAssigned(userId: string, roleId: number) {
    const rows = await db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
        .limit(1);
    return rows.length > 0;
}

export async function checkUserHasRoleByName(userId: string, roleName: string) {
    const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, roleName))
        .limit(1);
    if (!role) return false;
    return checkRoleAssigned(userId, role.id);
}

export async function insertUserRole(userId: string, roleId: number) {
    await db.insert(userRoles).values({ userId, roleId });
}

export async function deleteUserRoleAssignment(userId: string, roleId: number) {
    return db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
        .returning({ userId: userRoles.userId, roleId: userRoles.roleId });
}

export async function deleteAllRMAssignmentsForManager(managerId: string) {
    await db
        .delete(userRelationshipManagers)
        .where(eq(userRelationshipManagers.relationshipManagerId, managerId));
}

export async function updateUserTierRole(userId: string, tierName: string | null) {
    if (tierName === null) {
        await db.update(users).set({ subscriptionId: null }).where(eq(users.id, userId));
        return;
    }
    const [sub] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.name, tierName))
        .limit(1);
    if (!sub) throw new Error(`Unknown subscription tier: '${tierName}'`);
    await db.update(users).set({ subscriptionId: sub.id }).where(eq(users.id, userId));
}

export async function deleteUserAccount(userId: string) {
    await db.delete(users).where(eq(users.id, userId));
}

export async function getAllAccountTypes() {
    return db
        .select({ id: accountTypes.id, name: accountTypes.name })
        .from(accountTypes)
        .orderBy(asc(accountTypes.id));
}

export async function getUserAccountTypeRows(userIds: string[]) {
    if (userIds.length === 0) return [];
    return db
        .select({ userId: userAccountTypes.userId, accountTypeName: accountTypes.name })
        .from(userAccountTypes)
        .innerJoin(accountTypes, eq(userAccountTypes.accountTypeId, accountTypes.id))
        .where(inArray(userAccountTypes.userId, userIds));
}

export async function findAccountTypeByName(name: string) {
    const [row] = await db.select().from(accountTypes).where(eq(accountTypes.name, name)).limit(1);
    return row ?? null;
}

export async function insertUserAccountType(userId: string, accountTypeId: number) {
    await db.insert(userAccountTypes).values({ userId, accountTypeId });
}

export async function deleteUserAccountTypeAssignment(userId: string, accountTypeId: number) {
    return db
        .delete(userAccountTypes)
        .where(
            and(
                eq(userAccountTypes.userId, userId),
                eq(userAccountTypes.accountTypeId, accountTypeId),
            ),
        )
        .returning({
            userId: userAccountTypes.userId,
            accountTypeId: userAccountTypes.accountTypeId,
        });
}
