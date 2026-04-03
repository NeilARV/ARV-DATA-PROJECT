import type { Request, Response } from "express";
import {
    getDeals,
    createDeal,
    updateDeal,
    deleteDeal,
    sendDealNotification,
    DealServiceError,
} from "server/services/deals/deals.services";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof DealServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── GET /api/deals ─────────────────────────────────────────────────────────────
export async function getDealsController(req: Request, res: Response): Promise<void> {
    try {
        const userId  = typeof req.query.userId  === "string" ? req.query.userId  : undefined;
        const msaName = typeof req.query.msaName === "string" ? req.query.msaName : undefined;

        const results = await getDeals({ userId, msaName });
        res.json(results);
    } catch (err) {
        handleServiceError(res, err, "Error fetching deals");
    }
}

// ── POST /api/deals ────────────────────────────────────────────────────────────
export async function createDealController(req: Request, res: Response): Promise<void> {
    try {
        const {
            address, city, state, zipCode,
            userId, dealType, price,
            beds, baths, sqft, propertyType,
            sendNotifications,
        } = req.body;

        // Input validation (format, not business logic)
        if (!city || !state || !zipCode || !userId || price == null) {
            res.status(400).json({
                message: "Missing required fields",
                errors: [{ path: [], message: "city, state, zipCode, userId, and price are required" }],
            });
            return;
        }
        if (!UUID_REGEX.test(userId)) {
            res.status(400).json({ message: "Invalid userId — must be a valid UUID" });
            return;
        }
        if (Number(price) <= 0) {
            res.status(400).json({ message: "Price must be greater than 0" });
            return;
        }

        const { deal, msaId } = await createDeal({
            address, city, state, zipCode,
            userId, dealType, price,
            beds, baths, sqft, propertyType,
            sendNotifications,
        });

        res.status(201).json({ message: "Deal posted successfully", deal });

        // Fire-and-forget notification after response is sent
        sendDealNotification(deal, msaId, userId, sendNotifications === true);
    } catch (err) {
        handleServiceError(res, err, "Error posting deal");
    }
}

// ── PATCH /api/deals/:id ───────────────────────────────────────────────────────
export async function updateDealController(req: Request, res: Response): Promise<void> {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ message: "Invalid deal id" });
            return;
        }

        const callerId = req.session?.userId;
        if (!callerId) {
            res.status(401).json({ message: "Not authenticated" });
            return;
        }

        const {
            address, city, state, zipCode,
            dealType, price,
            beds, baths, sqft, propertyType,
        } = req.body;

        const updated = await updateDeal(id, callerId, {
            address, city, state, zipCode,
            dealType, price,
            beds, baths, sqft, propertyType,
        });

        res.json({ message: "Deal updated successfully", deal: updated });
    } catch (err) {
        handleServiceError(res, err, "Error updating deal");
    }
}

// ── DELETE /api/deals/:id ──────────────────────────────────────────────────────
export async function deleteDealController(req: Request, res: Response): Promise<void> {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ message: "Invalid deal id" });
            return;
        }

        const callerId = req.session?.userId;
        if (!callerId) {
            res.status(401).json({ message: "Not authenticated" });
            return;
        }

        const result = await deleteDeal(id, callerId);
        res.json({ message: "Deal deleted successfully", id: result.id });
    } catch (err) {
        handleServiceError(res, err, "Error deleting deal");
    }
}
