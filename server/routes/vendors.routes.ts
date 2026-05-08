import { Router } from "express";
import { VendorsController } from "server/controllers/vendors";

const router = Router();

// Get all vendors, optional ?categoryId= filter
router.get("/", VendorsController.getAllVendorsHandler);

// Get a single vendor with their categories
router.get("/:id", VendorsController.getVendorByIdHandler);

export default router;
