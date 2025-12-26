import { Router } from "express";
import { insertUserSchema, users, loginSchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "server/storage";
import { emailWhitelist } from "@shared/schema";

import bcrypt from "bcrypt";

const router = Router();

// Login
router.post("/login", async (req, res) => {
    try {
        const validation = loginSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({
            message: "Invalid login data",
            errors: validation.error.errors,
            });
        }

        const { email, password } = validation.data;

        // Find user by email
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Set user session
        req.session.userId = user.id;

    // Return user data (without password hash)
        const { passwordHash: _, ...userWithoutPassword } = user;
        res.json({
            success: true,
            user: userWithoutPassword,
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Error logging in" });
    }
});

// User logout
router.post("/logout", async (req, res) => {
    req.session.userId = undefined;
    res.json({ success: true });
});

// Get current user
router.get("/me", async (req, res) => {
    try {
        if (!req.session.userId) {
         return res.json({ user: null });
        }

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, req.session.userId))
            .limit(1);
            if (!user) {
            req.session.userId = undefined;
            return res.json({ user: null });
        }

        // Return user data (without password hash)
        const { passwordHash: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword });
    } catch (error) {
        console.error("Error fetching current user:", error);
        res.status(500).json({ message: "Error fetching user" });
    }
});

  // User signup
router.post("/signup", async (req, res) => {
    try {
        const validation = insertUserSchema.safeParse(req.body);

        if (!validation.success) {
            return res.status(400).json({
                message: "Invalid signup data",
                errors: validation.error.errors,
            });
        }

        const { firstName, lastName, phone, email, password } = validation.data;

        const whitelistUser = await db.select().from(emailWhitelist).where(eq(emailWhitelist.email, email.toLowerCase())).limit(1);

        if (whitelistUser.length === 0) {
            return res.status(403).json({message: "You are not authorized to sign up for this service."})
        }

        // Check if email already exists
        const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
        if (existingUser.length > 0) {
        return res
            .status(409)
            .json({ message: "An account with this email already exists" });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const [newUser] = await db
        .insert(users)
        .values({
            firstName,
            lastName,
            phone,
            email: email.toLowerCase(),
            passwordHash,
        })
        .returning();

        // Set user session
        req.session.userId = newUser.id;

        // Return user data (without password hash)
        const { passwordHash: _, ...userWithoutPassword } = newUser;

        res.status(201).json({
            success: true,
            user: userWithoutPassword,
        });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Error creating account" });
    }
});

export default router;