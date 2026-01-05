import { Router } from "express"
import authRoutes from "./auth.routes"
import adminRoutes from "./admin.routes"
import propertyRoutes from "./properties.routes"
import companyRoutes from "./companies.routes"
import dataRoutes from "./data.routes"
import buyerRoutes from "./buyers.routes"

const router = Router();

router.use("/auth", authRoutes)
router.use("/admin", adminRoutes)
router.use("/properties", propertyRoutes)
router.use("/companies", companyRoutes)
router.use("/buyers", buyerRoutes)
router.use("/data", dataRoutes)

export default router