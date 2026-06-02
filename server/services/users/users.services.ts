import {
    users,
    roles,
    userRoles,
    userRelationshipManagers,
    subscriptions,
    accountTypes,
    userAccountTypes,
} from '@database/schemas/users.schema';
import { db } from 'server/storage';
import { desc, asc, eq, and, inArray, ilike, sql } from 'drizzle-orm';

export async function getUserList(options: { domain?: string; excludeDomain?: string }) {
    const { domain, excludeDomain } = options;
    const whereClause = domain
        ? ilike(users.email, '%@arvfinance.com')
        : excludeDomain
          ? sql`NOT (${users.email} ILIKE ${'%@arvfinance.com'})`
          : undefined;
    return db
        .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            email: users.email,
            createdAt: users.createdAt,
            subscriptionTier: subscriptions.name,
        })
        .from(users)
        .leftJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
        .where(whereClause)
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
        .where(
            and(
                eq(userRoles.userId, callerId),
                inArray(roles.name, ['owner', 'admin', 'relationship-manager']),
            ),
        );
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
