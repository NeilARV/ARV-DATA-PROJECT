import { db } from "server/storage";
import { users } from "@shared/schema";
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