import { Router } from 'express';
import { requireAuth } from 'server/middleware/requireAuth';
import { requireRole } from 'server/middleware/requireRole';
import { CompaniesController } from 'server/controllers/companies';
import { ClaimsController } from 'server/controllers/claims';

const router = Router();

// Get all companies (directory listing)
router.get('/', CompaniesController.getContactsHandler);

// Get suggestions when searching company contacts
router.get('/contacts/suggestions', CompaniesController.getCompanySuggestionsHandler);

// Get wholesale-leaderboard for grid view
router.get('/wholesale-leaderboard', CompaniesController.getWholesaleLeaderboardHandler);

// Get leaderboard (top zipcode and buyers in MSA)
router.get('/leaderboard', CompaniesController.getLeaderboardHandler);

// Get company by id
router.get('/:id', CompaniesController.getCompanyByIdHandler);

// Edit company by id
router.patch('/:id', requireRole(['admin', 'owner']), CompaniesController.updateCompanyHandler);

// Company contacts
router.post(
    '/:id/contacts',
    requireRole(['admin', 'owner']),
    CompaniesController.addContactHandler,
);
router.patch(
    '/:id/contacts/:contactId',
    requireRole(['admin', 'owner']),
    CompaniesController.updateContactHandler,
);
router.delete(
    '/:id/contacts/:contactId',
    requireRole(['admin', 'owner']),
    CompaniesController.deleteContactHandler,
);

// Enrich company data from OpenCorporates
router.post(
    '/:id/enrich',
    requireRole(['admin', 'owner']),
    CompaniesController.enrichCompanyHandler,
);

// Submit a claim for a company (any authenticated user)
router.post('/:id/claim', requireAuth, ClaimsController.submitClaimHandler);

// Get members for a company (any authenticated user)
router.get('/:id/members', requireAuth, ClaimsController.getCompanyMembersHandler);

export default router;
