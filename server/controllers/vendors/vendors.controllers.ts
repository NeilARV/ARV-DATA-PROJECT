import { Request, Response } from "express";
import { VendorsServices } from "server/services/vendors";

export async function getAllVendorsHandler(req: Request, res: Response) {
    try {
        let categoryIds: number[] | undefined;
        if (req.query.categoryIds) {
            categoryIds = (req.query.categoryIds as string)
                .split(",")
                .map((n) => parseInt(n, 10))
                .filter((n) => !isNaN(n));
            if (categoryIds.length === 0) {
                return res.status(400).json({ message: "Invalid categoryIds" });
            }
        }
        const result = await VendorsServices.getAll(categoryIds);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching vendors:", error);
        return res.status(500).json({ message: "Error fetching vendors" });
    }
}

export async function getVendorByIdHandler(req: Request, res: Response) {
    try {
        const result = await VendorsServices.getById(req.params.vendorId);
        if (!result) {
            return res.status(404).json({ message: "Vendor not found" });
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching vendor:", error);
        return res.status(500).json({ message: "Error fetching vendor" });
    }
}
