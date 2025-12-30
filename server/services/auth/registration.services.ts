import { emailWhitelist, users } from "@shared/schema";
import { db } from "server/storage";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

interface SignupData {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
}

export async function isEmailWhiteListed(email: string) {

    const whitelistUser = await db.select().from(emailWhitelist).where(eq(emailWhitelist.email, email.toLowerCase())).limit(1);
    
    return whitelistUser;

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
            passwordHash
        })
        .returning()
    
    const { passwordHash: _, ...userWithoutPassword} = newUser

    return userWithoutPassword
}