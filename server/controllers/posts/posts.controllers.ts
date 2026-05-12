import type { Request, Response } from "express";
import type { MulterRequest } from "server/middleware/multerTypes";
import { PostsServices, PostServiceError } from "server/services/posts";

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof PostServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── GET /api/posts ─────────────────────────────────────────────────────────────
export async function getPostsController(req: Request, res: Response): Promise<void> {
    try {
        const categoryId = req.query.categoryId ? parseInt(req.query.categoryId.toString(), 10) : undefined;
        const vendorId   = typeof req.query.vendorId === "string" ? req.query.vendorId : undefined;
        const userId     = typeof req.query.userId   === "string" ? req.query.userId   : undefined;
        const page       = req.query.page  ? parseInt(req.query.page.toString(),  10) : undefined;
        const limit      = req.query.limit ? parseInt(req.query.limit.toString(), 10) : undefined;

        if (req.query.categoryId !== undefined && isNaN(categoryId!)) {
            res.status(400).json({ message: "Invalid categoryId" });
            return;
        }

        const results = await PostsServices.getPosts({ categoryId, vendorId, userId, page, limit });
        res.json(results);
    } catch (err) {
        handleServiceError(res, err, "Error fetching posts");
    }
}

// ── GET /api/posts/:postId ─────────────────────────────────────────────────────
export async function getPostByIdController(req: Request, res: Response): Promise<void> {
    try {
        const result = await PostsServices.getPostById(req.params.postId);
        if (!result) {
            res.status(404).json({ message: "Post not found" });
            return;
        }
        res.json(result);
    } catch (err) {
        handleServiceError(res, err, "Error fetching post");
    }
}

// ── POST /api/posts ────────────────────────────────────────────────────────────
export async function createPostController(req: Request, res: Response): Promise<void> {
    try {
        const callerId = req.session.userId;
        if (!callerId) {
            res.status(401).json({ message: "Not authenticated" });
            return;
        }

        const { title, content, address, city, state, categoryIds, vendorIds, taggedUserIds } = req.body;

        if (!title || typeof title !== "string" || !title.trim()) {
            res.status(400).json({ message: "title is required" });
            return;
        }
        if (!content || typeof content !== "string" || !content.trim()) {
            res.status(400).json({ message: "content is required" });
            return;
        }

        const post = await PostsServices.createPost({
            userId: callerId,
            title,
            content,
            address,
            city,
            state,
            categoryIds,
            vendorIds,
            taggedUserIds,
        });

        res.status(201).json({ message: "Post created successfully", post });
    } catch (err) {
        handleServiceError(res, err, "Error creating post");
    }
}

// ── PUT /api/posts/:postId ─────────────────────────────────────────────────────
export async function updatePostController(req: Request, res: Response): Promise<void> {
    try {
        const callerId = req.session.userId!;

        const { title, content, address, city, state, categoryIds, vendorIds, taggedUserIds } = req.body;

        const updated = await PostsServices.updatePost(req.params.postId, callerId, {
            title,
            content,
            address,
            city,
            state,
            categoryIds,
            vendorIds,
            taggedUserIds,
        });

        res.json({ message: "Post updated successfully", post: updated });
    } catch (err) {
        handleServiceError(res, err, "Error updating post");
    }
}

// ── DELETE /api/posts/:postId ──────────────────────────────────────────────────
export async function deletePostController(req: Request, res: Response): Promise<void> {
    try {
        const callerId = req.session.userId!;

        const result = await PostsServices.deletePost(req.params.postId, callerId);
        res.json({ message: "Post deleted successfully", id: result.id });
    } catch (err) {
        handleServiceError(res, err, "Error deleting post");
    }
}

// ── POST /api/posts/:postId/images ─────────────────────────────────────────────
export async function uploadPostImageController(req: MulterRequest, res: Response): Promise<void> {
    try {
        const callerId = req.session.userId!;

        if (!req.file) {
            res.status(400).json({ message: "No file provided" });
            return;
        }

        const image = await PostsServices.uploadPostImage(
            req.params.postId,
            callerId,
            req.file.buffer,
            req.file.mimetype,
        );

        res.status(201).json({ message: "Image uploaded", image });
    } catch (err) {
        handleServiceError(res, err, "Error uploading image");
    }
}

// ── DELETE /api/posts/:postId/images/:imageId ──────────────────────────────────
export async function deletePostImageController(req: Request, res: Response): Promise<void> {
    try {
        const callerId = req.session.userId!;
        const imageId = parseInt(req.params.imageId, 10);

        if (isNaN(imageId)) {
            res.status(400).json({ message: "Invalid imageId" });
            return;
        }

        const result = await PostsServices.deletePostImage(imageId, callerId);
        res.json({ message: "Image deleted", id: result.id });
    } catch (err) {
        handleServiceError(res, err, "Error deleting image");
    }
}
