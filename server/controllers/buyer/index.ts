import { Request, Response, NextFunction } from "express";
import { BuyerServices } from "server/services/buyer";

export async function getBuyerFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = req.query.limit 
      ? parseInt(req.query.limit as string, 10) 
      : 20;

    const page = req.query.page 
      ? parseInt(req.query.page as string, 10) 
      : 1;

    const county = req.query.county 
      ? (req.query.county as string).trim() 
      : null;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ 
        message: "Invalid limit. Must be between 1 and 100." 
      });
      return;
    }

    if (isNaN(page) || page < 1) {
      res.status(400).json({ 
        message: "Invalid page. Must be 1 or greater." 
      });
      return;
    }

    const result = await BuyerServices.getRecentPurchases(limit, page, county);
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching recent purchases:", error);
    res.status(500).json({ message: "Error fetching recent purchases" });
  }
}

export const BuyerControllers = {
    getBuyerFeed,
};
