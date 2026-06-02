import { Request, Response, NextFunction } from 'express';
import { StreetviewServices } from 'server/services/properties';

export async function getStreetview(req: Request, res: Response, next: NextFunction) {
    try {
        const { address, city, state, size = '600x400', sfrPropertyId } = req.query;

        if (!address) {
            return res.status(400).json({ message: 'Address parameter is required' });
        }

        const parsedSfrPropertyId = sfrPropertyId ? Number(sfrPropertyId) : undefined;

        const result = await StreetviewServices.getStreetviewImage({
            address: address.toString(),
            city: city?.toString(),
            state: state?.toString(),
            size: size.toString(),
            sfrPropertyId:
                parsedSfrPropertyId && !isNaN(parsedSfrPropertyId)
                    ? parsedSfrPropertyId
                    : undefined,
        });

        // Check if result is an error
        if ('message' in result && 'status' in result && !('imageData' in result)) {
            const statusCode =
                result.status === 'NOT_AVAILABLE' ||
                result.status === 'ZERO_RESULTS' ||
                result.status === 'NOT_FOUND'
                    ? 404
                    : 500;

            return res.status(statusCode).json({
                message: result.message,
                status: result.status,
                reason: result.reason,
                cached: result.cached,
            });
        }

        // Result contains image data
        const imageResult = result as {
            imageData: Buffer;
            contentType: string;
            cached: boolean;
            imageSource: string;
        };

        // Set appropriate headers
        res.setHeader('Content-Type', imageResult.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.setHeader('X-Image-Source', imageResult.imageSource); // 'streetview' | 'satellite'

        res.send(imageResult.imageData);
    } catch (error) {
        console.error('Error fetching Street View image:', error);

        // Handle known service configuration errors
        if (error instanceof Error && error.message === 'Street View service not configured') {
            return res.status(500).json({ message: error.message });
        }

        if (error instanceof Error && error.message === 'Error checking Street View availability') {
            return res.status(500).json({ message: error.message });
        }

        res.status(500).json({ message: 'Error fetching Street View image' });
    }
}
