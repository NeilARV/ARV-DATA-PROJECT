import { Request, Response } from "express";
import { VendorsServices } from "server/services/vendors";
import { vendorInputSchema, updateVendorSchema } from "@database/validation/vendors.validation";

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

// ── POST /api/vendors ──────────────────────────────────────────────────────────
export async function createVendorHandler(req: Request, res: Response) {
    const parsed = vendorInputSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
        const vendor = await VendorsServices.create(parsed.data);
        return res.status(201).json({ message: "Vendor created", vendor });
    } catch (error) {
        console.error("Error creating vendor:", error);
        return res.status(500).json({ message: "Error creating vendor" });
    }
}

// ── PUT /api/vendors/:vendorId ─────────────────────────────────────────────────
export async function updateVendorHandler(req: Request, res: Response) {
    const parsed = updateVendorSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
        const vendor = await VendorsServices.update(req.params.vendorId, parsed.data);
        return res.status(200).json({ message: "Vendor updated", vendor });
    } catch (error: any) {
        if (error?.statusCode === 404) return res.status(404).json({ message: "Vendor not found" });
        console.error("Error updating vendor:", error);
        return res.status(500).json({ message: "Error updating vendor" });
    }
}

// ── GET /api/vendors/recommended ──────────────────────────────────────────────
export async function getRecommendedVendorsHandler(req: Request, res: Response) {
    try {
        const result = await VendorsServices.getRecommended();
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching recommended vendors:", error);
        return res.status(500).json({ message: "Error fetching recommended vendors" });
    }
}

// ── PUT /api/vendors/:vendorId/recommend ───────────────────────────────────────
export async function toggleRecommendHandler(req: Request, res: Response) {
    try {
        const result = await VendorsServices.toggleRecommend(req.params.vendorId);
        return res.status(200).json(result);
    } catch (error: any) {
        if (error?.statusCode === 404) return res.status(404).json({ message: "Vendor not found" });
        console.error("Error toggling vendor recommendation:", error);
        return res.status(500).json({ message: "Error toggling vendor recommendation" });
    }
}

// ── DELETE /api/vendors/:vendorId ──────────────────────────────────────────────
export async function deleteVendorHandler(req: Request, res: Response) {
    try {
        const result = await VendorsServices.remove(req.params.vendorId);
        return res.status(200).json({ message: "Vendor deleted", id: result.id });
    } catch (error: any) {
        if (error?.statusCode === 404) return res.status(404).json({ message: "Vendor not found" });
        console.error("Error deleting vendor:", error);
        return res.status(500).json({ message: "Error deleting vendor" });
    }
}
