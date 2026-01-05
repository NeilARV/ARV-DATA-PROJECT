import { Request, Response, NextFunction } from "express";
import { BuyerServices } from "server/services/buyer";

export async function getBuyerFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = req.query.limit 
      ? parseInt(req.query.limit as string, 10) 
      : 10;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ 
        message: "Invalid limit. Must be between 1 and 100." 
      });
      return;
    }

    const purchases = await BuyerServices.getRecentPurchases(limit);
    
    res.status(200).json(purchases);
  } catch (error) {
    console.error("Error fetching recent purchases:", error);
    res.status(500).json({ message: "Error fetching recent purchases" });
  }
}

export const BuyerControllers = {
    getBuyerFeed,
};
