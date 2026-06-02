import {
    users,
    userRelationshipManagers,
    userRoles,
    roles,
    userNotificationPreferences,
    emailSubscriptionList,
    subscriptions,
} from '@database/schemas/users.schema';
import { msas, userMsaSubscriptions } from '@database/schemas/msas.schema';
import { db } from 'server/storage';
import { eq, sql, inArray, and, ilike } from 'drizzle-orm';
import type { UpdateNotificationPreferences } from '@database/updates';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getSupabase, userStorageBucket, storagePathFromUrl } from 'server/lib/supabase.js';

interface SignupData {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
    county?: string | null;
    state?: string | null;
    subscriptionId?: number | null;
}

export async function createUser(data: SignupData) {
    const { firstName, lastName, phone, email, password, county, state, subscriptionId } = data;

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db
        .insert(users)
        .values({
            firstName,
            lastName,
            phone,
            email,
            passwordHash,
            notifications: true,
            county: county || null,
            state: state || null,
            subscriptionId: subscriptionId ?? null,
        })
        .returning();

    const { passwordHash: _, ...userWithoutPassword } = newUser;

    return userWithoutPassword;
}

export async function updateUser(
    userId: string,
    updateData: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        notifications?: boolean;
        msaSubscriptions?: string[];
        county?: string | null;
        state?: string | null;
    },
) {
    const { msaSubscriptions, ...dbUpdateData } = updateData;

    const [updatedUser] = await db
        .update(users)
        .set({
            ...dbUpdateData,
            updatedAt: sql`now()`, // Update the timestamp on every update
        })
        .where(eq(users.id, userId))
        .returning();

    if (updatedUser && msaSubscriptions !== undefined) {
        await syncUserMsaSubscriptions(userId, msaSubscriptions);
    }

    return updatedUser;
}

/**
 * Replaces the user's MSA subscriptions with the given list (by MSA name).
 * Resolves names to msas.id, then deletes existing subscriptions and inserts the new set.
 */
async function syncUserMsaSubscriptions(userId: string, msaNames: string[]): Promise<void> {
    if (msaNames.length === 0) {
        await db.delete(userMsaSubscriptions).where(eq(userMsaSubscriptions.userId, userId));
        return;
    }

    const msaRows = await db.select({ id: msas.id }).from(msas).where(inArray(msas.name, msaNames));

    const msaIds = msaRows.map((r) => r.id);
    if (msaIds.length === 0) {
        await db.delete(userMsaSubscriptions).where(eq(userMsaSubscriptions.userId, userId));
        return;
    }

    await db.delete(userMsaSubscriptions).where(eq(userMsaSubscriptions.userId, userId));

    await db.insert(userMsaSubscriptions).values(
        msaIds.map((msaId) => ({
            userId,
            msaId,
        })),
    );
}

/**
 * Adds a single MSA subscription for a user.
 */
export async function addUserMsaSubscription(userId: string, msaId: number): Promise<void> {
    await db.insert(userMsaSubscriptions).values({ userId, msaId });
}

/**
 * Links a user to a relationship manager in user_relationship_managers.
 */
export async function addUserRelationshipManager(
    userId: string,
    relationshipManagerId: string,
): Promise<void> {
    await db.insert(userRelationshipManagers).values({ userId, relationshipManagerId });
}

/**
 * Removes the link between a user and a relationship manager in user_relationship_managers.
 */
export async function removeUserRelationshipManager(
    userId: string,
    relationshipManagerId: string,
): Promise<void> {
    await db
        .delete(userRelationshipManagers)
        .where(
            and(
                eq(userRelationshipManagers.userId, userId),
                eq(userRelationshipManagers.relationshipManagerId, relationshipManagerId),
            ),
        );
}

export async function getUserByEmail(email: string) {
    const user = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    return user;
}

export async function getUserById(userId: string) {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    return user;
}

/**
 * Returns a randomly selected relationship manager from all users with the relationship-manager role.
 */
export async function getRandomRelationshipManager(): Promise<{
    firstName: string;
    lastName: string;
    email: string;
} | null> {
    const rows = await db
        .select({
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
        })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(roles.name, 'relationship-manager'));

    if (rows.length === 0) return null;
    return rows[Math.floor(Math.random() * rows.length)];
}

