import { Request, Response } from 'express';
import { patchPropertySchema } from '@database/updates/properties.update';
import {
    createProperty,
    deleteProperty,
    getPropertyById,
    getPropertySuggestions,
    patchProperty,
} from 'server/services/properties/property.services';

export async function getProperty(req: Request, res: Response) {
    try {
        const property = await getPropertyById(req.params.id);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        return res.status(200).json(property);
    } catch (error) {
        console.error('Error fetching property:', error);
        return res.status(500).json({ message: 'Error fetching property' });
    }
}

export async function removeProperty(req: Request, res: Response) {
    try {
        const { id } = req.params;
        console.log(`[DELETE] Attempting to delete property ID: ${id}`);
        const deleted = await deleteProperty(id);
        if (!deleted) {
            console.warn(`[DELETE] Property not found: ${id}`);
            return res.status(404).json({ message: 'Property not found' });
        }
        console.log(
            `[DELETE] Successfully deleted property: ${id} (SFR Property ID: ${deleted.sfrPropertyId})`,
        );
        return res.json({
            message: 'Property deleted successfully',
            id: deleted.id,
            sfrPropertyId: deleted.sfrPropertyId,
        });
    } catch (error) {
        console.error('[DELETE ERROR]', error);
        return res.status(500).json({
            message: `Error deleting property: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
    }
}

export async function postProperty(req: Request, res: Response) {
    try {
        console.log('POST /api/properties - Raw request body:', JSON.stringify(req.body, null, 2));

        const { address, city, state, zipCode } = req.body;
        if (!address || !city || !state || !zipCode) {
            return res.status(400).json({
                message: 'Missing required fields',
                errors: [{ path: [], message: 'address, city, state, and zipCode are required' }],
            });
        }

        const result = await createProperty({ address, city, state, zipCode });

        switch (result.status) {
            case 'missing-config':
                return res
                    .status(500)
                    .json({
                        message: 'SFR API not configured',
                        error: 'SFR_API_KEY and SFR_API_URL must be set',
                    });
            case 'sfr-error':
                return res
                    .status(result.httpStatus)
                    .json({
                        message: 'Failed to fetch property from SFR API',
                        error: result.error,
                    });
            case 'not-found':
                return res
                    .status(404)
                    .json({
                        message: 'Property not found in SFR API',
                        error: 'No property data returned',
                    });
            case 'updated':
                return res.json({
                    message: 'Property updated successfully',
                    id: result.id,
                    sfrPropertyId: result.sfrPropertyId,
                });
            case 'created':
                return res.json({
                    message: 'Property created successfully',
                    id: result.id,
                    sfrPropertyId: result.sfrPropertyId,
                });
        }
    } catch (error) {
        console.error('Error creating property:', error);
        return res.status(500).json({
            message: 'Error creating property',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export async function getPropertySuggestionsHandler(req: Request, res: Response) {
    try {
        const { search, county } = req.query;
        if (!search || search.toString().trim().length < 2) {
            return res.status(200).json([]);
        }
        const results = await getPropertySuggestions(search.toString(), county?.toString());
        return res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching property suggestions:', error);
        return res.status(500).json({ message: 'Error fetching property suggestions' });
    }
}

export async function patchPropertyHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const validation = patchPropertySchema.safeParse(req.body);
        if (!validation.success) {
            return res
                .status(400)
                .json({ message: 'Invalid update data', errors: validation.error.errors });
        }
        const updated = await patchProperty(id, validation.data);
        if (!updated) {
            return res.status(404).json({ message: 'Property not found' });
        }
        return res
            .status(200)
            .json({
                message: 'Property updated',
                id: updated.id,
                isArvFunded: updated.isArvFunded,
                statuses: updated.statuses,
            });
    } catch (error) {
        console.error('Error updating property:', error);
        return res.status(500).json({ message: 'Error updating property' });
    }
}
