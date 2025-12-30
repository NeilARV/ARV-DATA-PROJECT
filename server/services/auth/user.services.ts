import { users } from "@shared/schema";
import { db } from "server/storage";
import { eq } from "drizzle-orm";

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