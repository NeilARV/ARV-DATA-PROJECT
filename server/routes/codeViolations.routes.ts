import { Router } from 'express';
import multer from 'multer';
import { requireRole } from 'server/middleware/requireRole';
import { ADMIN_ROLES } from 'server/constants/roles.constants';
import {
    uploadCsvController,
    getUploadStatusController,
    getUploadViolationsController,
} from 'server/controllers/codeViolations/codeViolations.controllers';

const router = Router();

// In-memory CSV upload (~1k rows = a few hundred KB). Accept by CSV mimetype or .csv name —
// browsers report CSV inconsistently (text/csv, application/vnd.ms-excel, octet-stream).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const isCsv =
            file.mimetype === 'text/csv' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.mimetype === 'application/octet-stream' ||
            file.originalname.toLowerCase().endsWith('.csv');
        if (isCsv) cb(null, true);
        else cb(new Error('Only CSV files are allowed'));
    },
});

// POST /api/admin/code-violations/uploads — upload an Accela CSV (admin/owner only)
router.post('/uploads', requireRole(ADMIN_ROLES), upload.single('file'), uploadCsvController);

// GET /api/admin/code-violations/uploads/:id — poll one upload's processing status
router.get('/uploads/:id', requireRole(ADMIN_ROLES), getUploadStatusController);

// GET /api/admin/code-violations/uploads/:id/violations — the review list for an upload
router.get('/uploads/:id/violations', requireRole(ADMIN_ROLES), getUploadViolationsController);

export default router;
