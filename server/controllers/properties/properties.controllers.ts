import { Request, Response, NextFunction } from "express";
import { getProperties as getPropertiesService } from "server/services/properties/properties.services";

export async function getProperties(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await getPropertiesService(req.query);
        res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).json({ message: "Error fetching properties" });
    }
}
