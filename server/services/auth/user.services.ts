import { users, userRelationshipManagers } from "@database/schemas/users.schema";
import { msas, userMsaSubscriptions } from "@database/schemas/msas.schema";
import { db } from "server/storage";
import { eq, sql, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";


interface SignupData {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
}

export async function createUser(data: SignupData) {

    const { firstName, lastName, phone, email, password } = data

    const passwordHash = await bcrypt.hash(password, 10)

    const [newUser] = await db
        .insert(users)
        .values({
            firstName,
            lastName,
            phone,
            email,
            passwordHash,
            notifications: true // Explicitly set to true on signup
        })
        .returning()
    
    const { passwordHash: _, ...userWithoutPassword} = newUser

    return userWithoutPassword
}

export async function updateUser(userId: string, updateData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    notifications?: boolean;
    msaSubscriptions?: string[];
}) {
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

    const msaRows = await db
        .select({ id: msas.id })
        .from(msas)
        .where(inArray(msas.name, msaNames));

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
        }))
    );
}

/**
 * Adds a single MSA subscription for a user (e.g. from email_whitelist on signup).
 */
export async function addUserMsaSubscription(userId: string, msaId: number): Promise<void> {
    await db.insert(userMsaSubscriptions).values({ userId, msaId });
}

/**
 * Links a user to a relationship manager in user_relationship_managers (e.g. from email_whitelist on signup).
 */
export async function addUserRelationshipManager(userId: string, relationshipManagerId: string): Promise<void> {
    await db.insert(userRelationshipManagers).values({ userId, relationshipManagerId });
}

export async function getUserByEmail(email: string) {

    const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
    
    return user
}

export async function getUserById(userId: string) {
    const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    return user
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