import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { users, roles, userRoles } from "@database/schemas/users.schema";

// Lazily initialised so the connection is created after globalSetup loads
// .env.test and DATABASE_URL is available.
let _db: ReturnType<typeof drizzle> | null = null;

export function getTestDb() {
    if (_db) return _db;
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is not set. Create a .env.test file with TEST_DATABASE_URL=<your-neon-test-branch-url>.");
    _db = drizzle(neon(url));
    return _db;
}

// ── Seed helpers ──────────────────────────────────────────────────────────

export async function seedTestUser(id: string) {
    const db = getTestDb();
    await db.insert(users).values({
        id,
        firstName: "Integration",
        lastName: "Test",
        email: `${id}@integration.test.internal`,
        phone: "(555) 000-0000",
        passwordHash: "not-a-real-hash",
    });
}

// ── Role helpers ──────────────────────────────────────────────────────────

export async function getRoleId(roleName: string): Promise<number> {
    const db = getTestDb();
    const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, roleName));
    if (!role) throw new Error(`Role "${roleName}" not found. Ensure the test branch schema is up to date.`);
    return role.id;
}

export async function assignRole(userId: string, roleName: string) {
    const db = getTestDb();
    const roleId = await getRoleId(roleName);
    await db.insert(userRoles).values({ userId, roleId });
}

export async function removeAllRoles(userId: string) {
    const db = getTestDb();
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
}

// ── Teardown helpers ──────────────────────────────────────────────────────

// Deletes a user and all their roles (user_roles cascade deletes automatically).
export async function deleteTestUser(id: string) {
    const db = getTestDb();
    await db.delete(users).where(eq(users.id, id));
}
