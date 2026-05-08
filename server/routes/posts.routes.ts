import { Router } from "express";
import { requireSub } from "server/middleware/requireSub";
import {
    getPostsController,
    getPostByIdController,
    createPostController,
    updatePostController,
    deletePostController,
} from "server/controllers/posts";

const router = Router();

// Public — no auth required to browse the feed
router.get("/", getPostsController);

// Requires basic subscription or higher; admin/owner bypass
router.get("/:postId", /*requireSub(["basic", "pro", "premium"], { bypassRoles: ["admin", "owner"] }), */ getPostByIdController);

// Requires basic subscription or higher; all team roles bypass
router.post("/", /*requireSub(["basic", "pro", "premium"], { bypassRoles: ["admin", "owner", "relationship-manager", "member"] }),*/ createPostController);

// Requires basic subscription or higher; admin/owner bypass; ownership enforced in service
router.put("/:postId", /*requireSub(["basic", "pro", "premium"], { bypassRoles: ["admin", "owner"] }),*/ updatePostController);

// Requires basic subscription or higher; admin/owner bypass; ownership enforced in service
router.delete("/:postId", /*requireSub(["basic", "pro", "premium"], { bypassRoles: ["admin", "owner"] }),*/ deletePostController);

export default router;
