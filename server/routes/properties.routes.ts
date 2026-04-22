import { Router } from "express";
import { requireRole } from "server/middleware/requireRole";
import { MapsController, StreetviewController, PropertiesController, PropertyController, PropertyTransactionsController } from "server/controllers/properties";

const router = Router();

// Get all properties
router.get("/", PropertiesController.getProperties);

// Add a property
router.post("/", requireRole(["admin", "owner"]), PropertyController.postProperty);

// Get property data needed to display map pins (latitude, longitude, city, state, etc.)
router.get("/map", MapsController.getMapData);

// Create suggestions when searching for properties
router.get("/suggestions", PropertyController.getPropertySuggestionsHandler);

// Get streetview image of a property
router.get("/streetview", StreetviewController.getStreetview);

// Update is_arv_funded on a property -- ability to edit whole property is not implemented but can be
router.patch("/:id", requireRole(["admin", "owner", "relationship-manager"]), PropertyController.patchPropertyHandler);

// Delete a property
router.delete("/:id", requireRole(["admin", "owner"]), PropertyController.removeProperty);

// Property transactions (read-only; mutations go through PATCH /:id)
router.get("/:id/transactions", PropertyTransactionsController.getTransactionsHandler);

// Get a property by id
router.get("/:id", PropertyController.getProperty);

export default router;
