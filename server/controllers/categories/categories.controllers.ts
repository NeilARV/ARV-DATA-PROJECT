import { Request, Response } from 'express';
import { CategoriesServices } from 'server/services/categories';
import { PostsServices } from 'server/services/posts';

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
