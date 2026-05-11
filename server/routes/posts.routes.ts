import { Router } from "express";
import { requireSub } from "server/middleware/requireSub";
import { requireAuth } from "server/middleware/requireAuth";
import {
    getPostsController,
    getPostByIdController,
    createPostController,
    updatePostController,
    deletePostController,
} from "server/controllers/posts";

const router = Router();

// Public — no auth required
router.get("/", getPostsController);
router.get("/:postId", getPostByIdController);

// pro/premium subscription required; all team roles bypass
router.post("/", requireSub(["pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] }), createPostController);

// Auth required; ownership enforced in service (admin/owner can override)
router.put("/:postId", requireAuth, updatePostController);
router.delete("/:postId", requireAuth, deletePostController);

export default router;
