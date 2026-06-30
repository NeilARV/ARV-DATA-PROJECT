import { Router } from 'express';
import multer from 'multer';
import { requireRole } from 'server/middleware/requireRole';
import { handleUploadError } from 'server/middleware/uploadErrorHandler';
import { ADMIN_ROLES } from 'server/constants/roles.constants';
import { CodeViolationsController } from 'server/controllers/code-violations';

const router = Router();

// The Accela export is capped around ~500 KB (typically ~480 KB); 2 MB is generous headroom.
const MAX_CSV_BYTES = 2 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_CSV_BYTES },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
});

// Admin + owner only (not relationship-managers/members) — see access-control.md.
router.post(
    '/uploads',
    requireRole(ADMIN_ROLES),
    upload.single('file'),
    handleUploadError,
    CodeViolationsController.uploadCodeViolationCsv,
);
router.get('/uploads', requireRole(ADMIN_ROLES), CodeViolationsController.listCodeViolationUploads);
router.get(
    '/uploads/:id',
    requireRole(ADMIN_ROLES),
    CodeViolationsController.getCodeViolationUpload,
);
router.post(
    '/uploads/:id/approve',
    requireRole(ADMIN_ROLES),
    CodeViolationsController.approveCodeViolationUpload,
);

export default router;
