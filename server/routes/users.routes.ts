import { Router } from "express";
import { users, roles, userRoles, userRelationshipManagers } from "@database/schemas/users.schema";
import { desc, asc, eq, and, inArray } from "drizzle-orm";
import { db } from "server/storage";
import { requireRole } from "server/middleware/requireRole";
import {
  listSenderSignatures,
  createSenderSignature,
  deleteSenderSignature,
  findSignatureByEmail,
} from "server/services/postmark/postmarkSenders";
import { UserServices } from "server/services/auth";

const router = Router();

/** Role names that each caller role is allowed to assign or remove. Owner cannot be assigned/removed via API. */
const ASSIGNABLE_BY_CALLER: Record<string, string[]> = {
  owner: ["admin", "relationship-manager"],
  admin: ["relationship-manager"],
};
const VALID_ROLE_NAMES = ["owner", "admin", "relationship-manager"] as const;

/** Hierarchy: higher number = more privilege. Used to block altering users with equal or higher privilege. */
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 3,
  admin: 2,
  "relationship-manager": 1,
};

function getAllowedRolesForCaller(callerRoleRows: { roleName: string }[]): string[] {
  const names = callerRoleRows.map((r) => r.roleName);
  const isOwner = names.includes("owner");
  return isOwner ? ASSIGNABLE_BY_CALLER.owner : ASSIGNABLE_BY_CALLER.admin;
}

function getCallerLevel(callerRoleRows: { roleName: string }[]): number {
  const levels = callerRoleRows
    .map((r) => ROLE_HIERARCHY[r.roleName] ?? 0)
    .filter((n) => n > 0);
  return levels.length > 0 ? Math.max(...levels) : 0;
}

function getTargetLevel(targetRoleNames: string[]): number {
  if (!targetRoleNames.length) return 0;
  const levels = targetRoleNames.map((name) => ROLE_HIERARCHY[name] ?? 0);
  return Math.max(...levels);
}

// Admin: Get all users (with their role names)
router.get("/", requireRole(["admin", "owner"]), async (_req, res) => {
    try {
        const allUsers = await db
            .select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                phone: users.phone,
                email: users.email,
                createdAt: users.createdAt,
            })
            .from(users)
            .orderBy(desc(users.createdAt));

        const userIds = allUsers.map((u) => u.id);
        const roleRows =
            userIds.length === 0
                ? []
                : await db
                      .select({ userId: userRoles.userId, roleName: roles.name })
                      .from(userRoles)
                      .innerJoin(roles, eq(userRoles.roleId, roles.id))
                      .where(inArray(userRoles.userId, userIds));

        const rolesByUserId = new Map<string, string[]>();
        for (const row of roleRows) {
            const list = rolesByUserId.get(row.userId) ?? [];
            list.push(row.roleName);
            rolesByUserId.set(row.userId, list);
        }

        // Relationship managers per user (user_relationship_managers + RM user details)
        const rmRows =
            userIds.length === 0
                ? []
                : await db
                      .select({
                          userId: userRelationshipManagers.userId,
                          relationshipManagerId: userRelationshipManagers.relationshipManagerId,
                          rmFirstName: users.firstName,
                          rmLastName: users.lastName,
                      })
                      .from(userRelationshipManagers)
                      .innerJoin(users, eq(userRelationshipManagers.relationshipManagerId, users.id))
                      .where(inArray(userRelationshipManagers.userId, userIds));

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

        const usersWithRoles = allUsers.map((u) => ({
            ...u,
            roles: rolesByUserId.get(u.id) ?? [],
            relationshipManagers: relationshipManagersByUserId.get(u.id) ?? [],
        }));
        res.json(usersWithRoles);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users" });
    }
});

// Get all users who have the relationship-manager role (id, first_name, last_name, phone, email, roles)
router.get("/relationship-managers", requireRole(["admin", "owner"]), async (_req, res) => {
    try {
        const [relationshipManagerRole] = await db
            .select({ id: roles.id })
            .from(roles)
            .where(eq(roles.name, "relationship-manager"))
            .limit(1);
        if (!relationshipManagerRole) {
            return res.json([]);
        }

        const rmUserIds = await db
            .select({ userId: userRoles.userId })
            .from(userRoles)
            .where(eq(userRoles.roleId, relationshipManagerRole.id));
        const ids = rmUserIds.map((r) => r.userId);
        if (ids.length === 0) {
            return res.json([]);
        }

        const relationshipManagers = await db
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

        const rolesByUserId = new Map<string, string[]>();
        for (const row of roleRows) {
            const list = rolesByUserId.get(row.userId) ?? [];
            list.push(row.roleName);
            rolesByUserId.set(row.userId, list);
        }

        const result = relationshipManagers.map((u) => ({
            id: u.id,
            first_name: u.firstName,
            last_name: u.lastName,
            phone: u.phone,
            email: u.email,
            roles: rolesByUserId.get(u.id) ?? [],
        }));
        res.json(result);
    } catch (error) {
        console.error("Error fetching relationship managers:", error);
        res.status(500).json({ message: "Error fetching relationship managers" });
    }
});

