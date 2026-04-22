import { Request, Response } from "express";
import { getPropertyTransactions } from "server/services/properties/propertyTransactions.services";

export async function getTransactionsHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const result = await getPropertyTransactions(id);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching property transactions:", error);
        return res.status(500).json({ message: "Error fetching property transactions" });
    }
}
