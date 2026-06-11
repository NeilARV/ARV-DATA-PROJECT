import type { Request, Response } from 'express';
import {
    listChannelsWithUnread,
    markChannelRead,
    createChannel,
    updateChannel,
    archiveChannel,
    deleteChannel,
    listChannelMentionCandidates,
    getChannelById,
    ChannelServiceError,
} from 'server/services/channels/channels.services';
import {
    createChannelSchema,
    updateChannelSchema,
} from '@database/validation/mastermind.validation';
import { db } from 'server/storage';
import { userRoles, roles } from '@database/schemas/users.schema';
import { eq, and, inArray } from 'drizzle-orm';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHANNEL_ADMIN_ROLES = ['admin', 'owner'] as const;

/** Returns true if the given userId holds an admin or owner role. */
async function callerIsChannelAdmin(userId: string): Promise<boolean> {
    const rows = await db
        .select({ roleName: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, userId), inArray(roles.name, [...CHANNEL_ADMIN_ROLES])))
        .limit(1);
    return rows.length > 0;
}

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof ChannelServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── GET /api/channels ──────────────────────────────────────────────────────────
export async function getChannelsController(req: Request, res: Response): Promise<void> {
    try {
        const callerId = req.session.userId!;
        const isAdmin = await callerIsChannelAdmin(callerId);
        const includeArchived = req.query.includeArchived === 'true' && isAdmin;

        // Admins/owners additionally see admin-only channels; everyone else has them hidden.
        const channels = await listChannelsWithUnread({
            userId: callerId,
            includeArchived,
            includeAdminOnly: isAdmin,
        });
        res.json({ channels });
    } catch (err) {
        handleServiceError(res, err, 'Error fetching channels');
    }
}

// ── PATCH /api/channels/:id/read ──────────────────────────────────────────────
export async function markChannelReadController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }
        await markChannelRead({ channelId: id, userId: req.session.userId! });
        res.status(204).send();
    } catch (err) {
        handleServiceError(res, err, 'Error marking channel as read');
    }
}

// ── POST /api/channels ─────────────────────────────────────────────────────────
export async function createChannelController(req: Request, res: Response): Promise<void> {
    try {
        const parsed = createChannelSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const channel = await createChannel({
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            createdBy: req.session.userId!,
        });
        res.status(201).json({ message: 'Channel created', channel });
    } catch (err) {
        handleServiceError(res, err, 'Error creating channel');
    }
}

// ── PATCH /api/channels/:id ──────────────────────────────────────────────────────
export async function updateChannelController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        const parsed = updateChannelSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsed.error.errors });
            return;
        }

        const channel = await updateChannel(id, parsed.data);
        res.json({ message: 'Channel updated', channel });
    } catch (err) {
        handleServiceError(res, err, 'Error updating channel');
    }
}

// ── POST /api/channels/:id/archive ────────────────────────────────────────────────
export async function archiveChannelController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        const channel = await archiveChannel(id);
        res.json({ message: 'Channel archived', channel });
    } catch (err) {
        handleServiceError(res, err, 'Error archiving channel');
    }
}

// ── GET /api/channels/:id/members ─────────────────────────────────────────────────
// Phase 1: returns all Mastermind-eligible users as mention candidates.
// The channelId param is validated but not used to filter (all public channels share
// the same eligible user pool). Phase 2+ private/DM channels will narrow this list.
export async function getChannelMembersController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        // Hide admin-only channels (and their member list) from non-admins; scope the mention
        // candidate pool to admins/owners when the channel is admin-only.
        const channel = await getChannelById(id);
        if (!channel || channel.type !== 'public' || channel.isArchived) {
            res.status(404).json({ message: 'Channel not found' });
            return;
        }
        if (channel.isAdminOnly && !(await callerIsChannelAdmin(req.session.userId!))) {
            res.status(404).json({ message: 'Channel not found' });
            return;
        }

        const members = await listChannelMentionCandidates({ adminOnly: channel.isAdminOnly });
        res.json({ users: members });
    } catch (err) {
        handleServiceError(res, err, 'Error fetching channel members');
    }
}

// ── DELETE /api/channels/:id ──────────────────────────────────────────────────────
export async function deleteChannelController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!UUID_REGEX.test(id)) {
            res.status(400).json({ message: 'Invalid channel id' });
            return;
        }

        const result = await deleteChannel(id);
        res.json({ message: 'Channel deleted', id: result.id });
    } catch (err) {
        handleServiceError(res, err, 'Error deleting channel');
    }
}
