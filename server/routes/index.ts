import { Router } from "express"
import authRoutes from "./auth.routes"
import adminRoutes from "./admin.routes"
import propertyRoutes from "./properties.routes"
import companyRoutes from "./companies.routes"
import geocodingRoutes from "./geocoding.routes"
import userRoutes from "./users.routes"
import dealsRoutes from "./deals.routes"
import contactRoutes from "./contact.routes"
import categoriesRoutes from "./categories.routes"
import vendorsRoutes from "./vendors.routes"

const router = Router();

router.use("/auth", authRoutes)
router.use("/admin", adminRoutes)
router.use("/users", userRoutes)
router.use("/properties", propertyRoutes)
router.use("/companies", companyRoutes)
router.use("/geocoding", geocodingRoutes)
router.use("/deals", dealsRoutes)
router.use("/contact", contactRoutes)
router.use("/categories", categoriesRoutes)
router.use("/vendors", vendorsRoutes)

export default router