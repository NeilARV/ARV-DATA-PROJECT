import { Router } from 'express';
import { requireRole } from 'server/middleware/requireRole';
import { ADMIN_ROLES } from 'server/constants/roles.constants';
import { CompaniesController } from 'server/controllers/companies';

const router = Router();

// Get all companies (directory listing)
router.get('/', CompaniesController.getContactsHandler);

// Get suggestions when searching company contacts
router.get('/contacts/suggestions', CompaniesController.getCompanySuggestionsHandler);

// Get wholesale-leaderboard for grid view
router.get('/wholesale-leaderboard', CompaniesController.getWholesaleLeaderboardHandler);

// Get leaderboard (top zipcode and buyers in MSA)
router.get('/leaderboard', CompaniesController.getLeaderboardHandler);

// Public groups directory (Data-app Groups tab). Registered before /:id so the literal segment
// wins; the admin group-mutation router (/api/groups) is separate and untouched.
router.get('/groups', CompaniesController.getGroupDirectoryHandler);

// One group's directory row (deep-link validation for ?group= URLs); 404 when stale/invisible.
router.get('/groups/:id', CompaniesController.getGroupDirectoryRowHandler);

// Get company by id
router.get('/:id', CompaniesController.getCompanyByIdHandler);

// Edit company by id
router.patch('/:id', requireRole(ADMIN_ROLES), CompaniesController.updateCompanyHandler);

// Company contacts
router.post('/:id/contacts', requireRole(ADMIN_ROLES), CompaniesController.addContactHandler);
router.patch(
    '/:id/contacts/:contactId',
    requireRole(ADMIN_ROLES),
    CompaniesController.updateContactHandler,
);
router.delete(
    '/:id/contacts/:contactId',
    requireRole(ADMIN_ROLES),
    CompaniesController.deleteContactHandler,
);

// Enrich company data from OpenCorporates
router.post('/:id/enrich', requireRole(ADMIN_ROLES), CompaniesController.enrichCompanyHandler);

export default router;
