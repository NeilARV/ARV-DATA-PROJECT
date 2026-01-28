import { emailWhitelist } from "@database/schemas";
import { db } from "server/storage";
import { eq } from "drizzle-orm";

export async function isEmailWhiteListed(email: string) {

    const whitelistUser = await db.select().from(emailWhitelist).where(eq(emailWhitelist.email, email.toLowerCase())).limit(1);
    
    return whitelistUser;

}