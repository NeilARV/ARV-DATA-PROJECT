import { Router } from 'express';
import { requireAuth } from 'server/middleware/requireAuth';
import { requireRole } from 'server/middleware/requireRole';
import { UsersController } from 'server/controllers/users';
import { ClaimsController } from 'server/controllers/claims';

const router = Router();

// GET / — list all users (with roles and relationship managers)
router.get(
    '/',
    requireRole(['admin', 'owner', 'relationship-manager', 'member']),
    UsersController.listUsersHandler,
);

// GET /relationship-managers — list all users with the relationship-manager role
router.get(
    '/relationship-managers',
    requireRole(['admin', 'owner', 'relationship-manager', 'member']),
    UsersController.listRelationshipManagersHandler,
);

// GET /roles — list all roles
router.get('/roles', requireRole(['admin', 'owner']), UsersController.listRolesHandler);

// GET /account-types — list all account type options
router.get(
    '/account-types',
    requireRole(['admin', 'owner', 'relationship-manager', 'member']),
    UsersController.listAccountTypesHandler,
);

// GET /me/company-memberships — companies the authenticated user belongs to
router.get('/me/company-memberships', requireAuth, ClaimsController.getUserMembershipsHandler);

// POST /:userId/roles — assign an ARV team role to a user
router.post('/:userId/roles', requireRole(['admin', 'owner']), UsersController.assignRoleHandler);

// DELETE /:userId/roles/:role — remove an ARV team role from a user
router.delete(
    '/:userId/roles/:role',
    requireRole(['admin', 'owner']),
    UsersController.removeRoleHandler,
);

// PATCH /:userId — update a user's subscription tier, account types, and relationship manager
router.patch('/:userId', requireRole(['admin', 'owner']), UsersController.patchUserHandler);

// DELETE /:userId — delete a user account
router.delete('/:userId', requireRole(['admin', 'owner']), UsersController.deleteUserHandler);

export default router;
