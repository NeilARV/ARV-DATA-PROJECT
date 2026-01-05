import { Router } from "express";
import { BuyerControllers } from "server/controllers/buyer";

const router = Router();

// Get recent buyer purchases
router.get("/feed", BuyerControllers.getBuyerFeed);

export default router;
