import bcrypt from "bcrypt";

export async function isValidPassword(password: string, passwordHash: string): Promise<boolean> {

    const isValidPassword = await bcrypt.compare(password, passwordHash)

    return isValidPassword

}