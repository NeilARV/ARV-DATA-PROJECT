import { Router } from 'express';
import multer from 'multer';
import { requireMastermind } from 'server/middleware/requireMastermind';
import { uploadAttachmentController } from 'server/controllers/messages/attachments.controllers';
import {
    ALLOWED_ATTACHMENT_TYPES,
    MAX_ATTACHMENT_BYTES,
} from 'server/services/messages/attachments.services';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_ATTACHMENT_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'));
        }
    },
});

// POST /api/mastermind/attachments — upload one file; returns metadata to send with a message
router.post('/attachments', requireMastermind, upload.single('file'), uploadAttachmentController);

export default router;
