import { Request, Response, NextFunction } from 'express';
import { ZipCountsServices } from 'server/services/properties';

export async function getZipCounts(req: Request, res: Response, next: NextFunction) {
    try {
        const { county, msa, status, dateRange, companyId, companyRole } = req.query;
        const countyParam = county
            ? Array.isArray(county)
                ? county.map((c) => c.toString())
                : county.toString()
            : undefined;
        const statusParam = status
            ? Array.isArray(status)
                ? status.map((s) => s.toString())
                : status.toString()
            : undefined;

        const results = await ZipCountsServices.getZipCounts({
            county: countyParam,
            msa: msa ? msa.toString() : undefined,
            statusFilter: statusParam,
            dateRange: dateRange ? dateRange.toString() : undefined,
            companyId: companyId ? companyId.toString() : undefined,
            companyRole: companyRole ? companyRole.toString() : undefined,
        });

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching zip counts:', error);
        res.status(500).json({ message: 'Error fetching zip counts' });
    }
}
