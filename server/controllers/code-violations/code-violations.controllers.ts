import { Request, Response } from 'express';
import type { MulterRequest } from 'server/middleware/multerTypes';
import { uploadCodeViolationsSchema } from '@database/validation/code-violations.validation';
import { CodeViolationsService } from 'server/services/code-violations';
import { InvalidCsvError } from 'server/services/code-violations/code-violations.services';
import { isUuid } from 'server/utils/uuid';

/**
 * POST /api/code-violations/uploads — Phase 1 ingest of an Accela CSV export.
 * Archives the file, enqueues each complaint as `pending`, and returns immediately. The service
 * then fires the consumer drain in the background (no cron) so matching/owner-resolution/review
 * begin right after upload; the admin panel polls GET /uploads/:id for progress.
 */
export async function uploadCodeViolationCsv(req: MulterRequest, res: Response): Promise<void> {
    try {
        if (!req.session.userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ message: 'No CSV file provided' });
            return;
        }

        const parsedBody = uploadCodeViolationsSchema.safeParse(req.body);
        if (!parsedBody.success) {
            res.status(400).json({ message: 'Invalid input', errors: parsedBody.error.errors });
            return;
        }

        const result = await CodeViolationsService.ingestCodeViolationCsv({
            buffer: req.file.buffer,
            fileName: req.file.originalname,
            mimetype: req.file.mimetype,
            uploadedBy: req.session.userId,
            source: parsedBody.data.source,
        });

        res.status(201).json(result);
    } catch (error) {
        if (error instanceof InvalidCsvError) {
            res.status(400).json({ message: error.message });
            return;
        }
        console.error('uploadCodeViolationCsv error:', error);
        res.status(500).json({ message: 'Failed to ingest code-violation CSV' });
    }
}

/**
 * GET /api/code-violations/uploads — list ingest runs (most recent first) for the admin panel.
 */
export async function listCodeViolationUploads(_req: Request, res: Response): Promise<void> {
    try {
        const uploads = await CodeViolationsService.listCodeViolationUploads();
        res.json({ uploads });
    } catch (error) {
        console.error('listCodeViolationUploads error:', error);
        res.status(500).json({ message: 'Failed to list code-violation uploads' });
    }
}

/**
 * GET /api/code-violations/uploads/:id — fetch a single ingest run plus its per-complaint
 * breakdown (status of each complaint, resolved owner, and the company's alert recipients) so the
 * admin panel can show per-complaint statuses and who each sent alert reached.
 */
export async function getCodeViolationUpload(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        // Guard the uuid before the query — an invalid id would otherwise reach a uuid column and
        // make Postgres throw ('invalid input syntax for type uuid'), surfacing as a 500. A
        // malformed id can't reference a row, so treat it as not found.
        if (!isUuid(id)) {
            res.status(404).json({ message: 'Upload not found' });
            return;
        }
        const upload = await CodeViolationsService.getCodeViolationUploadById(id);
        if (!upload) {
            res.status(404).json({ message: 'Upload not found' });
            return;
        }
        const violations = await CodeViolationsService.getCodeViolationUploadViolations(id);
        res.json({ upload, violations });
    } catch (error) {
        console.error('getCodeViolationUpload error:', error);
        res.status(500).json({ message: 'Failed to retrieve code-violation upload' });
    }
}
