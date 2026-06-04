import { Request, Response, NextFunction } from 'express';
import { MapServices } from 'server/services/properties';

export async function getMapData(req: Request, res: Response, next: NextFunction) {
    try {
        const { county, status, dateRange, companyId, companyRole } = req.query;
        const countyParam = county ? county.toString() : undefined;
        const statusParam = status
            ? Array.isArray(status)
                ? status.map((s) => s.toString())
                : status.toString()
            : undefined;
        const dateRangeParam = dateRange ? dateRange.toString() : undefined;
        const companyIdParam = companyId ? companyId.toString() : undefined;
        const companyRoleParam = companyRole ? companyRole.toString() : undefined;

        const results = await MapServices.getMapProperties(
            countyParam,
            statusParam,
            dateRangeParam,
            companyIdParam,
            companyRoleParam,
        );

        console.log('Properties map pins:', results.length);

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching properties map pins:', error);
        res.status(500).json({ message: 'Error fetching properties map pins' });
    }
}
