import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from 'server/middleware/requireAuth';
import {
    getPostsController,
    getPostByIdController,
    createPostController,
    updatePostController,
    deletePostController,
    uploadPostImageController,
    deletePostImageController,
} from 'server/controllers/posts';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG and PNG files are allowed'));
        }
    },
});

// Public — no auth required
router.get('/', getPostsController);
router.get('/:postId', getPostByIdController);

// Auth required to create a community post
router.post('/', requireAuth, createPostController);

// Auth required; ownership enforced in service (admin/owner can override)
router.put('/:postId', requireAuth, updatePostController);
router.delete('/:postId', requireAuth, deletePostController);

// Image management — auth required; ownership enforced in service
router.post('/:postId/images', requireAuth, upload.single('image'), uploadPostImageController);
router.delete('/:postId/images/:imageId', requireAuth, deletePostImageController);

export default router;
