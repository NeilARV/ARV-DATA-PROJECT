import { Request, Response } from "express";
import { CategoriesServices } from "server/services/categories";

export async function getAllCategoriesHandler(req: Request, res: Response) {
    try {
        const result = await CategoriesServices.getAll();
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching categories:", error);
        return res.status(500).json({ message: "Error fetching categories" });
    }
}

export async function getVendorsByCategoryHandler(req: Request, res: Response) {
    try {
        const categoryId = parseInt(req.params.id, 10);
        if (isNaN(categoryId)) {
            return res.status(400).json({ message: "Invalid category id" });
        }
        const result = await CategoriesServices.getVendorsByCategory(categoryId);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching vendors by category:", error);
        return res.status(500).json({ message: "Error fetching vendors by category" });
    }
}
