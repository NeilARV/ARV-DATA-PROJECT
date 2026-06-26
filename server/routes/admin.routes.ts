import { Router } from 'express';
import { requireRole } from 'server/middleware/requireRole';
import { PRIVILEGED_ROLES } from 'server/constants/roles.constants';
import { AdminController } from 'server/controllers/admin';
import codeViolationsRoutes from './codeViolations.routes';

const router = Router();

// Code-violation alerts admin surface — /api/admin/code-violations/* (admin/owner only)
router.use('/code-violations', codeViolationsRoutes);

// Check if user is admin
router.get('/status', AdminController.checkAdminStatus);

// Return all data from email whitelist (email, msa subscription, relationship manager)
router.get('/whitelist', requireRole(PRIVILEGED_ROLES), AdminController.listWhitelist);

// Delete a user by id from email whitelist
router.delete(
    '/whitelist/:id',
    requireRole(PRIVILEGED_ROLES),
    AdminController.removeWhitelistEntry,
);

// Edit an email whitelist object (can edit email, msa subscription and relationship manager)
router.patch(
    '/whitelist/:id',
    requireRole(PRIVILEGED_ROLES),
    AdminController.patchWhitelistEntry,
);

// Add a new email to email whitelist
router.post('/whitelist', requireRole(PRIVILEGED_ROLES), AdminController.createWhitelistEntry);

export default router;
