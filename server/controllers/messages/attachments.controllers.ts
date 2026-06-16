import type { Request, Response } from 'express';
import { uploadAttachment } from 'server/services/messages/attachments.services';
import { handleServiceError } from 'server/utils/serviceError';

// ── POST /api/mastermind/attachments ───────────────────────────────────────────────
export async function uploadAttachmentController(req: Request, res: Response): Promise<void> {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file provided' });
            return;
        }

        const attachment = await uploadAttachment({
            userId: req.session.userId!,
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalName: req.file.originalname,
        });
        res.status(201).json({ attachment });
    } catch (err) {
        handleServiceError(res, err, 'Error uploading attachment');
    }
}
