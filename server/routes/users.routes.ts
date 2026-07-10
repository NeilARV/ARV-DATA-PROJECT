import { Router } from 'express';
import { requireAuth } from 'server/middleware/requireAuth';
import { requireRole } from 'server/middleware/requireRole';
import { ADMIN_ROLES, PRIVILEGED_ROLES, ALL_TEAM_ROLES } from 'server/constants/roles.constants';
import { UsersController } from 'server/controllers/users';

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

// GET /me/company-memberships — companies the authenticated user reaches through their group(s)
router.get('/me/company-memberships', requireAuth, UsersController.getMyGroupCompaniesHandler);

// GET /:userId/groups — admin view of the groups a user belongs to
router.get(
    '/:userId/groups',
    requireRole(PRIVILEGED_ROLES),
    UsersController.getUserGroupsHandler,
);

// PUT /:userId/groups — replace a user's group memberships
router.put('/:userId/groups', requireRole(ADMIN_ROLES), UsersController.setUserGroupsHandler);

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
