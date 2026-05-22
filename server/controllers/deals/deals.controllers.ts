import type { Request, Response } from "express";
import {
    getDeals,
    getDealById,
    createDeal,
    updateDeal,
    deleteDeal,
    requestDealInfo,
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
        const county  = typeof req.query.county  === "string" ? req.query.county  : undefined;
        const city    = typeof req.query.city    === "string" ? req.query.city    : undefined;
        const state   = typeof req.query.state   === "string" ? req.query.state   : undefined;
        const zipCode = typeof req.query.zipCode === "string" ? req.query.zipCode : undefined;

        const results = await getDeals({ userId, msaName, county, city, state, zipCode });
        res.json(results);
    } catch (err) {
        handleServiceError(res, err, "Error fetching deals");
    }
}

// ── GET /api/deals/:id ─────────────────────────────────────────────────────────
export async function getDealByIdController(req: Request, res: Response): Promise<void> {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            res.status(400).json({ message: "Invalid deal id" });
            return;
        }
        const deal = await getDealById(id);
        if (!deal) {
            res.status(404).json({ message: "Deal not found" });
            return;
        }
        res.json(deal);
    } catch (err) {
        handleServiceError(res, err, "Error fetching deal");
    }
}

// ── POST /api/deals ────────────────────────────────────────────────────────────
export async function createDealController(req: Request, res: Response): Promise<void> {
    try {
        const {
            address, city, state, zipCode,
            userId, dealType, price, potentialARV, closeOfEscrow, estimatedBudget,
            beds, baths, sqft, propertyType,
            notes, adminNotes, photosUrl, sendNotifications, links,
        } = req.body;

        // Input validation (format, not business logic)
        if (!city || !state || !zipCode || !userId) {
            res.status(400).json({
                message: "Missing required fields",
                errors: [{ path: [], message: "city, state, zipCode, and userId are required" }],
            });
            return;
        }
        if (!UUID_REGEX.test(userId)) {
            res.status(400).json({ message: "Invalid userId — must be a valid UUID" });
            return;
        }
        if (userId !== req.session.userId) {
            res.status(403).json({ message: "Forbidden - userId must match authenticated user" });
            return;
        }
        if (price != null && Number(price) <= 0) {
            res.status(400).json({ message: "Price must be greater than 0" });
            return;
        }

        const { deal, msaId } = await createDeal({
            address, city, state, zipCode,
            userId, dealType, price, potentialARV, closeOfEscrow, estimatedBudget,
            beds, baths, sqft, propertyType,
            notes, adminNotes, photosUrl, sendNotifications, links,
        });

        res.status(201).json({ message: "Deal posted successfully", deal });

        // Fire-and-forget notification after response is sent
        sendDealNotification(deal, msaId, userId, sendNotifications === true, "new");
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
            dealType, price, potentialARV, closeOfEscrow, estimatedBudget,
            beds, baths, sqft, propertyType,
            notes, adminNotes, photosUrl, links, sendNotifications,
        } = req.body;

        const updated = await updateDeal(id, callerId, {
            address, city, state, zipCode,
            dealType, price, potentialARV, closeOfEscrow, estimatedBudget,
            beds, baths, sqft, propertyType,
            notes, adminNotes, photosUrl, links,
        });

        const { previousType, previousPrice, ...dealForResponse } = updated;
        res.json({ message: "Deal updated successfully", deal: dealForResponse });

        // Fire-and-forget: sold transition takes priority; otherwise notify on price change
        if (previousType !== "sold" && updated.type === "sold" && updated.msaId) {
            sendDealNotification(updated, updated.msaId, callerId, sendNotifications === true, "sold");
        } else if (
            price !== undefined &&
            updated.msaId &&
            String(previousPrice ?? "") !== String(updated.price ?? "")
        ) {
            sendDealNotification(updated, updated.msaId, callerId, sendNotifications === true, "price_update", previousPrice);
        }
    } catch (err) {
        handleServiceError(res, err, "Error updating deal");
    }
}

// ── POST /api/deals/:id/request-info ──────────────────────────────────────────
export async function requestDealInfoController(req: Request, res: Response): Promise<void> {
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

        await requestDealInfo(id, callerId);
        res.json({ message: "Request sent successfully" });
    } catch (err) {
        handleServiceError(res, err, "Error sending deal info request");
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
