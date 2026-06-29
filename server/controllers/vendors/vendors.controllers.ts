import type { Request, Response } from 'express';
import type { MulterRequest } from 'server/middleware/multerTypes';
import { VendorsServices } from 'server/services/vendors';
import { vendorInputSchema, updateVendorSchema } from '@database/validation/vendors.validation';
import { getErrorStatusCode } from 'server/utils/dbErrors';

export async function getAllVendorsHandler(req: Request, res: Response): Promise<void> {
    try {
        let categoryIds: number[] | undefined;
        if (typeof req.query.categoryIds === 'string') {
            categoryIds = req.query.categoryIds
                .split(',')
                .map((n) => parseInt(n, 10))
                .filter((n) => !isNaN(n));
            if (categoryIds.length === 0) {
                res.status(400).json({ message: 'Invalid categoryIds' });
                return;
            }
        }
        const result = await VendorsServices.getAll(categoryIds);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching vendors:', error);
        res.status(500).json({ message: 'Error fetching vendors' });
    }
}

export async function getVendorByIdHandler(req: Request, res: Response): Promise<void> {
    try {
        const result = await VendorsServices.getById(req.params.vendorId);
        if (!result) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching vendor:', error);
        res.status(500).json({ message: 'Error fetching vendor' });
    }
}

// ── POST /api/vendors ──────────────────────────────────────────────────────────
export async function createVendorHandler(req: Request, res: Response): Promise<void> {
    const parsed = vendorInputSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0].message });
        return;
    }
    try {
        const vendor = await VendorsServices.create(parsed.data);
        res.status(201).json({ message: 'Vendor created', vendor });
    } catch (error) {
        console.error('Error creating vendor:', error);
        res.status(500).json({ message: 'Error creating vendor' });
    }
}

// ── PUT /api/vendors/:vendorId ─────────────────────────────────────────────────
export async function updateVendorHandler(req: Request, res: Response): Promise<void> {
    const parsed = updateVendorSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0].message });
        return;
    }
    try {
        const vendor = await VendorsServices.update(req.params.vendorId, parsed.data);
        res.status(200).json({ message: 'Vendor updated', vendor });
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        console.error('Error updating vendor:', error);
        res.status(500).json({ message: 'Error updating vendor' });
    }
}

// ── GET /api/vendors/recommended ──────────────────────────────────────────────
export async function getRecommendedVendorsHandler(req: Request, res: Response): Promise<void> {
    try {
        const result = await VendorsServices.getRecommended();
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching recommended vendors:', error);
        res.status(500).json({ message: 'Error fetching recommended vendors' });
    }
}

// ── PUT /api/vendors/:vendorId/recommend ───────────────────────────────────────
export async function toggleRecommendHandler(req: Request, res: Response): Promise<void> {
    try {
        const result = await VendorsServices.toggleRecommend(req.params.vendorId);
        res.status(200).json(result);
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        console.error('Error toggling vendor recommendation:', error);
        res.status(500).json({ message: 'Error toggling vendor recommendation' });
    }
}

// ── DELETE /api/vendors/:vendorId ──────────────────────────────────────────────
export async function deleteVendorHandler(req: Request, res: Response): Promise<void> {
    try {
        const result = await VendorsServices.remove(req.params.vendorId);
        res.status(200).json({ message: 'Vendor deleted', id: result.id });
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        console.error('Error deleting vendor:', error);
        res.status(500).json({ message: 'Error deleting vendor' });
    }
}

// ── POST /api/vendors/:vendorId/logo ───────────────────────────────────────────
export async function uploadVendorLogoHandler(req: MulterRequest, res: Response): Promise<void> {
    if (!req.file) {
        res.status(400).json({ message: 'No file provided' });
        return;
    }
    try {
        const result = await VendorsServices.uploadImage(
            req.params.vendorId,
            'logo',
            req.file.buffer,
            req.file.mimetype,
        );
        res.status(200).json({ message: 'Logo uploaded', logoUrl: result.logoUrl });
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        console.error('Error uploading vendor logo:', error);
        res.status(500).json({ message: 'Error uploading logo' });
    }
}

// ── DELETE /api/vendors/:vendorId/logo ─────────────────────────────────────────
export async function removeVendorLogoHandler(req: Request, res: Response): Promise<void> {
    try {
        await VendorsServices.removeImage(req.params.vendorId, 'logo');
        res.status(200).json({ message: 'Logo removed' });
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        console.error('Error removing vendor logo:', error);
        res.status(500).json({ message: 'Error removing logo' });
    }
}

// ── POST /api/vendors/:vendorId/header ─────────────────────────────────────────
export async function uploadVendorHeaderHandler(req: MulterRequest, res: Response): Promise<void> {
    if (!req.file) {
        res.status(400).json({ message: 'No file provided' });
        return;
    }
    try {
        const result = await VendorsServices.uploadImage(
            req.params.vendorId,
            'header',
            req.file.buffer,
            req.file.mimetype,
        );
        res.status(200).json({ message: 'Header uploaded', headerUrl: result.headerUrl });
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        console.error('Error uploading vendor header:', error);
        res.status(500).json({ message: 'Error uploading header' });
    }
}

// ── DELETE /api/vendors/:vendorId/header ───────────────────────────────────────
export async function removeVendorHeaderHandler(req: Request, res: Response): Promise<void> {
    try {
        await VendorsServices.removeImage(req.params.vendorId, 'header');
        res.status(200).json({ message: 'Header removed' });
    } catch (error) {
        if (getErrorStatusCode(error) === 404) {
            res.status(404).json({ message: 'Vendor not found' });
            return;
        }
        console.error('Error removing vendor header:', error);
        res.status(500).json({ message: 'Error removing header' });
    }
}
