import crypto from 'crypto';
import { Request, Response } from 'express';
import { StreetviewServices } from 'server/services/properties';

// How long browsers may reuse a resolved image (or a known miss) before re-requesting.
// Kept below the shortest image expiry (15-day satellite) so a refreshed image still surfaces
// within a week; the previous 24h forced a daily refetch of every viewed image.
const IMAGE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MISS_MAX_AGE_SECONDS = 24 * 60 * 60; // 1 day

/**
 * Serves a property's Street View (or satellite) image.
 * Preferred path: 302-redirect to the Supabase CDN URL so image bytes never stream through
 * this server. Legacy rows still holding bytea are streamed with an ETag. Known "no image"
 * results return a short-lived cacheable 404 so a missing image isn't re-requested per render.
 */
export async function getStreetview(req: Request, res: Response): Promise<void> {
    try {
        const { address, city, state, size = '600x400', sfrPropertyId } = req.query;

        if (!address) {
            res.status(400).json({ message: 'Address parameter is required' });
            return;
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

        if (!result.available) {
            const isMiss =
                result.status === 'NOT_AVAILABLE' ||
                result.status === 'ZERO_RESULTS' ||
                result.status === 'NOT_FOUND';
            // Cache known misses briefly so a property with no Street View coverage isn't
            // re-requested on every card render; genuine errors stay uncached.
            if (isMiss) {
                res.setHeader('Cache-Control', `public, max-age=${MISS_MAX_AGE_SECONDS}`);
            }
            res.status(isMiss ? 404 : 500).json({
                message: result.message,
                status: result.status,
                reason: result.reason,
                cached: result.cached,
            });
            return;
        }

        // Preferred path: redirect to the Supabase CDN URL. The bytes are served by the CDN,
        // not this server or Neon. The redirect itself is cacheable.
        if (result.publicUrl) {
            res.setHeader('Cache-Control', `public, max-age=${IMAGE_MAX_AGE_SECONDS}`);
            res.setHeader('X-Image-Source', result.imageSource);
            res.redirect(302, result.publicUrl);
            return;
        }

        // Legacy fallback: stream the cached bytea (pre-Storage rows, or Storage unavailable).
        if (result.imageData) {
            const etag = `"${crypto.createHash('md5').update(result.imageData).digest('hex')}"`;
            if (req.headers['if-none-match'] === etag) {
                res.status(304).end();
                return;
            }
            res.setHeader('Content-Type', result.contentType);
            res.setHeader('Cache-Control', `public, max-age=${IMAGE_MAX_AGE_SECONDS}`);
            res.setHeader('ETag', etag);
            res.setHeader('X-Image-Source', result.imageSource);
            res.send(result.imageData);
            return;
        }

        // Available but neither a URL nor bytes could be produced — treat as not found.
        res.status(404).json({ message: 'Street View image not available' });
    } catch (error) {
        console.error('Error fetching Street View image:', error);

        // Handle known service configuration errors
        if (error instanceof Error && error.message === 'Street View service not configured') {
            res.status(500).json({ message: error.message });
            return;
        }

        if (error instanceof Error && error.message === 'Error checking Street View availability') {
            res.status(500).json({ message: error.message });
            return;
        }

        res.status(500).json({ message: 'Error fetching Street View image' });
    }
}
