import { db } from "server/storage";
import { userRoles, roles } from "@database/schemas/users.schema";
import { emailWhitelist, msas } from "@database/schemas";
import { eq, and, inArray } from "drizzle-orm";

/** Roles that grant access to the admin panel. */
export const ADMIN_PANEL_ROLES = ["admin", "owner", "relationship-manager"] as const;

export interface AdminStatusResult {
    authenticated: boolean;
    isAdmin: boolean;
    roles: string[];
}

export async function getAdminStatus(userId: string): Promise<AdminStatusResult> {
    const allowedRows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
            and(
                eq(userRoles.userId, userId),
                inArray(roles.name, [...ADMIN_PANEL_ROLES, "pro"])
            )
        );

    const rolesList = allowedRows.map((r) => r.roleName);
    const isAdmin = rolesList.some((r) => (ADMIN_PANEL_ROLES as readonly string[]).includes(r));
    return { authenticated: true, isAdmin, roles: rolesList };
}

export interface WhitelistRow {
    id: string;
    email: string;
    msaName: string | null;
    relationshipManagerId: string | null;
}

export async function getWhitelist(): Promise<WhitelistRow[]> {
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

    return rows.map((r) => ({
        id: r.id,
        email: r.email,
        msaName: r.msaName ?? null,
        relationshipManagerId: r.relationshipManagerId ?? null,
    }));
}

export async function deleteWhitelistEntry(id: string): Promise<string | null> {
    const deleted = await db
        .delete(emailWhitelist)
        .where(eq(emailWhitelist.id, id))
        .returning({ id: emailWhitelist.id });

    return deleted.length > 0 ? deleted[0].id : null;
}

export interface UpdateWhitelistParams {
    id: string;
    msaName?: string;
    relationshipManagerId?: string | null;
}

export interface UpdateWhitelistResult {
    id: string;
    email: string;
    relationshipManagerId: string | null;
}

export async function updateWhitelistEntry(params: UpdateWhitelistParams): Promise<UpdateWhitelistResult | null> {
    const { id, msaName, relationshipManagerId } = params;
    const updates: { msa?: number; relationshipManagerId?: string | null } = {};

    if (msaName !== undefined) {
        const [msaRow] = await db
            .select({ id: msas.id })
            .from(msas)
            .where(eq(msas.name, msaName))
            .limit(1);
        if (!msaRow) return null;
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

    if (updated.length === 0) return null;

    return {
        id: updated[0].id,
        email: updated[0].email,
        relationshipManagerId: updated[0].relationshipManagerId ?? null,
    };
}

export interface AddWhitelistParams {
    email: string;
    msaName: string;
    relationshipManagerId?: string | null;
}

/** Returns null if MSA not found, "duplicate" if email already exists, otherwise "ok". */
export async function addWhitelistEntry(params: AddWhitelistParams): Promise<"ok" | "invalid-msa" | "duplicate"> {
    const { email, msaName, relationshipManagerId } = params;
    const normalizedEmail = email.toLowerCase().trim();

    const [msaRow] = await db
        .select({ id: msas.id })
        .from(msas)
        .where(eq(msas.name, msaName))
        .limit(1);

    if (!msaRow) return "invalid-msa";

    const existing = await db
        .select()
        .from(emailWhitelist)
        .where(eq(emailWhitelist.email, normalizedEmail))
        .limit(1);

    if (existing.length > 0) return "duplicate";

    await db.insert(emailWhitelist).values({
        email: normalizedEmail,
        msa: msaRow.id,
        relationshipManagerId: relationshipManagerId ?? null,
    });

    return "ok";
}
