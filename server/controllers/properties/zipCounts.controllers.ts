import { Request, Response, NextFunction } from "express";
import { ZipCountsServices } from "server/services/properties";

export async function getZipCounts(req: Request, res: Response, next: NextFunction) {
    try {
        const { county, status, dateRange, companyId } = req.query;
        const countyParam = county ? county.toString() : undefined;
        const statusParam = status
            ? (Array.isArray(status) ? status.map(s => s.toString()) : status.toString())
            : undefined;
        const dateRangeParam = dateRange ? dateRange.toString() : undefined;
        const companyIdParam = companyId ? companyId.toString() : undefined;

        const results = await ZipCountsServices.getZipCounts(countyParam, statusParam, dateRangeParam, companyIdParam);

        res.status(200).json(results);
    } catch (error) {
        console.error("Error fetching zip counts:", error);
        res.status(500).json({ message: "Error fetching zip counts" });
    }
}
