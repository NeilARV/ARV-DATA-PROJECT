import { Router } from "express";
import { db } from "server/storage";
import { companyContacts } from "@shared/schema";

const router = Router();

// Get all company contacts
router.get("/contacts", async (_req, res) => {
    try {
        const allContacts = await db
            .select()
            .from(companyContacts)
            .orderBy(companyContacts.companyName);
        res.json(allContacts);
    } catch (error) {
        console.error("Error fetching company contacts:", error);
        res.status(500).json({ message: "Error fetching company contacts" });
    }
});

export default router