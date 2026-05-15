import { Router } from "express";
import multer from "multer";
import { requireRole } from "server/middleware/requireRole";
import { VendorsController } from "server/controllers/vendors";

const router = Router();

const adminOrOwner = requireRole(["admin", "owner"]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG and PNG files are allowed"));
        }
    },
});

// Public reads
router.get("/", VendorsController.getAllVendorsHandler);
router.get("/recommended", VendorsController.getRecommendedVendorsHandler);
router.get("/:vendorId", VendorsController.getVendorByIdHandler);

// Admin / owner writes
router.post("/", adminOrOwner, VendorsController.createVendorHandler);
router.put("/:vendorId", adminOrOwner, VendorsController.updateVendorHandler);
router.put("/:vendorId/recommend", adminOrOwner, VendorsController.toggleRecommendHandler);
router.delete("/:vendorId", adminOrOwner, VendorsController.deleteVendorHandler);

// Admin / owner image management
router.post("/:vendorId/logo", adminOrOwner, upload.single("image"), VendorsController.uploadVendorLogoHandler);
router.delete("/:vendorId/logo", adminOrOwner, VendorsController.removeVendorLogoHandler);
router.post("/:vendorId/header", adminOrOwner, upload.single("image"), VendorsController.uploadVendorHeaderHandler);
router.delete("/:vendorId/header", adminOrOwner, VendorsController.removeVendorHeaderHandler);

export default router;
