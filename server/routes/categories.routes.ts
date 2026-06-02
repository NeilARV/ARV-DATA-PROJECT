import { Router } from 'express';
import { CategoriesController } from 'server/controllers/categories';

const router = Router();

// Get all categories (feeds the left panel category cards)
router.get('/', CategoriesController.getAllCategoriesHandler);

// Get all vendors belonging to a category
router.get('/:categoryId/vendors', CategoriesController.getVendorsByCategoryHandler);

// Get all posts tagged with a category
router.get('/:categoryId/posts', CategoriesController.getPostsByCategoryHandler);

export default router;
