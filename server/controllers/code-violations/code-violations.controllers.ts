import { Request, Response } from 'express';
import { z } from 'zod';
import type { MulterRequest } from 'server/middleware/multerTypes';
import { uploadCodeViolationsSchema } from '@database/validation/code-violations.validation';
import { CodeViolationsService } from 'server/services/code-violations';
import { InvalidCsvError } from 'server/services/code-violations/code-violations.services';

/**
 * POST /api/code-violations/uploads — Phase 1 ingest of an Accela CSV export.
 * Archives the file, enqueues each complaint as `pending`, and returns immediately.
 * No matching or emailing happens here (that is the cron consumer's job).
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
 * GET /api/code-violations/uploads/:id — fetch a single ingest run.
 */
export async function getCodeViolationUpload(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        // Guard the uuid before the query — an invalid id would otherwise reach a uuid column and
        // make Postgres throw ('invalid input syntax for type uuid'), surfacing as a 500. A
        // malformed id can't reference a row, so treat it as not found.
        if (!z.string().uuid().safeParse(id).success) {
            res.status(404).json({ message: 'Upload not found' });
            return;
        }
        const upload = await CodeViolationsService.getCodeViolationUploadById(id);
        if (!upload) {
            res.status(404).json({ message: 'Upload not found' });
            return;
        }
        res.json({ upload });
    } catch (error) {
        console.error('getCodeViolationUpload error:', error);
        res.status(500).json({ message: 'Failed to retrieve code-violation upload' });
    }
}

/**
 * POST /api/code-violations/uploads/:id/approve — approve an upload's dry-run (§4.6) and fire the
 * notification emails held for review. Advances the upload `review → completed`.
 */
export async function approveCodeViolationUpload(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        // Guard the uuid before the query (see getCodeViolationUpload) — a malformed id is treated
        // as not found rather than reaching a uuid column and surfacing as a 500.
        if (!z.string().uuid().safeParse(id).success) {
            res.status(404).json({ message: 'Upload not found' });
            return;
        }

        const result = await CodeViolationsService.approveCodeViolationUpload(id);
        if (result.status === 'not-found') {
            res.status(404).json({ message: 'Upload not found' });
            return;
        }
        if (result.status === 'not-in-review') {
            res.status(409).json({ message: 'Upload is not awaiting review' });
            return;
        }

        res.json({
            upload: result.upload,
            violationsNotified: result.violationsNotified,
            emailsSent: result.emailsSent,
        });
    } catch (error) {
        console.error('approveCodeViolationUpload error:', error);
        res.status(500).json({ message: 'Failed to approve code-violation upload' });
    }
}