// Admin/Owner: Assign a relationship manager to a user
router.post("/:userId/relationship-managers", requireRole(["admin", "owner"]), async (req, res) => {
    try {
        const { userId } = req.params;
        const body = req.body as { relationshipManagerId?: string };
        const relationshipManagerId = body?.relationshipManagerId;
        if (!relationshipManagerId || typeof relationshipManagerId !== "string") {
            return res.status(400).json({ message: "relationshipManagerId is required" });
        }
        const [relationshipManagerRole] = await db
            .select({ id: roles.id })
            .from(roles)
            .where(eq(roles.name, "relationship-manager"))
            .limit(1);
        if (!relationshipManagerRole) {
            return res.status(500).json({ message: "Relationship manager role not found" });
        }
        const [rmHasRole] = await db
            .select()
            .from(userRoles)
            .where(
                and(
                    eq(userRoles.userId, relationshipManagerId),
                    eq(userRoles.roleId, relationshipManagerRole.id)
                )
            )
            .limit(1);
        if (!rmHasRole) {
            return res.status(400).json({ message: "Selected user is not a relationship manager" });
        }
        const [targetUser] = await UserServices.getUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }
        const existingRm = await db
            .select({ userId: userRelationshipManagers.userId })
            .from(userRelationshipManagers)
            .where(eq(userRelationshipManagers.userId, userId))
            .limit(1);
        if (existingRm.length > 0) {
            return res.status(400).json({ message: "User already has a relationship manager" });
        }
        await UserServices.addUserRelationshipManager(userId, relationshipManagerId);
        return res.status(201).json({ message: "Relationship manager assigned" });
    } catch (error) {
        console.error("Error assigning relationship manager:", error);
        res.status(500).json({ message: "Error assigning relationship manager" });
    }
});

// Admin/Owner: Remove a relationship manager from a user
router.delete("/:userId/relationship-managers/:relationshipManagerId", requireRole(["admin", "owner"]), async (req, res) => {
    try {
        const { userId, relationshipManagerId } = req.params;
        if (!userId || !relationshipManagerId) {
            return res.status(400).json({ message: "userId and relationshipManagerId are required" });
        }
        const [targetUser] = await UserServices.getUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }
        await UserServices.removeUserRelationshipManager(userId, relationshipManagerId);
        return res.status(200).json({ message: "Relationship manager removed" });
    } catch (error) {
        console.error("Error removing relationship manager:", error);
        res.status(500).json({ message: "Error removing relationship manager" });
    }
});

// Admin: Get all roles (full role objects)
router.get("/roles", requireRole(["admin", "owner"]), async (_req, res) => {
    try {
        const allRoles = await db
            .select({
                id: roles.id,
                name: roles.name,
            })
            .from(roles)
            .orderBy(asc(roles.id));
        res.json(allRoles);
    } catch (error) {
        console.error("Error fetching roles:", error);
        res.status(500).json({ message: "Error fetching roles" });
    }
});

// Admin/Owner: Assign a role to a user (owner can assign admin | relationship-manager; admin can assign relationship-manager only)
router.post("/:userId/roles", requireRole(["admin", "owner"]), async (req, res) => {
    try {
        const { userId } = req.params;
        const roleName = typeof req.body?.roleName === "string" ? req.body.roleName.trim().toLowerCase() : null;

        if (!roleName || !VALID_ROLE_NAMES.includes(roleName as (typeof VALID_ROLE_NAMES)[number])) {
            return res.status(400).json({
                message: "Invalid or missing roleName",
                allowed: VALID_ROLE_NAMES.filter((r) => r !== "owner"),
            });
        }
        if (roleName === "owner") {
            return res.status(403).json({ message: "Assigning owner role is not allowed via API" });
        }

        const callerRoleRows = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, req.session.userId!),
                    inArray(roles.name, ["owner", "admin"])
                )
            );
        const allowedToAssign = getAllowedRolesForCaller(callerRoleRows);
        if (!allowedToAssign.includes(roleName)) {
            return res.status(403).json({
                message: "You are not allowed to assign this role",
                assignableByYou: allowedToAssign,
            });
        }

        const [roleRow] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
        if (!roleRow) {
            return res.status(400).json({ message: "Role not found" });
        }

        const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isSelf = userId === req.session.userId;
        if (!isSelf) {
            const targetRoleRows = await db
                .select({ roleName: roles.name })
                .from(userRoles)
                .innerJoin(roles, eq(userRoles.roleId, roles.id))
                .where(eq(userRoles.userId, userId));
            const targetRoleNames = targetRoleRows.map((r) => r.roleName);
            const callerLevel = getCallerLevel(callerRoleRows);
            const targetLevel = getTargetLevel(targetRoleNames);
            if (callerLevel <= targetLevel) {
                return res.status(403).json({
                    message: "You cannot alter roles of a user with equal or higher permissions",
                });
            }
        }

        const existing = await db
            .select()
            .from(userRoles)
            .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleRow.id)))
            .limit(1);
        if (existing.length > 0) {
            return res.status(409).json({ message: "User already has this role" });
        }

        await db.insert(userRoles).values({
            userId,
            roleId: roleRow.id,
        });

        // When adding relationship-manager, ensure user's email exists as a Postmark sender signature
        if (roleName === "relationship-manager" && process.env.POSTMARK_ACCOUNT_TOKEN) {
            try {
                const [targetUserRow] = await db
                    .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
                    .from(users)
                    .where(eq(users.id, userId))
                    .limit(1);
                if (targetUserRow?.email) {
                    const { SenderSignatures } = await listSenderSignatures(50, 0);
                    const existing = findSignatureByEmail(SenderSignatures, targetUserRow.email);
                    if (!existing) {
                        await createSenderSignature({
                            FromEmail: targetUserRow.email,
                            Name: [targetUserRow.firstName, targetUserRow.lastName].filter(Boolean).join(" ").trim() || targetUserRow.email,
                            ReplyToEmail: targetUserRow.email,
                        });
                    }
                }
            } catch (postmarkError) {
                console.error("Postmark sender sync after assigning relationship-manager:", postmarkError);
            }
        }

        return res.status(201).json({
            message: "Role assigned",
            userId,
            roleId: roleRow.id,
            roleName: roleRow.name,
        });
    } catch (error) {
        console.error("Error assigning role:", error);
        res.status(500).json({ message: "Error assigning role" });
    }
});

