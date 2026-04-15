import { Router } from "express";
import { requireRole } from "server/middleware/requireRole";
import { CompaniesController } from "server/controllers/companies";

const router = Router();

// Get all companies (directory listing)
router.get("/", CompaniesController.getContactsHandler);

// Get suggestions when searching company contacts
router.get("/contacts/suggestions", CompaniesController.getCompanySuggestionsHandler);

// Get wholesale-leaderboard for grid view
router.get("/wholesale-leaderboard", CompaniesController.getWholesaleLeaderboardHandler);

// Get leaderboard (top zipcode and buyers in MSA)
router.get("/leaderboard", CompaniesController.getLeaderboardHandler);

// Get company by id
router.get("/:id", CompaniesController.getCompanyByIdHandler);

// Edit company by id
router.patch("/:id", requireRole(["admin", "owner"]), CompaniesController.updateCompanyHandler);

export default router;
