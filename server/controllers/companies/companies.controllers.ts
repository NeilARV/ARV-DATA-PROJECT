import { Request, Response } from "express";
import { CompaniesServices } from "server/services/companies";
import { updateCompanySchema } from "@database/updates/companies.update";

export async function getCompanySuggestionsHandler(req: Request, res: Response) {
    try {
        const { search } = req.query;
        if (!search || search.toString().trim().length < 2) {
            return res.status(200).json([]);
        }
        const results = await CompaniesServices.getCompanySuggestions(search.toString());
        return res.status(200).json(results);
    } catch (error) {
        console.error("Error fetching company suggestions:", error);
        return res.status(500).json({ message: "Error fetching company suggestions" });
    }
}

export async function getContactsHandler(req: Request, res: Response) {
    try {
        const { county, page, limit, sort, search } = req.query;
        const result = await CompaniesServices.getContacts({
            county: county?.toString(),
            page: page?.toString(),
            limit: limit?.toString(),
            sort: sort?.toString(),
            search: search?.toString(),
        });
        return res.json(result);
    } catch (error) {
        console.error("Error fetching companies:", error);
        return res.status(500).json({ message: "Error fetching companies" });
    }
}

export async function getWholesaleLeaderboardHandler(req: Request, res: Response) {
    try {
        const county = req.query.county?.toString()?.trim();
        const result = await CompaniesServices.getWholesaleLeaderboard(county);
        return res.json(result);
    } catch (error) {
        console.error("Error fetching wholesale leaderboard:", error);
        return res.status(500).json({ message: "Error fetching wholesale leaderboard" });
    }
}

export async function getLeaderboardHandler(req: Request, res: Response) {
    try {
        const county = req.query.county?.toString() || "San Diego";
        const result = await CompaniesServices.getLeaderboard(county);
        return res.json(result);
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        return res.status(500).json({ message: "Error fetching leaderboard" });
    }
}

export async function getCompanyByIdHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const county = req.query.county?.toString()?.trim();
        const company = await CompaniesServices.getCompanyById(id, county);
        if (!company) {
            return res.status(404).json({ message: "Company contact not found" });
        }
        return res.json(company);
    } catch (error) {
        console.error("Error fetching company:", error);
        return res.status(500).json({
            message: "Error fetching company",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
}

export async function updateCompanyHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const validation = updateCompanySchema.safeParse(req.body);
        if (!validation.success) {
            console.error("Validation errors:", validation.error.errors);
            return res.status(400).json({ message: "Invalid update data", errors: validation.error.errors });
        }

        if (Object.keys(validation.data).length === 0) {
            return res.status(400).json({ message: "No fields provided to update" });
        }

        const result = await CompaniesServices.updateCompany(id, validation.data);
        switch (result.status) {
            case "not-found":
                return res.status(404).json({ message: "Company not found" });
            case "duplicate-name":
                return res.status(409).json({ message: "A company with this name already exists" });
            case "ok":
                return res.json(result.company);
        }
    } catch (error) {
        console.error("Error updating company:", error);
        return res.status(500).json({
            message: "Error updating company",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
}
