import { Request, Response, NextFunction } from 'express';
import { getProperties as getPropertiesService } from 'server/services/properties/properties.services';
import { isAdminOrOwner } from 'server/services/users/users.services';

export async function getProperties(req: Request, res: Response, next: NextFunction) {
    try {
        // Supplemental tax data is admin/owner-only; resolve from the session, not the query.
        const includeSupplementalTax = await isAdminOrOwner(req.session.userId);
        const result = await getPropertiesService(req.query, { includeSupplementalTax });
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({ message: 'Error fetching properties' });
    }
}
