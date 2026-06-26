import { Request, Response } from 'express';
import { MapServices } from 'server/services/properties';
import type { MapBounds } from 'server/services/properties/maps.services';

/** Reads the shared map filters (county/status/date/company) from the query string. */
function parseMapFilters(req: Request) {
    const { county, status, dateRange, companyId, companyRole, zipcode, city } = req.query;
    return {
        county: county ? county.toString() : undefined,
        statusFilter: status
            ? Array.isArray(status)
                ? status.map((s) => s.toString())
                : status.toString()
            : undefined,
        dateRange: dateRange ? dateRange.toString() : undefined,
        companyId: companyId ? companyId.toString() : undefined,
        companyRole: companyRole ? companyRole.toString() : undefined,
        zipcode: zipcode ? zipcode.toString() : undefined,
        city: city ? city.toString() : undefined,
    };
}

/**
 * Parses the optional viewport box from the query string.
 * @returns the bounds when all four edges are present + finite, null when none are provided.
 * @throws Error when the box is partially specified or non-numeric (caller maps to a 400).
 */
function parseBounds(req: Request): MapBounds | null {
    const { south, west, north, east } = req.query;
    const raw = [south, west, north, east];
    const provided = raw.filter((v) => v !== undefined);
    if (provided.length === 0) return null;
    if (provided.length !== 4) throw new Error('Incomplete map bounds');

    const [s, w, n, e] = raw.map((v) => Number(v));
    if (![s, w, n, e].every(Number.isFinite)) throw new Error('Invalid map bounds');

    return { south: s, west: w, north: n, east: e };
}

/**
 * GET /api/properties/map — property data for map pins, restricted to the viewport box when
 * south/west/north/east query params are supplied.
 */
export async function getMapData(req: Request, res: Response): Promise<void> {
    try {
        let bounds: MapBounds | null;
        try {
            bounds = parseBounds(req);
        } catch {
            res.status(400).json({ message: 'Invalid map bounds — provide south, west, north, east' });
            return;
        }

        const results = await MapServices.getMapProperties({
            ...parseMapFilters(req),
            bounds: bounds ?? undefined,
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
        const extent = await MapServices.getMapExtent(parseMapFilters(req));
        res.status(200).json(extent);
    } catch (error) {
        console.error('Error fetching map extent:', error);
        res.status(500).json({ message: 'Error fetching map extent' });
    }
}
