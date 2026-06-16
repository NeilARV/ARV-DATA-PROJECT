import { Router } from 'express';
import { requireAuth } from 'server/middleware/requireAuth';
import { requireRole } from 'server/middleware/requireRole';
import { ADMIN_ROLES, PRIVILEGED_ROLES, ALL_TEAM_ROLES } from 'server/constants/roles.constants';
import { UsersController } from 'server/controllers/users';
import { ClaimsController } from 'server/controllers/claims';

const router = Router();

// GET / — list all users (with roles and relationship managers)
router.get(
    '/',
    requireRole(ALL_TEAM_ROLES),
    UsersController.listUsersHandler,
);

// GET /relationship-managers — list all users with the relationship-manager role
router.get(
    '/relationship-managers',
    requireRole(ALL_TEAM_ROLES),
    UsersController.listRelationshipManagersHandler,
);

// GET /roles — list all roles
router.get('/roles', requireRole(ADMIN_ROLES), UsersController.listRolesHandler);

// GET /account-types — list all account type options
router.get(
    '/account-types',
    requireRole(ALL_TEAM_ROLES),
    UsersController.listAccountTypesHandler,
);

// GET /me/company-memberships — companies the authenticated user belongs to
router.get('/me/company-memberships', requireAuth, ClaimsController.getUserMembershipsHandler);

// GET /:userId/company-memberships — admin view of any user's company associations
router.get(
    '/:userId/company-memberships',
    requireRole(PRIVILEGED_ROLES),
    ClaimsController.getAdminUserMembershipsHandler,
);

// PUT /:userId/company-memberships — replace a user's company associations
router.put(
    '/:userId/company-memberships',
    requireRole(ADMIN_ROLES),
    ClaimsController.setUserCompanyMembershipsHandler,
);

// POST /:userId/roles — assign an ARV team role to a user
router.post('/:userId/roles', requireRole(ADMIN_ROLES), UsersController.assignRoleHandler);

// DELETE /:userId/roles/:role — remove an ARV team role from a user
router.delete(
    '/:userId/roles/:role',
    requireRole(ADMIN_ROLES),
    UsersController.removeRoleHandler,
);

// PATCH /:userId — update a user's subscription tier, account types, and relationship manager
router.patch('/:userId', requireRole(ADMIN_ROLES), UsersController.patchUserHandler);

// DELETE /:userId — delete a user account
router.delete('/:userId', requireRole(ADMIN_ROLES), UsersController.deleteUserHandler);

export default router;
