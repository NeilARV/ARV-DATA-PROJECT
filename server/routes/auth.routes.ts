import { Router } from "express";
import { AuthControllers } from "server/controllers/auth";

const router = Router();

// Login
router.post("/login", AuthControllers.Session.login);

// User logout
router.post("/logout", AuthControllers.Session.logout);

// Get current user
router.get("/me", AuthControllers.Session.me);

// Update current user profile
router.patch("/me", AuthControllers.Session.updateProfile);

// User signup
router.post("/signup", AuthControllers.Registration.signup);

export default router;