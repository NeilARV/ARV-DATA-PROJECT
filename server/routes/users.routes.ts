import { Router } from "express";
import { requireRole } from "server/middleware/requireRole";
import { UsersController } from "server/controllers/users";

const router = Router();

// GET / — list all users (with roles and relationship managers)
router.get("/", requireRole(["admin", "owner", "relationship-manager", "member"]), UsersController.listUsersHandler);

// GET /relationship-managers — list all users with the relationship-manager role
router.get("/relationship-managers", requireRole(["admin", "owner", "relationship-manager", "member"]), UsersController.listRelationshipManagersHandler);

// GET /roles — list all roles
router.get("/roles", requireRole(["admin", "owner"]), UsersController.listRolesHandler);

// POST /:userId/relationship-managers — assign a relationship manager to a user
router.post("/:userId/relationship-managers", requireRole(["admin", "owner", "relationship-manager"]), UsersController.assignRelationshipManagerHandler);

// DELETE /:userId/relationship-managers/:relationshipManagerId — remove a relationship manager from a user
router.delete("/:userId/relationship-managers/:relationshipManagerId", requireRole(["admin", "owner", "relationship-manager"]), UsersController.removeRelationshipManagerHandler);

// POST /:userId/roles — assign an ARV team role to a user
router.post("/:userId/roles", requireRole(["admin", "owner"]), UsersController.assignRoleHandler);

// DELETE /:userId/roles/:role — remove an ARV team role from a user
router.delete("/:userId/roles/:role", requireRole(["admin", "owner"]), UsersController.removeRoleHandler);

// POST /:userId/subscription-tier — assign a tier role (fails 409 if user already has one)
router.post("/:userId/subscription-tier", requireRole(["admin", "owner", "relationship-manager"]), UsersController.assignUserTierRoleHandler);

// PATCH /:userId/subscription-tier — update/change tier role
router.patch("/:userId/subscription-tier", requireRole(["admin", "owner", "relationship-manager"]), UsersController.updateUserTierRoleHandler);

// DELETE /:userId/subscription-tier — remove tier role
router.delete("/:userId/subscription-tier", requireRole(["admin", "owner", "relationship-manager"]), UsersController.removeUserTierRoleHandler);

// DELETE /:userId — delete a user account
router.delete("/:userId", requireRole(["admin", "owner"]), UsersController.deleteUserHandler);

export default router;
