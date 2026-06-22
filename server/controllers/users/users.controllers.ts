import { Request, Response } from 'express';
import { UsersServices } from 'server/services/users';
import { UserServices } from 'server/services/auth';
import { adminPatchUserSchema } from '@database/updates/users.update';
import {
    listSenderSignatures,
    createSenderSignature,
    deleteSenderSignature,
    findSignatureByEmail,
} from 'server/services/postmark/senders.services';

/** Role names that each caller role is allowed to assign or remove from user_roles. Owner cannot be assigned/removed via API. */
const ASSIGNABLE_BY_CALLER: Record<string, string[]> = {
    owner: ['admin', 'relationship-manager', 'member'],
    admin: ['relationship-manager', 'member'],
    'relationship-manager': [],
};
const VALID_ROLE_NAMES = ['owner', 'admin', 'relationship-manager', 'member'] as const;

/** Hierarchy: higher number = more privilege. Used to block altering users with equal or higher privilege. */
const ROLE_HIERARCHY: Record<string, number> = {
    owner: 4,
    admin: 3,
    'relationship-manager': 2,
    member: 1,
};

function getAllowedRolesForCaller(callerRoleRows: { roleName: string }[]): string[] {
    const names = callerRoleRows.map((r) => r.roleName);
    if (names.includes('owner')) return ASSIGNABLE_BY_CALLER.owner;
    if (names.includes('admin')) return ASSIGNABLE_BY_CALLER.admin;
    if (names.includes('relationship-manager')) return ASSIGNABLE_BY_CALLER['relationship-manager'];
    return [];
}

function getCallerLevel(callerRoleRows: { roleName: string }[]): number {
    const levels = callerRoleRows.map((r) => ROLE_HIERARCHY[r.roleName] ?? 0).filter((n) => n > 0);
    return levels.length > 0 ? Math.max(...levels) : 0;
}

function getTargetLevel(targetRoleNames: string[]): number {
    if (!targetRoleNames.length) return 0;
    return Math.max(...targetRoleNames.map((name) => ROLE_HIERARCHY[name] ?? 0));
}

// GET / — list all users (with roles and relationship managers)
export async function listUsersHandler(req: Request, res: Response) {
    try {
        const domain = req.query.domain === 'arvfinance.com' ? 'arvfinance.com' : undefined;
        const excludeDomain =
            req.query.excludeDomain === 'arvfinance.com' ? 'arvfinance.com' : undefined;

        const allUsers = await UsersServices.getUserList({ domain, excludeDomain });
        const userIds = allUsers.map((u) => u.id);

        const [roleRows, rmRows, accountTypeRows] = await Promise.all([
            UsersServices.getUserRoleRows(userIds),
            UsersServices.getUserRelationshipManagerRows(userIds),
            UsersServices.getUserAccountTypeRows(userIds),
        ]);

        const rolesByUserId = new Map<string, string[]>();
        for (const row of roleRows) {
            const list = rolesByUserId.get(row.userId) ?? [];
            list.push(row.roleName);
            rolesByUserId.set(row.userId, list);
        }

        const relationshipManagersByUserId = new Map<
            string,
            { id: string; firstName: string; lastName: string }[]
        >();
        for (const row of rmRows) {
            const list = relationshipManagersByUserId.get(row.userId) ?? [];
            list.push({
                id: row.relationshipManagerId,
                firstName: row.rmFirstName,
                lastName: row.rmLastName,
            });
            relationshipManagersByUserId.set(row.userId, list);
        }

        const accountTypesByUserId = new Map<string, string[]>();
        for (const row of accountTypeRows) {
            const list = accountTypesByUserId.get(row.userId) ?? [];
            list.push(row.accountTypeName);
            accountTypesByUserId.set(row.userId, list);
        }

        const usersWithRoles = allUsers.map(({ subscriptionTier, ...u }) => ({
            ...u,
            roles: rolesByUserId.get(u.id) ?? [],
            subscriptionTier: subscriptionTier ?? null,
            relationshipManagers: relationshipManagersByUserId.get(u.id) ?? [],
            accountTypes: accountTypesByUserId.get(u.id) ?? [],
        }));

        return res.json({ data: usersWithRoles, count: usersWithRoles.length });
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({ message: 'Error fetching users' });
    }
}

// GET /relationship-managers — list all users with the relationship-manager role
export async function listRelationshipManagersHandler(_req: Request, res: Response) {
    try {
        const data = await UsersServices.getRelationshipManagerUserList();
        if (!data) return res.json([]);

        const { rmUsers, roleRows } = data;
        const rolesByUserId = new Map<string, string[]>();
        for (const row of roleRows) {
            const list = rolesByUserId.get(row.userId) ?? [];
            list.push(row.roleName);
            rolesByUserId.set(row.userId, list);
        }

        const result = rmUsers.map((u) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            phone: u.phone,
            email: u.email,
            roles: rolesByUserId.get(u.id) ?? [],
        }));

        return res.json(result);
    } catch (error) {
        console.error('Error fetching relationship managers:', error);
        return res.status(500).json({ message: 'Error fetching relationship managers' });
    }
}

