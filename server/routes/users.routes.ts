import { Router } from "express";
import { users, roles } from "@database/schemas/users.schema";
import { desc, asc } from "drizzle-orm";
import { db } from "server/storage";
import { requireRole } from "server/middleware/requireRole";

const router = Router();

// Admin: Get all users
router.get("/users", requireRole(["admin", "owner"]), async (_req, res) => {
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
        res.json(allUsers);
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

export default router;