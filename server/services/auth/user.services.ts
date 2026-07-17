import {
    users,
    userRelationshipManagers,
    userRoles,
    roles,
    userNotificationPreferences,
    emailSubscriptionList,
    subscriptions,
    sessions,
} from '@database/schemas/users.schema';
import { db } from 'server/storage';
import { eq, ne, sql, and, isNull } from 'drizzle-orm';
import type { UpdateNotificationPreferences } from '@database/updates';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getSupabase, userStorageBucket, storagePathFromUrl } from 'server/lib/supabase.js';
import { normalizeEmail } from 'server/utils/normalizeEmail.js';

type UserRow = typeof users.$inferSelect;

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

/**
 * Updates a user's profile fields. Subscriptions are replaced separately (county table) by the
 * controller. If the email is changing, clears emailVerifiedAt — the stamp attests to the address
 * it was earned on, so a new address must be re-verified.
 * @returns the updated user (without password hash) and whether the email changed,
 * or null if no user matched.
 */
export async function updateUser(
    userId: string,
    dbUpdateData: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        notifications?: boolean;
        county?: string | null;
        state?: string | null;
    },
): Promise<{ user: Omit<UserRow, 'passwordHash'>; hasEmailChanged: boolean } | null> {
    // Compare normalized (matching getUserByEmail) so a case-only rewrite of the
    // same mailbox keeps its verification stamp. This pre-read only decides whether
    // the caller sends a verification email; the stamp itself is cleared atomically
    // in the UPDATE below.
    let hasEmailChanged = false;
    if (dbUpdateData.email !== undefined) {
        const [current] = await db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        hasEmailChanged =
            current != null && normalizeEmail(current.email) !== normalizeEmail(dbUpdateData.email);
    }

    const [updatedUser] = await db
        .update(users)
        .set({
            ...dbUpdateData,
            // The CASE compares against the row's pre-update email inside the UPDATE
            // itself, so a concurrent email change can't leave a stale verification stamp.
            ...(dbUpdateData.email !== undefined
                ? {
                      emailVerifiedAt: sql`CASE WHEN lower(trim(${users.email})) IS DISTINCT FROM ${normalizeEmail(dbUpdateData.email)} THEN NULL ELSE ${users.emailVerifiedAt} END`,
                  }
                : {}),
            updatedAt: sql`now()`, // Update the timestamp on every update
        })
        .where(eq(users.id, userId))
        .returning();

    if (!updatedUser) return null;

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return { user: userWithoutPassword, hasEmailChanged };
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

/**
 * Hashes a temporary password, writes it to the user with the given email, and
 * flags the account so the user is forced to set a new password on next login.
 * Returns the updated user (without the password hash), or null if no user matched.
 * Used by the self-serve forgot-password flow.
 */
export async function resetUserPassword(email: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const normalizedEmail = normalizeEmail(email);
    const [updatedUser] = await db
        .update(users)
        .set({ passwordHash, mustResetPassword: true, updatedAt: sql`now()` })
        .where(sql`lower(trim(${users.email})) = ${normalizedEmail}`)
        .returning();

    if (!updatedUser) return null;

    // Invalidate every existing session: the only way back in is the temp password,
    // which also guarantees the forced-reset screen can only be reached by someone
    // who proved possession of it.
    await destroyUserSessions(updatedUser.id);

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
}

/**
 * Deletes all express-session rows belonging to a user (sessions store the user id
 * in the serialized JSON blob). Used to force re-authentication after a password reset.
 * Best-effort: session cleanup must never fail the password operation that triggered it.
 */
export async function destroyUserSessions(userId: string): Promise<void> {
    try {
        await db.delete(sessions).where(sql`(${sessions.sess}::jsonb ->> 'userId') = ${userId}`);
    } catch (error) {
        console.error('[sessions] Failed to destroy user sessions:', error);
    }
}

/**
 * Deletes all of a user's sessions except the one identified by keepSid. Used on a
 * voluntary password change to log the user out of every other device. Best-effort.
 */
export async function destroyOtherUserSessions(userId: string, keepSid: string): Promise<void> {
    try {
        await db
            .delete(sessions)
            .where(
                and(
                    sql`(${sessions.sess}::jsonb ->> 'userId') = ${userId}`,
                    ne(sessions.sid, keepSid),
                ),
            );
    } catch (error) {
        console.error('[sessions] Failed to destroy other user sessions:', error);
    }
}

/**
 * Hashes a new password for the given user and clears the forced-reset flag.
 * Used by both the voluntary change-password flow and the forced post-login reset.
 * Returns the updated user (without the password hash), or null if no user matched.
 */
export async function changeUserPassword(userId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const [updatedUser] = await db
        .update(users)
        .set({ passwordHash, mustResetPassword: false, updatedAt: sql`now()` })
        .where(eq(users.id, userId))
        .returning();

    if (!updatedUser) return null;

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
}

/**
 * Stamps the user as email-verified. Only writes when currently unverified, so re-verifying
 * (idempotent / grandfathered users) preserves the original verification time.
 * Returns the updated user (without password hash), or null if no update occurred.
 */
export async function markEmailVerified(userId: string) {
    const [updatedUser] = await db
        .update(users)
        .set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
        .returning();

    if (!updatedUser) return null;

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
}

export async function getUserByEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);
    const user = await db
        .select()
        .from(users)
        .where(sql`lower(trim(${users.email})) = ${normalizedEmail}`)
        .limit(1);

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
    const normalizedEmail = normalizeEmail(email);
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
 * Resolves the subscription id granted to a subscription-list signup (the basic
 * tier), by name rather than assuming the seed order of the subscriptions table.
 * @returns the basic tier's id, or null when the tier row is missing — logged, so
 * signup proceeds without a subscription rather than failing.
 */
export async function resolveSignupSubscriptionId(): Promise<number | null> {
    const subscriptionId = await getSubscriptionIdByName('basic');
    if (subscriptionId == null) {
        console.error(
            '[signup] subscription tier "basic" not found; creating user without a subscription',
        );
    }
    return subscriptionId;
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

    // Remove the old file only after the new upload and DB pointer succeed — a failed
    // upload must never cost the user their current avatar. Best-effort: an orphaned
    // file is harmless, so a removal failure is logged, not thrown.
    await removeAvatarFromStorage(existing.profileImageUrl);

    return urlWithBust;
}

export async function removeUserAvatar(userId: string): Promise<void> {
    const [existing] = await db
        .select({ profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!existing) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    await db
        .update(users)
        .set({ profileImageUrl: null, updatedAt: sql`now()` })
        .where(eq(users.id, userId));

    // Storage cleanup last: if it fails, the DB no longer points at the file, so the
    // user sees the avatar gone either way (an orphaned file beats a broken pointer).
    await removeAvatarFromStorage(existing.profileImageUrl);
}

/**
 * Best-effort removal of an avatar file from Supabase Storage by its public URL.
 * Failures are logged, never thrown — callers run this after their primary write
 * has already succeeded.
 */
async function removeAvatarFromStorage(profileImageUrl: string | null): Promise<void> {
    if (!profileImageUrl) return;

    const oldPath = storagePathFromUrl(profileImageUrl, userStorageBucket);
    if (!oldPath) return;

    // try/catch enforces the never-throws contract: the Supabase client returns API
    // errors in the result object but can still reject on a network-level failure.
    try {
        const { error } = await getSupabase().storage.from(userStorageBucket).remove([oldPath]);
        if (error) {
            console.error('[avatar] Failed to remove old avatar file:', error.message);
        }
    } catch (error) {
        console.error('[avatar] Failed to remove old avatar file:', error);
    }
}