// GET /roles — list all roles
export async function listRolesHandler(_req: Request, res: Response) {
    try {
        const allRoles = await UsersServices.getAllRoles();
        return res.json(allRoles);
    } catch (error) {
        console.error('Error fetching roles:', error);
        return res.status(500).json({ message: 'Error fetching roles' });
    }
}

// POST /:userId/roles — assign an ARV team role to a user
export async function assignRoleHandler(req: Request, res: Response) {
    try {
        const { userId } = req.params;
        const roleName =
            typeof req.body?.roleName === 'string' ? req.body.roleName.trim().toLowerCase() : null;

        if (
            !roleName ||
            !VALID_ROLE_NAMES.includes(roleName as (typeof VALID_ROLE_NAMES)[number])
        ) {
            return res.status(400).json({
                message: 'Invalid or missing roleName',
                allowed: VALID_ROLE_NAMES.filter((r) => r !== 'owner'),
            });
        }
        if (roleName === 'owner') {
            return res.status(403).json({ message: 'Assigning owner role is not allowed via API' });
        }

        const callerRoleRows = await UsersServices.getCallerTeamRoleRows(req.session.userId!);
        const allowedToAssign = getAllowedRolesForCaller(callerRoleRows);
        if (!allowedToAssign.includes(roleName)) {
            return res.status(403).json({
                message: 'You are not allowed to assign this role',
                assignableByYou: allowedToAssign,
            });
        }

        const roleRow = await UsersServices.findRoleByName(roleName);
        if (!roleRow) {
            return res.status(400).json({ message: 'Role not found' });
        }

        const targetUser = await UsersServices.findUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isSelf = userId === req.session.userId;
        if (!isSelf) {
            const targetRoleRows = await UsersServices.getUserTeamRoleRows(userId);
            const callerLevel = getCallerLevel(callerRoleRows);
            const targetLevel = getTargetLevel(targetRoleRows.map((r) => r.roleName));
            if (callerLevel <= targetLevel) {
                return res.status(403).json({
                    message: 'You cannot alter roles of a user with equal or higher permissions',
                });
            }
        }

        const alreadyAssigned = await UsersServices.checkRoleAssigned(userId, roleRow.id);
        if (alreadyAssigned) {
            return res.status(409).json({ message: 'User already has this role' });
        }

        await UsersServices.insertUserRole(userId, roleRow.id);

        if (roleName === 'relationship-manager' && process.env.POSTMARK_ACCOUNT_TOKEN) {
            try {
                const userProfile = await UsersServices.findUserProfile(userId);
                if (userProfile?.email) {
                    const { SenderSignatures } = await listSenderSignatures(50, 0);
                    const existing = findSignatureByEmail(SenderSignatures, userProfile.email);
                    if (!existing) {
                        await createSenderSignature({
                            FromEmail: userProfile.email,
                            Name:
                                [userProfile.firstName, userProfile.lastName]
                                    .filter(Boolean)
                                    .join(' ')
                                    .trim() || userProfile.email,
                            ReplyToEmail: userProfile.email,
                        });
                    }
                }
            } catch (postmarkError) {
                console.error(
                    'Postmark sender sync after assigning relationship-manager:',
                    postmarkError,
                );
            }
        }

        return res.status(201).json({
            message: 'Role assigned',
            userId,
            roleId: roleRow.id,
            roleName: roleRow.name,
        });
    } catch (error) {
        console.error('Error assigning role:', error);
        return res.status(500).json({ message: 'Error assigning role' });
    }
}

// DELETE /:userId/roles/:role — remove an ARV team role from a user
export async function removeRoleHandler(req: Request, res: Response) {
    try {
        const { userId, role: roleParam } = req.params;
        const roleName = roleParam?.trim().toLowerCase() ?? '';

        if (
            !roleName ||
            !VALID_ROLE_NAMES.includes(roleName as (typeof VALID_ROLE_NAMES)[number])
        ) {
            return res.status(400).json({
                message: 'Invalid or missing role',
                allowed: VALID_ROLE_NAMES.filter((r) => r !== 'owner'),
            });
        }
        if (roleName === 'owner') {
            if (userId === req.session.userId) {
                return res
                    .status(403)
                    .json({ message: 'You cannot remove the owner role from yourself' });
            }
            return res.status(403).json({ message: 'Removing owner role is not allowed via API' });
        }

        const callerRoleRows = await UsersServices.getCallerTeamRoleRows(req.session.userId!);
        const allowedToRemove = getAllowedRolesForCaller(callerRoleRows);
        if (!allowedToRemove.includes(roleName)) {
            return res.status(403).json({
                message: 'You are not allowed to remove this role',
                removableByYou: allowedToRemove,
            });
        }

        const roleRow = await UsersServices.findRoleByName(roleName);
        if (!roleRow) {
            return res.status(400).json({ message: 'Role not found' });
        }

        const targetUser = await UsersServices.findUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isSelf = userId === req.session.userId;
        if (!isSelf) {
            const targetRoleRows = await UsersServices.getUserTeamRoleRows(userId);
            const callerLevel = getCallerLevel(callerRoleRows);
            const targetLevel = getTargetLevel(targetRoleRows.map((r) => r.roleName));
            if (callerLevel <= targetLevel) {
                return res.status(403).json({
                    message: 'You cannot alter roles of a user with equal or higher permissions',
                });
            }
        }

        const deleted = await UsersServices.deleteUserRoleAssignment(userId, roleRow.id);
        if (deleted.length === 0) {
            return res.status(404).json({ message: 'User does not have this role' });
        }

        if (roleName === 'relationship-manager') {
            await UsersServices.deleteAllRMAssignmentsForManager(userId);
        }

        if (
            roleName === 'relationship-manager' &&
            process.env.POSTMARK_ACCOUNT_TOKEN &&
            targetUser.email
        ) {
            try {
                const { SenderSignatures } = await listSenderSignatures(50, 0);
                const existing = findSignatureByEmail(SenderSignatures, targetUser.email);
                if (existing) {
                    await deleteSenderSignature(existing.ID);
                }
            } catch (postmarkError) {
                console.error(
                    'Postmark sender sync after removing relationship-manager:',
                    postmarkError,
                );
            }
        }

        return res.status(200).json({
            message: 'Role removed',
            userId,
            roleId: roleRow.id,
            roleName: roleRow.name,
        });
    } catch (error) {
        console.error('Error removing role:', error);
        return res.status(500).json({ message: 'Error removing role' });
    }
}

