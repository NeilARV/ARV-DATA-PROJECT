import { Router } from 'express';
import { requireRole } from 'server/middleware/requireRole';
import { ADMIN_ROLES } from 'server/constants/roles.constants';
import { GroupsController } from 'server/controllers/groups';

const router = Router();

// Admin + owner only (not relationship-managers/members) — see access-control.md §5.3b.
// requireRole emits 401 for no session and 403 for a wrong role, so no separate requireAuth.
const requireAdmin = requireRole(ADMIN_ROLES);

// Auto-singleton: add a member to a company, creating its singleton group if ungrouped. Declared
// before the /:id routes — its 3-segment shape (/companies/:companyId/members) can't collide with them.
router.post(
    '/companies/:companyId/members',
    requireAdmin,
    GroupsController.addMemberToCompanyController,
);

// CRUD
router.post('/', requireAdmin, GroupsController.createGroupController);
router.patch('/:id', requireAdmin, GroupsController.updateGroupController);
router.delete('/:id', requireAdmin, GroupsController.disbandGroupController);

// Merge source group :id (A) into the target group in the body (B), then delete A.
router.post('/:id/merge', requireAdmin, GroupsController.mergeGroupController);

// Companies in a group
router.post('/:id/companies', requireAdmin, GroupsController.addCompanyController);
router.delete('/:id/companies/:companyId', requireAdmin, GroupsController.removeCompanyController);

// Members of a group
router.post('/:id/members', requireAdmin, GroupsController.addMemberController);
router.delete('/:id/members/:userId', requireAdmin, GroupsController.removeMemberController);
router.patch('/:id/members/:userId', requireAdmin, GroupsController.setMemberRoleController);

export default router;
