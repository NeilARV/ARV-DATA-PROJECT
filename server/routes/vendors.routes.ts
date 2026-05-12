import { Router } from "express";
import { requireRole } from "server/middleware/requireRole";
import { VendorsController } from "server/controllers/vendors";

const router = Router();

const adminOrOwner = requireRole(["admin", "owner"]);

// Public reads
router.get("/", VendorsController.getAllVendorsHandler);
router.get("/:vendorId", VendorsController.getVendorByIdHandler);

// Admin / owner writes
router.post("/", adminOrOwner, VendorsController.createVendorHandler);
router.put("/:vendorId", adminOrOwner, VendorsController.updateVendorHandler);
router.delete("/:vendorId", adminOrOwner, VendorsController.deleteVendorHandler);

export default router;