// GET /account-types — list all account type options
export async function listAccountTypesHandler(_req: Request, res: Response) {
    try {
        const types = await UsersServices.getAllAccountTypes();
        return res.json(types);
    } catch (error) {
        console.error('Error fetching account types:', error);
        return res.status(500).json({ message: 'Error fetching account types' });
    }
}

// PATCH /:userId — update a user's subscription tier, account types, and relationship manager
export async function patchUserHandler(req: Request, res: Response) {
    try {
        const { userId } = req.params;

        const validation = adminPatchUserSchema.safeParse(req.body);
        if (!validation.success) {
            return res
                .status(400)
                .json({ message: 'Invalid request data', errors: validation.error.errors });
        }

        const { subscriptionTier, accountTypes, relationshipManagerId } = validation.data;

        const targetUser = await UsersServices.findUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (subscriptionTier !== undefined) {
            await UsersServices.updateUserTierRole(userId, subscriptionTier);
        }

        if (relationshipManagerId !== undefined) {
            const currentRMs = await UsersServices.getUserRelationshipManagerRows([userId]);
            for (const rm of currentRMs) {
                await UserServices.removeUserRelationshipManager(userId, rm.relationshipManagerId);
            }
            if (relationshipManagerId !== null) {
                const isRM = await UsersServices.checkUserHasRoleByName(
                    relationshipManagerId,
                    'relationship-manager',
                );
                if (!isRM) {
                    return res
                        .status(400)
                        .json({ message: 'Selected user is not a relationship manager' });
                }
                await UserServices.addUserRelationshipManager(userId, relationshipManagerId);
            }
        }

        if (accountTypes !== undefined) {
            const currentRows = await UsersServices.getUserAccountTypeRows([userId]);
            const currentNames = currentRows.map((r) => r.accountTypeName);

            const toAdd = accountTypes.filter((t) => !currentNames.includes(t));
            const toRemove = currentNames.filter((t) => !accountTypes.includes(t));

            for (const typeName of toAdd) {
                const row = await UsersServices.findAccountTypeByName(typeName);
                if (!row)
                    return res.status(400).json({ message: `Invalid account type: ${typeName}` });
                await UsersServices.insertUserAccountType(userId, row.id);
            }

            for (const typeName of toRemove) {
                const row = await UsersServices.findAccountTypeByName(typeName);
                if (row) await UsersServices.deleteUserAccountTypeAssignment(userId, row.id);
            }
        }

        return res.status(200).json({ message: 'User updated', userId });
    } catch (error) {
        console.error('Error updating user:', error);
        return res.status(500).json({ message: 'Error updating user' });
    }
}

// DELETE /:userId — delete a user account
export async function deleteUserHandler(req: Request, res: Response) {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({ message: 'Invalid or missing user id' });
        }
        if (userId === req.session.userId) {
            return res.status(403).json({ message: 'You cannot delete your own account' });
        }

        const targetUser = await UsersServices.findUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const callerRoleRows = await UsersServices.getCallerTeamRoleRows(req.session.userId!);
        const targetRoleRows = await UsersServices.getUserTeamRoleRows(userId);
        const callerLevel = getCallerLevel(callerRoleRows);
        const targetLevel = getTargetLevel(targetRoleRows.map((r) => r.roleName));
        if (callerLevel <= targetLevel) {
            return res.status(403).json({
                message: 'You cannot delete a user with equal or higher permissions',
            });
        }

        await UsersServices.deleteUserAccount(userId);
        return res.status(200).json({ message: 'User deleted', userId });
    } catch (error) {
        console.error('Error deleting user:', error);
        return res.status(500).json({ message: 'Error deleting user' });
    }
}
