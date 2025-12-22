import { Router } from "express";
import { users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { db } from "server/storage";
import { requireAdminAuth } from "server/middleware/requireAdminAuth";

const router = Router();

// Check admin auth status - depracted?
router.get("/status", async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session.userId) {
            return res.json({ authenticated: false, isAdmin: false });
        }

        // Check if user is admin
        const [user] = await db
            .select({ isAdmin: users.isAdmin })
            .from(users)
            .where(eq(users.id, req.session.userId))
            .limit(1);

        const isAdmin = user?.isAdmin;
        res.json({ authenticated: !!req.session.userId, isAdmin });
    } catch (error) {
        console.error("Error checking admin status:", error);
        res.status(500).json({ message: "Error checking admin status" });
    }
});

// Admin: Get all users
router.get("/users", requireAdminAuth, async (_req, res) => {
    try {
        const allUsers = await db
        .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            email: users.email,
            createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
        res.json(allUsers);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users" });
    }
});

export default router