import type { Request, Response } from 'express';
import type { MulterRequest } from 'server/middleware/multerTypes';
import {
    createUpload,
    getUploadStatus,
    listUploadViolations,
    processUpload,
} from 'server/services/codeViolations';
import { isUuid } from 'server/utils/uuid';

// 2 MB comfortably covers a ~1k-row Accela export (a few hundred KB of text).
const MAX_CSV_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/admin/code-violations/uploads — accept a CSV, store it as a pending batch,
 * respond 202 with the upload id, then process it off the request thread (parse → match →
 * auto-notify). Admin/owner only (enforced by route middleware).
 */
export async function uploadCsvController(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.session.userId;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const file = (req as MulterRequest).file;
        if (!file) {
            res.status(400).json({ message: 'No CSV file uploaded' });
            return;
        }
        if (file.size > MAX_CSV_BYTES) {
            res.status(400).json({ message: 'CSV exceeds the 2 MB limit' });
            return;
        }

        const rawCsv = file.buffer.toString('utf8');
        const uploadId = await createUpload({
            fileName: file.originalname,
            rawCsv,
            uploadedBy: userId,
        });

        res.status(202).json({ uploadId });

        // Fire-and-forget: processing must not block or fail the response. processUpload
        // captures its own errors onto the cv_uploads row; this catch is the last resort.
        void processUpload(uploadId).catch((err) =>
            console.error('processUpload background error:', err),
        );
    } catch (error) {
        console.error('uploadCsvController error:', error);
        res.status(500).json({ message: 'Failed to upload CSV' });
    }
}

/**
 * GET /api/admin/code-violations/uploads/:id — poll one upload's processing status +
 * row/matched summary.
 */
export async function getUploadStatusController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            res.status(400).json({ message: 'Invalid upload id' });
            return;
        }

        const upload = await getUploadStatus(id);
        if (!upload) {
            res.status(404).json({ message: 'Upload not found' });
            return;
        }
        res.json({ upload });
    } catch (error) {
        console.error('getUploadStatusController error:', error);
        res.status(500).json({ message: 'Failed to fetch upload status' });
    }
}

/**
 * GET /api/admin/code-violations/uploads/:id/violations — the violations from one upload,
 * enriched with match method, owning company, and notify state for the review screen.
 */
export async function getUploadViolationsController(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        if (!isUuid(id)) {
            res.status(400).json({ message: 'Invalid upload id' });
            return;
        }

        const violations = await listUploadViolations(id);
        res.json({ violations });
    } catch (error) {
        console.error('getUploadViolationsController error:', error);
        res.status(500).json({ message: 'Failed to fetch violations' });
    }
}