// Admin/Owner: Remove a role from a user (owner can remove admin | relationship-manager; admin can remove relationship-manager only)
router.delete("/:userId/roles/:role", requireRole(["admin", "owner"]), async (req, res) => {
    try {
        const { userId, role: roleParam } = req.params;
        const roleName = roleParam?.trim().toLowerCase() ?? "";

        if (!roleName || !VALID_ROLE_NAMES.includes(roleName as (typeof VALID_ROLE_NAMES)[number])) {
            return res.status(400).json({
                message: "Invalid or missing role",
                allowed: VALID_ROLE_NAMES.filter((r) => r !== "owner"),
            });
        }
        if (roleName === "owner") {
            if (userId === req.session.userId) {
                return res.status(403).json({
                    message: "You cannot remove the owner role from yourself",
                });
            }
            return res.status(403).json({ message: "Removing owner role is not allowed via API" });
        }

        const callerRoleRows = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, req.session.userId!),
                    inArray(roles.name, ["owner", "admin"])
                )
            );
        const allowedToRemove = getAllowedRolesForCaller(callerRoleRows);
        if (!allowedToRemove.includes(roleName)) {
            return res.status(403).json({
                message: "You are not allowed to remove this role",
                removableByYou: allowedToRemove,
            });
        }

        const [roleRow] = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
        if (!roleRow) {
            return res.status(400).json({ message: "Role not found" });
        }

        const [targetUser] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isSelf = userId === req.session.userId;
        if (!isSelf) {
            const targetRoleRows = await db
                .select({ roleName: roles.name })
                .from(userRoles)
                .innerJoin(roles, eq(userRoles.roleId, roles.id))
                .where(eq(userRoles.userId, userId));
            const targetRoleNames = targetRoleRows.map((r) => r.roleName);
            const callerLevel = getCallerLevel(callerRoleRows);
            const targetLevel = getTargetLevel(targetRoleNames);
            if (callerLevel <= targetLevel) {
                return res.status(403).json({
                    message: "You cannot alter roles of a user with equal or higher permissions",
                });
            }
        }

        const deleted = await db
            .delete(userRoles)
            .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleRow.id)))
            .returning({ userId: userRoles.userId, roleId: userRoles.roleId });

        if (deleted.length === 0) {
            return res.status(404).json({ message: "User does not have this role" });
        }

        // When removing relationship-manager, remove all assignments where this user is the RM
        if (roleName === "relationship-manager") {
            await db
                .delete(userRelationshipManagers)
                .where(eq(userRelationshipManagers.relationshipManagerId, userId));
        }

        // When removing relationship-manager, remove user's email from Postmark sender signatures if present
        if (roleName === "relationship-manager" && process.env.POSTMARK_ACCOUNT_TOKEN && targetUser.email) {
            try {
                const { SenderSignatures } = await listSenderSignatures(50, 0);
                const existing = findSignatureByEmail(SenderSignatures, targetUser.email);
                if (existing) {
                    await deleteSenderSignature(existing.ID);
                }
            } catch (postmarkError) {
                console.error("Postmark sender sync after removing relationship-manager:", postmarkError);
            }
        }

        return res.status(200).json({
            message: "Role removed",
            userId,
            roleId: roleRow.id,
            roleName: roleRow.name,
        });
    } catch (error) {
        console.error("Error removing role:", error);
        res.status(500).json({ message: "Error removing role" });
    }
});

export default router;