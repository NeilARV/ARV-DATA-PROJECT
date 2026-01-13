import { Session, Registration } from "../controllers/auth/index.js";
import { Router } from "express";

const router = Router();

// Login
router.post("/login", Session.login);

// User logout
router.post("/logout", Session.logout);

// Get current user
router.get("/me", Session.me);

// Update current user profile
router.patch("/me", Session.updateProfile);

// User signup
router.post("/signup", Registration.signup);

export default router;