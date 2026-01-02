import { Router } from "express";
import { db } from "server/storage";
import { companyContacts } from "@shared/schema";

const router = Router();

// Test endpoint to verify route module is loaded
router.get("/test", (_req, res) => {
    console.log("[COMPANIES] Test endpoint hit - route module is loaded");
    res.json({ 
        message: "Companies route module is working", 
        timestamp: new Date().toISOString(),
        path: "/api/companies/test"
    });
});

// Get all company contacts
router.get("/contacts", async (req, res) => {
    console.log("[COMPANIES] ===== GET /contacts route hit =====");
    console.log("[COMPANIES] Request URL:", req.url);
    console.log("[COMPANIES] Request path:", req.path);
    console.log("[COMPANIES] Request originalUrl:", req.originalUrl);
    
    try {
        console.log("[COMPANIES] Starting database query...");
        const allContacts = await db
            .select()
            .from(companyContacts)
            .orderBy(companyContacts.companyName);
        
        console.log("[COMPANIES] Query completed. Found", allContacts.length, "contacts");
        
        if (allContacts.length === 0) {
            console.warn("[COMPANIES] WARNING: Database query returned 0 contacts");
        } else {
            console.log("[COMPANIES] First contact:", {
                id: allContacts[0].id,
                companyName: allContacts[0].companyName
            });
        }
        
        res.json(allContacts);
        console.log("[COMPANIES] Response sent successfully");
        
    } catch (error) {
        console.error("[COMPANIES] ===== ERROR =====");
        console.error("[COMPANIES] Error fetching company contacts:", error);
        console.error("[COMPANIES] Error stack:", error instanceof Error ? error.stack : "No stack");
        res.status(500).json({ 
            message: "Error fetching company contacts",
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

console.log("[COMPANIES] Companies router module loaded and initialized");

export default router