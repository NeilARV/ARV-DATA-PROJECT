import { Session, Registration, Avatar } from "../controllers/auth/index.js";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "server/middleware/requireAuth.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG and PNG files are allowed"));
        }
    },
});

// Login
router.post("/login", Session.login);

// User logout
router.post("/logout", Session.logout);

// Get current user
router.get("/me", Session.me);

// Update current user profile
router.patch("/me", Session.updateProfile);

// Update current user notification preferences
router.patch("/me/notifications", Session.updateNotifications);

// User signup
router.post("/signup", Registration.signup);

// Avatar upload / removal (authenticated users only)
router.post("/me/avatar", requireAuth, upload.single("image"), Avatar.uploadAvatar);
router.delete("/me/avatar", requireAuth, Avatar.removeAvatar);

export default router;