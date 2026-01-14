import { Request, Response, NextFunction } from "express";
import { MapServices } from "server/services/properties";

export async function getMapData(req: Request, res: Response, next: NextFunction) {
    try {
        const { county } = req.query;
        const countyParam = county ? county.toString() : undefined;

        const results = await MapServices.getMapProperties(countyParam);

        console.log("Properties map pins:", results.length);

        res.status(200).json(results);

    } catch (error) {
        console.error("Error fetching properties map pins:", error);
        res.status(500).json({ message: "Error fetching properties map pins" });
    }
}