import { Request, Response } from "express";
import { VendorsServices } from "server/services/vendors";

export async function getAllVendorsHandler(req: Request, res: Response) {
    try {
        const categoryId = req.query.categoryId ? parseInt(req.query.categoryId.toString(), 10) : undefined;
        if (req.query.categoryId !== undefined && isNaN(categoryId!)) {
            return res.status(400).json({ message: "Invalid categoryId" });
        }
        const result = await VendorsServices.getAll(categoryId);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching vendors:", error);
        return res.status(500).json({ message: "Error fetching vendors" });
    }
}

export async function getVendorByIdHandler(req: Request, res: Response) {
    try {
        const result = await VendorsServices.getById(req.params.id);
        if (!result) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching vendor:", error);
        return res.status(500).json({ message: "Error fetching vendor" });
    }
}
