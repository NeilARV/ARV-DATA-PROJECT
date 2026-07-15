import { Request, Response } from 'express';
import { MapServices } from 'server/services/properties';
import { mapQuerySchema, type MapQuery } from '@database/validation/maps.validation';
import type { MapBounds } from 'server/services/properties/maps.services';

/** Maps a validated query into the shared map filters (county/status/date/company/location/attrs). */
function toMapFilters(q: MapQuery) {
    return {
        county: q.county,
        msa: q.msa,
        statusFilter: q.status,
        dateRange: q.dateRange,
        companyId: q.companyId,
        companyRole: q.companyRole,
        zipcode: q.zipcode,
        city: q.city,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
        bedrooms: q.bedrooms,
        bathrooms: q.bathrooms,
        propertyTypes: q.propertyType,
    };
}

/** The viewport box from a validated query, or null when no edges were supplied (all-or-nothing). */
function toBounds(q: MapQuery): MapBounds | null {
    if (
        q.south === undefined ||
        q.west === undefined ||
        q.north === undefined ||
        q.east === undefined
    ) {
        return null;
    }
    return { south: q.south, west: q.west, north: q.north, east: q.east };
}

/**
 * GET /api/properties/map — property data for map pins, restricted to the viewport box when
 * south/west/north/east query params are supplied.
 */
export async function getMapData(req: Request, res: Response): Promise<void> {
    try {
        const parsed = mapQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid map query', errors: parsed.error.errors });
            return;
        }

        const results = await MapServices.getMapProperties({
            ...toMapFilters(parsed.data),
            bounds: toBounds(parsed.data) ?? undefined,
        });

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching properties map pins:', error);
        res.status(500).json({ message: 'Error fetching properties map pins' });
    }
}

/**
 * GET /api/properties/map/extent — bounding box + count of the qualifying set for the current
 * filters/company, used to center and zoom the map without loading every pin.
 */
export async function getMapExtent(req: Request, res: Response): Promise<void> {
    try {
        const parsed = mapQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid map query', errors: parsed.error.errors });
            return;
        }

        const extent = await MapServices.getMapExtent(toMapFilters(parsed.data));
        res.status(200).json(extent);
    } catch (error) {
        console.error('Error fetching map extent:', error);
        res.status(500).json({ message: 'Error fetching map extent' });
    }
}

/**
 * GET /api/properties/map/regions — property counts grouped by county for the national overview
 * layer (respects status/date + property attributes; ignores county/company/location so every
 * region is shown).
 */
export async function getRegionCounts(req: Request, res: Response): Promise<void> {
    try {
        const parsed = mapQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid map query', errors: parsed.error.errors });
            return;
        }

        const { statusFilter, dateRange, minPrice, maxPrice, bedrooms, bathrooms, propertyTypes } =
            toMapFilters(parsed.data);
        const regions = await MapServices.getRegionCounts({
            statusFilter,
            dateRange,
            minPrice,
            maxPrice,
            bedrooms,
            bathrooms,
            propertyTypes,
        });
        res.status(200).json(regions);
    } catch (error) {
        console.error('Error fetching region counts:', error);
        res.status(500).json({ message: 'Error fetching region counts' });
    }
}
