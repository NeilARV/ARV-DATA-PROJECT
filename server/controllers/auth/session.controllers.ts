import { Request, Response, NextFunction } from "express";
import { users, loginSchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "server/storage";
import { AuthServices } from "server/services/auth";

export async function login(req: Request, res: Response, next: NextFunction):Promise<void> {
    try {
        const validation = loginSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: "Invalid login data",
                errors: validation.error.errors,
            });
            return;
        }

        const { email, password } = validation.data;

        // Find user by email
        const [ user ] = await AuthServices.Users.getUserByEmail(email)

        // User does not exist
        if (!user) {
            res.status(401).json({ message: "Invalid email or password" });
            return;
        }

        // Verify password
        const isValidPassword = AuthServices.Session.isValidPassword(password, user.passwordHash)
        
        if (!isValidPassword) {
            res.status(401).json({ message: "Invalid email or password" });
            return;
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
}

export async function logout(req: Request, res: Response, next: NextFunction):Promise<void> {
    req.session.userId = undefined;
    res.json({ success: true });
}

export async function me(req: Request, res: Response, next: NextFunction):Promise<void> {
    try {
        if (!req.session.userId) {
            res.json({ user: null });
            return;
        }
        
        const [ user ] = await AuthServices.Users.getUserById(req.session.userId)
            
        if (!user) {
            req.session.userId = undefined;
            res.json({ user: null });
            return;
        }

        // Return user data (without password hash)
        const { passwordHash: _, ...userWithoutPassword } = user;
        res.json({ user: userWithoutPassword });

    } catch (error) {
        console.error("Error fetching current user:", error);
        res.status(500).json({ message: "Error fetching user" });
    }    
}