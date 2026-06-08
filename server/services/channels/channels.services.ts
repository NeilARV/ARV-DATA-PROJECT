import { db } from 'server/storage';
import { channels } from '@database/schemas/mastermind.schema';
import type { Channel } from '@database/types/mastermind';
import { eq, and } from 'drizzle-orm';

export class ChannelServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'ChannelServiceError';
    }
}

// Postgres unique_violation — the channels.name unique constraint. The pre-checks
// below give a clean 409 in the common case; this guards the concurrent race where
// two writers pass the pre-check and one loses at the DB level.
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && err.code === PG_UNIQUE_VIOLATION;
}

// Lists public channels. Archived channels are excluded unless includeArchived is set
// (the controller only honors that flag for admin/owner callers).
export async function listChannels({
    includeArchived = false,
}: {
    includeArchived?: boolean;
}): Promise<Channel[]> {
    const where = includeArchived
        ? eq(channels.type, 'public')
        : and(eq(channels.type, 'public'), eq(channels.isArchived, false));

    return db.select().from(channels).where(where).orderBy(channels.name);
}

export async function getChannelById(id: string): Promise<Channel | null> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
    return channel ?? null;
}

export async function createChannel({
    name,
    description,
    createdBy,
}: {
    name: string;
    description?: string | null;
    createdBy: string;
}): Promise<Channel> {
    const [existing] = await db
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.name, name))
        .limit(1);
    if (existing) {
        throw new ChannelServiceError(409, 'A channel with that name already exists');
    }

    try {
        const [created] = await db
            .insert(channels)
            .values({ name, description: description ?? null, createdBy })
            .returning();
        return created;
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new ChannelServiceError(409, 'A channel with that name already exists');
        }
        throw err;
    }
}

export async function updateChannel(
    id: string,
    { name, description }: { name?: string; description?: string | null },
): Promise<Channel> {
    const channel = await getChannelById(id);
    if (!channel) {
        throw new ChannelServiceError(404, 'Channel not found');
    }

    if (name && name !== channel.name) {
        const [clash] = await db
            .select({ id: channels.id })
            .from(channels)
            .where(eq(channels.name, name))
            .limit(1);
        if (clash) {
            throw new ChannelServiceError(409, 'A channel with that name already exists');
        }
    }

    try {
        const [updated] = await db
            .update(channels)
            .set({
                name: name ?? channel.name,
                description: description === undefined ? channel.description : description,
                updatedAt: new Date(),
            })
            .where(eq(channels.id, id))
            .returning();
        return updated;
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new ChannelServiceError(409, 'A channel with that name already exists');
        }
        throw err;
    }
}

// Soft archive — the first "delete". Reversible safety net before a hard delete.
export async function archiveChannel(id: string): Promise<Channel> {
    const channel = await getChannelById(id);
    if (!channel) {
        throw new ChannelServiceError(404, 'Channel not found');
    }

    const [archived] = await db
        .update(channels)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(channels.id, id))
        .returning();
    return archived;
}

// Hard delete (cascade) — only permitted once the channel is already archived.
export async function deleteChannel(id: string): Promise<{ id: string }> {
    const channel = await getChannelById(id);
    if (!channel) {
        throw new ChannelServiceError(404, 'Channel not found');
    }
    if (!channel.isArchived) {
        throw new ChannelServiceError(409, 'Archive the channel before deleting it');
    }

    await db.delete(channels).where(eq(channels.id, id));
    return { id };
}
