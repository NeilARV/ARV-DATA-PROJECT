import { Request, Response, NextFunction } from "express";
import { loginSchema, updateUserProfileSchema } from "@shared/schema";
import { AuthServices } from "server/services/auth";
import { IdentityServices } from "server/services/identity";

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

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Check if user is authenticated
        if (!req.session.userId) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        // Validate request body
        const validation = updateUserProfileSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: "Invalid profile data",
                errors: validation.error.errors,
            });
            return;
        }

        const updateData = validation.data;

        // Check if email is being updated and if it's already taken by another user
        if (updateData.email) {
            const [existingUser] = await AuthServices.Users.getUserByEmail(updateData.email);
            if (existingUser && existingUser.id !== req.session.userId) {
                res.status(409).json({ message: "An account with this email already exists" });
                return;
            }
        }

        // Update user profile (only allow updating own profile)
        const updatedUser = await IdentityServices.updateUser(req.session.userId, updateData);

        if (!updatedUser) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        // Return updated user data (without password hash)
        const { passwordHash: _, ...userWithoutPassword } = updatedUser;
        res.json({
            success: true,
            user: userWithoutPassword,
        });

    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ message: "Error updating profile" });
    }
}