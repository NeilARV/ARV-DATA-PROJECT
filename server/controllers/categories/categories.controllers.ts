import type { Request, Response } from 'express';
import { CategoriesServices } from 'server/services/categories';
import { PostsServices } from 'server/services/posts';
import { VendorsServices } from 'server/services/vendors';
import { categoryInputSchema } from '@database/validation/vendors.validation';
import { getErrorStatusCode, isUniqueViolation } from 'server/utils/dbErrors';

export async function getAllCategoriesHandler(req: Request, res: Response): Promise<void> {
    try {
        const result = await CategoriesServices.getAll();
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Error fetching categories' });
    }
}

export async function getVendorsByCategoryHandler(req: Request, res: Response): Promise<void> {
    try {
        const categoryId = parseInt(req.params.categoryId, 10);
        if (isNaN(categoryId)) {
            res.status(400).json({ message: 'Invalid category id' });
            return;
        }
        // Delegate to the vendors service so the response matches GET /api/vendors, per api.md
        const result = await VendorsServices.getAll([categoryId]);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching vendors by category:', error);
        res.status(500).json({ message: 'Error fetching vendors by category' });
    }
}

export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
    const parsed = categoryInputSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0].message });
        return;
    }
    try {
        const category = await CategoriesServices.create(parsed.data);
        res.status(201).json({ message: 'Category created', category });
    } catch (error) {
        if (getErrorStatusCode(error) === 400 && error instanceof Error) {
            res.status(400).json({ message: error.message });
            return;
        }
        if (isUniqueViolation(error)) {
            res.status(409).json({
                message: 'A category with that name or a similar name already exists',
            });
            return;
        }
        console.error('Error creating category:', error);
        res.status(500).json({ message: 'Error creating category' });
    }
}

export async function updateCategoryHandler(req: Request, res: Response): Promise<void> {
    const categoryId = parseInt(req.params.categoryId, 10);
    if (isNaN(categoryId)) {
        res.status(400).json({ message: 'Invalid category id' });
        return;
    }
    const parsed = categoryInputSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0].message });
        return;
    }
    try {
        const category = await CategoriesServices.update(categoryId, parsed.data);
        res.status(200).json({ message: 'Category updated', category });
    } catch (error) {
        if (getErrorStatusCode(error) === 400 && error instanceof Error) {
            res.status(400).json({ message: error.message });
            return;
        }
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Category not found' });
            return;
        }
        if (isUniqueViolation(error)) {
            res.status(409).json({
                message: 'A category with that name or a similar name already exists',
            });
            return;
        }
        console.error('Error updating category:', error);
        res.status(500).json({ message: 'Error updating category' });
    }
}

export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
    const categoryId = parseInt(req.params.categoryId, 10);
    if (isNaN(categoryId)) {
        res.status(400).json({ message: 'Invalid category id' });
        return;
    }
    try {
        const result = await CategoriesServices.remove(categoryId);
        res.status(200).json({ message: 'Category deleted', id: result.id });
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Category not found' });
            return;
        }
        console.error('Error deleting category:', error);
        res.status(500).json({ message: 'Error deleting category' });
    }
}

export async function getPostsByCategoryHandler(req: Request, res: Response): Promise<void> {
    try {
        const categoryId = parseInt(req.params.categoryId, 10);
        if (isNaN(categoryId)) {
            res.status(400).json({ message: 'Invalid category id' });
            return;
        }
        const page = req.query.page ? parseInt(req.query.page.toString(), 10) : undefined;
        const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : undefined;
        const result = await PostsServices.getPosts({ categoryId, page, limit });
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching posts by category:', error);
        res.status(500).json({ message: 'Error fetching posts by category' });
    }
}
