import { Request, Response, NextFunction } from "express";
import { insertUserSchema } from "@shared/schema";
import { AuthServices } from "server/services/auth";
import { Identity } from "server/services/identity";

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        
        const validation = insertUserSchema.safeParse(req.body);

        if (!validation.success) {
            res.status(400).json({
                message: "Invalid signup data",
                errors: validation.error.errors,
            });
            return;
        }

        const { firstName, lastName, phone, email, password } = validation.data;

        const whitelistUser = await AuthServices.Registration.isEmailWhiteListed(email)

        if (whitelistUser.length === 0) {
            res.status(403).json({message: "You are not authorized to sign up for this service."})
            return;
        }

        // Get user by email
        const existingUser = await AuthServices.Users.getUserByEmail(email)

        // Check if email already exists
        if (existingUser.length > 0) {
            res.status(409).json({ message: "An account with this email already exists" });
            return;
        }

        const newUser = await Identity.createUser({
            firstName,
            lastName,
            phone,
            email,
            password
        })

        // Set user session
        req.session.userId = newUser.id;

        // Return user data (without password hash)
        res.status(201).json({
            success: true,
            user: newUser,
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Error creating account" });
    }
}