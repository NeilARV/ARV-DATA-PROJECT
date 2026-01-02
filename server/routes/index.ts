import { Router } from "express"
import authRoutes from "./auth.routes"
import adminRoutes from "./admin.routes"
import propertyRoutes from "./properties.routes"
import companyRoutes from "./companies.routes"
import dataRoutes from "./data.routes"

const router = Router();

console.log("[ROUTES] Initializing route modules...");

console.log("[ROUTES] Registering /auth routes");
router.use("/auth", authRoutes)

console.log("[ROUTES] Registering /admin routes");
router.use("/admin", adminRoutes)

console.log("[ROUTES] Registering /properties routes");
router.use("/properties", propertyRoutes)

console.log("[ROUTES] Registering /companies routes");
router.use("/companies", companyRoutes)

console.log("[ROUTES] Registering /data routes");
router.use("/data", dataRoutes)

console.log("[ROUTES] All route modules registered successfully");

export default router