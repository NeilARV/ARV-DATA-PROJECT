import { Router } from "express";
import { userRoles, roles } from "@database/schemas/users.schema";
import { emailWhitelist, msas } from "@database/schemas";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "server/storage";
import { insertEmailWhitelistSchema } from "@database/inserts/users.insert";
import { requireRole } from "server/middleware/requireRole";

const router = Router();

const ADMIN_ACCESS_ROLES = ["admin", "owner"] as const;
/** Roles that can see and access the admin panel (header link + /admin page). */
const ADMIN_PANEL_ROLES = ["admin", "owner", "relationship-manager"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Check admin auth status (role-based). isAdmin true for admin, owner, or relationship-manager so they can access the panel.
router.get("/status", async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.json({ authenticated: false, isAdmin: false, roles: [] });
        }

        const allowedRows = await db
            .select({ roleName: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
                and(
                    eq(userRoles.userId, req.session.userId),
                    inArray(roles.name, [...ADMIN_PANEL_ROLES])
                )
            );

        const rolesList = allowedRows.map((r) => r.roleName);
        const isAdmin = rolesList.length > 0;
        res.json({ authenticated: true, isAdmin, roles: rolesList });
    } catch (error) {
        console.error("Error checking admin status:", error);
        res.status(500).json({ message: "Error checking admin status" });
    }
});

// Get all whitelist entries (id, email, msaName, relationshipManagerId) — for admin/owner/relationship-manager
router.get("/whitelist", requireRole(["admin", "owner", "relationship-manager"]), async (req, res) => {
    try {
        const rows = await db
            .select({
                id: emailWhitelist.id,
                email: emailWhitelist.email,
                msaName: msas.name,
                relationshipManagerId: emailWhitelist.relationshipManagerId,
            })
            .from(emailWhitelist)
            .leftJoin(msas, eq(emailWhitelist.msa, msas.id))
            .orderBy(emailWhitelist.createdAt);

        return res.json(rows.map((r) => ({
            id: r.id,
            email: r.email,
            msaName: r.msaName ?? null,
            relationshipManagerId: r.relationshipManagerId ?? null,
        })));
    } catch (error) {
        console.error("Error fetching email whitelist:", error);
        res.status(500).json({ message: "Error fetching email whitelist" });
    }
});

// Delete whitelist entry by id — admin/owner/relationship-manager
router.delete("/whitelist/:id", requireRole(["admin", "owner", "relationship-manager"]), async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || !UUID_REGEX.test(id)) {
            return res.status(400).json({ message: "Invalid whitelist entry id" });
        }

        const deleted = await db
            .delete(emailWhitelist)
            .where(eq(emailWhitelist.id, id))
            .returning({ id: emailWhitelist.id });

        if (deleted.length === 0) {
            return res.status(404).json({ message: "Whitelist entry not found" });
        }

        return res.status(200).json({ message: "Whitelist entry deleted", id: deleted[0].id });
    } catch (error) {
        console.error("Error deleting from whitelist:", error);
        res.status(500).json({ message: "Error deleting from whitelist" });
    }
});

// Update whitelist entry (MSA and/or relationship manager) by id — admin/owner/relationship-manager
router.patch("/whitelist/:id", requireRole(["admin", "owner", "relationship-manager"]), async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || !UUID_REGEX.test(id)) {
            return res.status(400).json({ message: "Invalid whitelist entry id" });
        }
        const body = req.body as { msaName?: string; relationshipManagerId?: string | null };
        const { msaName, relationshipManagerId } = body;
        if (msaName === undefined && relationshipManagerId === undefined) {
            return res.status(400).json({
                message: "Provide at least one of msaName or relationshipManagerId to update",
            });
        }

        const updates: { msa?: number; relationshipManagerId?: string | null } = {};

        if (msaName !== undefined) {
            const [msaRow] = await db
                .select({ id: msas.id })
                .from(msas)
                .where(eq(msas.name, msaName))
                .limit(1);
            if (!msaRow) {
                return res.status(400).json({ message: "Invalid MSA selected" });
            }
            updates.msa = msaRow.id;
        }

        if (relationshipManagerId !== undefined) {
            updates.relationshipManagerId = relationshipManagerId === "" ? null : relationshipManagerId;
        }

        const updated = await db
            .update(emailWhitelist)
            .set(updates)
            .where(eq(emailWhitelist.id, id))
            .returning({
                id: emailWhitelist.id,
                email: emailWhitelist.email,
                relationshipManagerId: emailWhitelist.relationshipManagerId,
            });

        if (updated.length === 0) {
            return res.status(404).json({ message: "Whitelist entry not found" });
        }

        return res.status(200).json({
            message: "Whitelist entry updated",
            id: updated[0].id,
            email: updated[0].email,
            relationshipManagerId: updated[0].relationshipManagerId ?? null,
        });
    } catch (error) {
        console.error("Error updating whitelist entry:", error);
        res.status(500).json({ message: "Error updating whitelist entry" });
    }
});

router.post("/whitelist", requireRole(["admin", "owner", "relationship-manager"]), async (req, res) => { 
    try {
        const validation = insertEmailWhitelistSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                message: "Invalid email data", 
                errors: validation.error.errors
            });
        }

        const { email, msaName, relationshipManagerId } = validation.data;
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

        // Insert email to whitelist with MSA and optional relationship manager (id and created_at are auto-generated)
        await db.insert(emailWhitelist).values({
            email: normalizedEmail,
            msa: msaRow.id,
            relationshipManagerId: relationshipManagerId ?? null,
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