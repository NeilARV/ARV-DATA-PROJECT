import { Router } from 'express';
import { requireRole } from 'server/middleware/requireRole';
import { ADMIN_ROLES } from 'server/constants/roles.constants';
import { CategoriesController } from 'server/controllers/categories';

const router = Router();

const adminOrOwner = requireRole(ADMIN_ROLES);

// Public reads
router.get('/', CategoriesController.getAllCategoriesHandler);
router.get('/:categoryId/vendors', CategoriesController.getVendorsByCategoryHandler);
router.get('/:categoryId/posts', CategoriesController.getPostsByCategoryHandler);

// Admin / owner writes
router.post('/', adminOrOwner, CategoriesController.createCategoryHandler);
router.put('/:categoryId', adminOrOwner, CategoriesController.updateCategoryHandler);
router.delete('/:categoryId', adminOrOwner, CategoriesController.deleteCategoryHandler);

export default router;