/**
 * Returns the relationship manager for a user (if any) for profile / me response.
 * Uses user_relationship_managers: current user is user_id, RM is relationship_manager_id.
 */
export async function getRelationshipManagerForUser(userId: string): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
} | null> {
    const rows = await db
        .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
        })
        .from(userRelationshipManagers)
        .innerJoin(users, eq(userRelationshipManagers.relationshipManagerId, users.id))
        .where(eq(userRelationshipManagers.userId, userId))
        .limit(1);
    const rm = rows[0];
    return rm ?? null;
}

/**
 * Returns MSA names the user is subscribed to (for profile / me response).
 */
export async function getUserMsaSubscriptionNames(userId: string): Promise<string[]> {
    const rows = await db
        .select({ name: msas.name })
        .from(userMsaSubscriptions)
        .innerJoin(msas, eq(userMsaSubscriptions.msaId, msas.id))
        .where(eq(userMsaSubscriptions.userId, userId));
    return rows.map((r) => r.name);
}

/**
 * Returns the user's notification preferences row, or null if none exists yet.
 */
export async function getUserNotificationPreferences(userId: string) {
    const [prefs] = await db
        .select()
        .from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userId, userId))
        .limit(1);
    return prefs ?? null;
}

/**
 * Returns the email_subscription_list row for a given email (case-insensitive), or null if not found.
 */
export async function checkEmailSubscriptionList(
    email: string,
): Promise<typeof emailSubscriptionList.$inferSelect | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const [row] = await db
        .select()
        .from(emailSubscriptionList)
        .where(sql`lower(trim(${emailSubscriptionList.email})) = ${normalizedEmail}`)
        .limit(1);
    return row ?? null;
}

/**
 * Removes an entry from email_subscription_list by its id.
 * Called after a user successfully signs up via that list.
 */
export async function removeEmailFromSubscriptionList(id: number): Promise<void> {
    await db.delete(emailSubscriptionList).where(eq(emailSubscriptionList.id, id));
}

/**
 * Returns the subscription id for a given tier name (e.g. "basic"), or null if not found.
 */
export async function getSubscriptionIdByName(name: string): Promise<number | null> {
    const [row] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.name, name))
        .limit(1);
    return row?.id ?? null;
}

/**
 * Creates or updates the user's notification preferences row (upsert).
 */
export async function upsertUserNotificationPreferences(
    userId: string,
    data: UpdateNotificationPreferences,
) {
    const [result] = await db
        .insert(userNotificationPreferences)
        .values({
            userId,
            ...data,
        })
        .onConflictDoUpdate({
            target: userNotificationPreferences.userId,
            set: {
                ...data,
                updatedAt: sql`now()`,
            },
        })
        .returning();
    return result;
}

export async function uploadUserAvatar(
    userId: string,
    buffer: Buffer,
    mimetype: string,
): Promise<string> {
    const [existing] = await db
        .select({ profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!existing) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (existing.profileImageUrl) {
        const oldPath = storagePathFromUrl(existing.profileImageUrl, userStorageBucket);
        if (oldPath) await getSupabase().storage.from(userStorageBucket).remove([oldPath]);
    }

    const ext = mimetype === 'image/png' ? 'png' : 'jpg';
    const storagePath = `avatars/${userId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await getSupabase()
        .storage.from(userStorageBucket)
        .upload(storagePath, buffer, { contentType: mimetype, upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const {
        data: { publicUrl },
    } = getSupabase().storage.from(userStorageBucket).getPublicUrl(storagePath);

    const urlWithBust = `${publicUrl}?t=${Date.now()}`;

    await db
        .update(users)
        .set({ profileImageUrl: urlWithBust, updatedAt: sql`now()` })
        .where(eq(users.id, userId));

    return urlWithBust;
}

export async function removeUserAvatar(userId: string): Promise<void> {
    const [existing] = await db
        .select({ profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!existing) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (existing.profileImageUrl) {
        const oldPath = storagePathFromUrl(existing.profileImageUrl, userStorageBucket);
        if (oldPath) await getSupabase().storage.from(userStorageBucket).remove([oldPath]);
    }

    await db
        .update(users)
        .set({ profileImageUrl: null, updatedAt: sql`now()` })
        .where(eq(users.id, userId));
}
