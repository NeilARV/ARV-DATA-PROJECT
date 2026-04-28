import { Request, Response, NextFunction } from "express";
import { insertUserSchema } from "@database/inserts";
import { UserServices } from "server/services/auth";


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

        const existingUser = await UserServices.getUserByEmail(email);

        if (existingUser.length > 0) {
            res.status(409).json({ message: "An account with this email already exists" });
            return;
        }

        const newUser = await UserServices.createUser({
            firstName,
            lastName,
            phone,
            email,
            password,
        });

        req.session.userId = newUser.id;

        res.status(201).json({
            success: true,
            user: newUser,
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Error creating account" });
    }
}
