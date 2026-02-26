import { Router } from "express";
import { users, roles, userRoles } from "@database/schemas/users.schema";
import { desc, asc, eq, and, inArray } from "drizzle-orm";
import { db } from "server/storage";
import { requireRole } from "server/middleware/requireRole";

const router = Router();

/** Role names that each caller role is allowed to assign. Owner cannot be assigned via API. */
const ASSIGNABLE_BY_CALLER: Record<string, string[]> = {
  owner: ["admin", "relationship-manager"],
  admin: ["relationship-manager"],
};
const VALID_ROLE_NAMES = ["owner", "admin", "relationship-manager"] as const;

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

        const usersWithRoles = allUsers.map((u) => ({
            ...u,
            roles: rolesByUserId.get(u.id) ?? [],
        }));
        res.json(usersWithRoles);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users" });
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
        const callerRoles = callerRoleRows.map((r) => r.roleName);
        const isOwner = callerRoles.includes("owner");
        const allowedToAssign = isOwner ? ASSIGNABLE_BY_CALLER.owner : ASSIGNABLE_BY_CALLER.admin;
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

export default router;