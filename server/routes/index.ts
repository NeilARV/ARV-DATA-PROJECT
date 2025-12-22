import { Router } from "express"
import authRoutes from "./auth.routes"
import adminRoutes from "./admin.routes"
import propertyRoutes from "./properties.routes"
import companyRoutes from "./companies.routes"

const router = Router();

router.use("/auth", authRoutes)
router.use("/admin", adminRoutes)
router.use("/properties", propertyRoutes)
router.use("/companies", companyRoutes)

export default router