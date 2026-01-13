import { db } from "server/storage";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
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
}) {
    const [updatedUser] = await db
        .update(users)
        .set({
            ...updateData,
            updatedAt: sql`now()`, // Update the timestamp on every update
        })
        .where(eq(users.id, userId))
        .returning();

    return updatedUser;
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