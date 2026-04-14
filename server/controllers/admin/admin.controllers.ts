import { Request, Response } from "express";
import {
    getAdminStatus,
    getWhitelist,
    deleteWhitelistEntry,
    updateWhitelistEntry,
    addWhitelistEntry,
} from "server/services/admin/admin.services";
import { insertEmailWhitelistSchema } from "@database/inserts/users.insert";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function checkAdminStatus(req: Request, res: Response) {
    try {
        if (!req.session.userId) {
            return res.json({ authenticated: false, isAdmin: false, roles: [] });
        }
        const result = await getAdminStatus(req.session.userId);
        return res.json(result);
    } catch (error) {
        console.error("Error checking admin status:", error);
        return res.status(500).json({ message: "Error checking admin status" });
    }
}

export async function listWhitelist(req: Request, res: Response) {
    try {
        const rows = await getWhitelist();
        return res.json(rows);
    } catch (error) {
        console.error("Error fetching email whitelist:", error);
        return res.status(500).json({ message: "Error fetching email whitelist" });
    }
}

export async function removeWhitelistEntry(req: Request, res: Response) {
    try {
        const { id } = req.params;
        if (!id || !UUID_REGEX.test(id)) {
            return res.status(400).json({ message: "Invalid whitelist entry id" });
        }

        const deletedId = await deleteWhitelistEntry(id);
        if (!deletedId) {
            return res.status(404).json({ message: "Whitelist entry not found" });
        }

        return res.status(200).json({ message: "Whitelist entry deleted", id: deletedId });
    } catch (error) {
        console.error("Error deleting from whitelist:", error);
        return res.status(500).json({ message: "Error deleting from whitelist" });
    }
}

export async function patchWhitelistEntry(req: Request, res: Response) {
    try {
        const { id } = req.params;
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

        const updated = await updateWhitelistEntry({ id, msaName, relationshipManagerId });
        if (!updated) {
            // updateWhitelistEntry returns null for both invalid MSA and not-found entry;
            // treat as bad request for invalid MSA (msaName provided) otherwise not found.
            if (msaName !== undefined) {
                return res.status(400).json({ message: "Invalid MSA selected" });
            }
            return res.status(404).json({ message: "Whitelist entry not found" });
        }

        return res.status(200).json({
            message: "Whitelist entry updated",
            id: updated.id,
            email: updated.email,
            relationshipManagerId: updated.relationshipManagerId,
        });
    } catch (error) {
        console.error("Error updating whitelist entry:", error);
        return res.status(500).json({ message: "Error updating whitelist entry" });
    }
}

export async function createWhitelistEntry(req: Request, res: Response) {
    try {
        const validation = insertEmailWhitelistSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: "Invalid email data", errors: validation.error.errors });
        }

        const { email, msaName, relationshipManagerId } = validation.data;
        const result = await addWhitelistEntry({ email, msaName, relationshipManagerId });

        if (result === "invalid-msa") {
            return res.status(400).json({ message: "Invalid MSA selected" });
        }
        if (result === "duplicate") {
            return res.status(409).json({ message: "Email already exists in whitelist" });
        }

        return res.status(201).json({ message: "Email added to whitelist successfully" });
    } catch (error) {
        console.error("Error adding email to whitelist:", error);
        return res.status(500).json({ message: "Error adding email to whitelist" });
    }
}
