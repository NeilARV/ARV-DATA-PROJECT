import { Router } from "express";
import { users, userRoles, roles } from "@database/schemas/users.schema";
import { emailWhitelist, msas } from "@database/schemas";
import { eq, desc, and, inArray } from "drizzle-orm";
import { db } from "server/storage";
import { insertEmailWhitelistSchema } from "@database/inserts/users.insert";
import { requireRole } from "server/middleware/requireRole";

const router = Router();

const ADMIN_ACCESS_ROLES = ["admin", "owner"] as const;

// Check admin auth status (role-based: admin or owner from user_roles + roles)
router.get("/status", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.json({ authenticated: false, isAdmin: false });
        }

        const allowedRows = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, req.session.userId),
                    inArray(roles.name, [...ADMIN_ACCESS_ROLES])
                )
            )
            .limit(1);

        const isAdmin = allowedRows.length > 0;
        res.json({ authenticated: true, isAdmin });
    } catch (error) {
        console.error("Error checking admin status:", error);
        res.status(500).json({ message: "Error checking admin status" });
    }
});

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

router.post("/whitelist", requireRole(["admin", "owner"]), async (req, res) => { 
    try {
        const validation = insertEmailWhitelistSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                message: "Invalid email data", 
                errors: validation.error.errors
            });
        }

        const { email, msaName } = validation.data;
        const normalizedEmail = email.toLowerCase().trim();

        // Resolve MSA name to id
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, msaName))
            .limit(1);

        if (!msaRow) {
            return res.status(400).json({
                message: "Invalid MSA selected"
            });
        }

        // Check if email already exists in whitelist
        const existingWhitelistEntry = await db
            .select()
            .from(emailWhitelist)
            .where(eq(emailWhitelist.email, normalizedEmail))
            .limit(1);

        if (existingWhitelistEntry.length > 0) {
            return res.status(409).json({
                message: "Email already exists in whitelist"
            });
        }

        // Insert email to whitelist with MSA reference (id and created_at are auto-generated)
        await db.insert(emailWhitelist).values({
            email: normalizedEmail,
            msa: msaRow.id,
        });

        return res.status(201).json({ 
            message: "Email added to whitelist successfully"
        });
    } catch (error) {
        console.error("Error adding email to whitelist:", error);
        res.status(500).json({ 
            message: "Error adding email to whitelist" 
        });
    }
});

export default router