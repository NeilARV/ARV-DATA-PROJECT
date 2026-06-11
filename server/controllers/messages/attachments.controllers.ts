import type { Request, Response } from 'express';
import {
    uploadAttachment,
    AttachmentServiceError,
} from 'server/services/messages/attachments.services';

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
        if (err instanceof AttachmentServiceError) {
            res.status(err.statusCode).json({ message: err.message });
            return;
        }
        console.error('Error uploading attachment:', err);
        res.status(500).json({ message: 'Error uploading attachment' });
    }
}
