import { Router } from 'express';
import { requireRole } from 'server/middleware/requireRole';
import { requireSub } from 'server/middleware/requireSub';
import { ADMIN_ROLES, PRIVILEGED_ROLES, ALL_TEAM_ROLES } from 'server/constants/roles.constants';
import {
    MapsController,
    ZipCountsController,
    StreetviewController,
    PropertiesController,
    PropertyController,
    PropertyTransactionsController,
} from 'server/controllers/properties';

const router = Router();

// Get all properties (buyers/wholesale feeds + table) — app access required (any subscription
// tier or team role). The map, detail, suggestions, street view, and zip counts stay public.
router.get(
    '/',
    requireSub(['basic', 'pro', 'premium'], { bypassRoles: [...ALL_TEAM_ROLES] }),
    PropertiesController.getProperties,
);

// Add a property
router.post('/', requireRole(ADMIN_ROLES), PropertyController.postProperty);

// Get property data needed to display map pins (latitude, longitude, city, state, etc.)
// Supports an optional viewport box (south/west/north/east) to return only pins in view.
router.get('/map', MapsController.getMapData);

// Get the bounding box + count of the current filter/company set (used to center the map
// without loading every pin). Public, like /map.
router.get('/map/extent', MapsController.getMapExtent);

// Get property counts grouped by county for the national overview layer (zoomed-out clusters).
// Public, like /map.
router.get('/map/regions', MapsController.getRegionCounts);

// Get property counts grouped by zip code (lightweight; used for zip filter dropdown on all views)
router.get('/zip-counts', ZipCountsController.getZipCounts);

// Create suggestions when searching for properties
router.get('/suggestions', PropertyController.getPropertySuggestionsHandler);

// Get streetview image of a property
router.get('/streetview', StreetviewController.getStreetview);

// Update is_arv_funded on a property -- ability to edit whole property is not implemented but can be
router.patch(
    '/:id',
    requireRole(PRIVILEGED_ROLES),
    PropertyController.patchPropertyHandler,
);

// Delete a property
router.delete('/:id', requireRole(ADMIN_ROLES), PropertyController.removeProperty);

// Property transactions (read-only; mutations go through PATCH /:id)
router.get('/:id/transactions', PropertyTransactionsController.getTransactionsHandler);

// Get a property by id
router.get('/:id', PropertyController.getProperty);

export default router;
