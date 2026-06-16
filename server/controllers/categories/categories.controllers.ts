import { Request, Response } from 'express';
import { CategoriesServices } from 'server/services/categories';
import { PostsServices } from 'server/services/posts';
import { categoryInputSchema } from '@database/validation/vendors.validation';
import { isUniqueViolation } from 'server/utils/dbErrors';

export async function getAllCategoriesHandler(req: Request, res: Response) {
    try {
        const result = await CategoriesServices.getAll();
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).json({ message: 'Error fetching categories' });
    }
}

export async function getVendorsByCategoryHandler(req: Request, res: Response) {
    try {
        const categoryId = parseInt(req.params.categoryId, 10);
        if (isNaN(categoryId)) {
            return res.status(400).json({ message: 'Invalid category id' });
        }
        const result = await CategoriesServices.getVendorsByCategory(categoryId);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching vendors by category:', error);
        return res.status(500).json({ message: 'Error fetching vendors by category' });
    }
}

export async function createCategoryHandler(req: Request, res: Response) {
    const parsed = categoryInputSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
        const category = await CategoriesServices.create(parsed.data);
        return res.status(201).json({ message: 'Category created', category });
    } catch (error: any) {
        if (error?.statusCode === 400) return res.status(400).json({ message: error.message });
        if (isUniqueViolation(error)) {
            return res
                .status(409)
                .json({ message: 'A category with that name or a similar name already exists' });
        }
        console.error('Error creating category:', error);
        return res.status(500).json({ message: 'Error creating category' });
    }
}

export async function updateCategoryHandler(req: Request, res: Response) {
    const categoryId = parseInt(req.params.categoryId, 10);
    if (isNaN(categoryId)) {
        return res.status(400).json({ message: 'Invalid category id' });
    }
    const parsed = categoryInputSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
        const category = await CategoriesServices.update(categoryId, parsed.data);
        return res.status(200).json({ message: 'Category updated', category });
    } catch (error: any) {
        if (error?.statusCode === 400) return res.status(400).json({ message: error.message });
        if (error?.statusCode === 404)
            return res.status(404).json({ message: 'Category not found' });
        if (isUniqueViolation(error)) {
            return res
                .status(409)
                .json({ message: 'A category with that name or a similar name already exists' });
        }
        console.error('Error updating category:', error);
        return res.status(500).json({ message: 'Error updating category' });
    }
}

export async function deleteCategoryHandler(req: Request, res: Response) {
    const categoryId = parseInt(req.params.categoryId, 10);
    if (isNaN(categoryId)) {
        return res.status(400).json({ message: 'Invalid category id' });
    }
    try {
        const result = await CategoriesServices.remove(categoryId);
        return res.status(200).json({ message: 'Category deleted', id: result.id });
    } catch (error: any) {
        if (error?.statusCode === 404)
            return res.status(404).json({ message: 'Category not found' });
        console.error('Error deleting category:', error);
        return res.status(500).json({ message: 'Error deleting category' });
    }
}

export async function getPostsByCategoryHandler(req: Request, res: Response) {
    try {
        const categoryId = parseInt(req.params.categoryId, 10);
        if (isNaN(categoryId)) {
            return res.status(400).json({ message: 'Invalid category id' });
        }
        const page = req.query.page ? parseInt(req.query.page.toString(), 10) : undefined;
        const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : undefined;
        const result = await PostsServices.getPosts({ categoryId, page, limit });
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching posts by category:', error);
        return res.status(500).json({ message: 'Error fetching posts by category' });
    }
}
