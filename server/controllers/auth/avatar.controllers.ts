import { Response } from "express";
import type { MulterRequest } from "server/middleware/multerTypes";
import { UserServices } from "server/services/auth";

export async function uploadAvatar(req: MulterRequest, res: Response): Promise<void> {
    if (!req.session.userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    if (!req.file) {
        res.status(400).json({ message: "No file provided" });
        return;
    }
    try {
        const profileImageUrl = await UserServices.uploadUserAvatar(
            req.session.userId,
            req.file.buffer,
            req.file.mimetype,
        );
        res.status(200).json({ profileImageUrl });
    } catch (error: unknown) {
        if (error instanceof Error && "statusCode" in error && (error as { statusCode: number }).statusCode === 404) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        console.error("Error uploading avatar:", error);
        res.status(500).json({ message: "Error uploading avatar" });
    }
}

export async function removeAvatar(req: MulterRequest, res: Response): Promise<void> {
    if (!req.session.userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        await UserServices.removeUserAvatar(req.session.userId);
        res.status(200).json({ message: "Avatar removed" });
    } catch (error: unknown) {
        if (error instanceof Error && "statusCode" in error && (error as { statusCode: number }).statusCode === 404) {
            res.status(404).json({ message: "User not found" });
            return;
        }
        console.error("Error removing avatar:", error);
        res.status(500).json({ message: "Error removing avatar" });
    }
}
