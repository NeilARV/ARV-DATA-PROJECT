import { Router } from "express";
import { CategoriesController } from "server/controllers/categories";

const router = Router();

// Get all categories (feeds the left panel category cards)
router.get("/", CategoriesController.getAllCategoriesHandler);

// Get all vendors belonging to a category
router.get("/:id/vendors", CategoriesController.getVendorsByCategoryHandler);

export default router;
