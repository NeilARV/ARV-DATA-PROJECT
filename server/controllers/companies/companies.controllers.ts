import { Request, Response } from 'express';
import { z } from 'zod';
import { CompaniesServices, GroupDirectoryServices } from 'server/services/companies';
import {
    updateCompanySchema,
    updateCompanyContactSchema,
} from '@database/updates/companies.update';
import { insertCompanyContactSchema } from '@database/inserts/companyContacts.insert';

/** The county query param as sent — single string or repeated params as string[]. */
function countyParam(value: Request['query'][string]): string | string[] | undefined {
    if (!value) return undefined;
    return Array.isArray(value) ? value.map((v) => v.toString()) : value.toString();
}

export async function getCompanySuggestionsHandler(req: Request, res: Response) {
    try {
        const { search, county } = req.query;
        if (!search || search.toString().trim().length < 2) {
            return res.status(200).json([]);
        }
        const results = await CompaniesServices.getCompanySuggestions(
            search.toString(),
            countyParam(county),
        );
        return res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching company suggestions:', error);
        return res.status(500).json({ message: 'Error fetching company suggestions' });
    }
}

export async function getContactsHandler(req: Request, res: Response) {
    try {
        const { county, page, limit, sort, search } = req.query;
        const result = await CompaniesServices.getContacts({
            county: countyParam(county),
            page: page?.toString(),
            limit: limit?.toString(),
            sort: sort?.toString(),
            search: search?.toString(),
        });
        return res.json(result);
    } catch (error) {
        console.error('Error fetching companies:', error);
        return res.status(500).json({ message: 'Error fetching companies' });
    }
}

export async function getGroupDirectoryHandler(req: Request, res: Response) {
    try {
        const { county, page, limit, sort, search } = req.query;
        const result = await GroupDirectoryServices.getGroupDirectory({
            county: countyParam(county),
            page: page?.toString(),
            limit: limit?.toString(),
            sort: sort?.toString(),
            search: search?.toString(),
        });
        return res.json(result);
    } catch (error) {
        console.error('Error fetching group directory:', error);
        return res.status(500).json({ message: 'Error fetching group directory' });
    }
}

export async function getGroupDirectoryRowHandler(req: Request, res: Response) {
    try {
        // A malformed uuid is just an invalid link — the same 404 as a disbanded group, not a 500
        // from the DB uuid cast.
        if (!z.string().uuid().safeParse(req.params.id).success) {
            return res.status(404).json({ message: 'Group not found' });
        }
        const { county, sort } = req.query;
        const group = await GroupDirectoryServices.getGroupDirectoryRowById(req.params.id, {
            county: countyParam(county),
            sort: sort?.toString(),
        });
        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }
        return res.json({ group });
    } catch (error) {
        console.error('Error fetching group directory row:', error);
        return res.status(500).json({ message: 'Error fetching group directory row' });
    }
}

export async function getWholesaleLeaderboardHandler(req: Request, res: Response) {
    try {
        const result = await CompaniesServices.getWholesaleLeaderboard(
            countyParam(req.query.county),
        );
        return res.json(result);
    } catch (error) {
        console.error('Error fetching wholesale leaderboard:', error);
        return res.status(500).json({ message: 'Error fetching wholesale leaderboard' });
    }
}

export async function getLeaderboardHandler(req: Request, res: Response) {
    try {
        const county = countyParam(req.query.county) ?? 'San Diego';
        const result = await CompaniesServices.getLeaderboard(county);
        return res.json(result);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return res.status(500).json({ message: 'Error fetching leaderboard' });
    }
}

export async function getCompanyByIdHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const company = await CompaniesServices.getCompanyById(id, countyParam(req.query.county));
        if (!company) {
            return res.status(404).json({ message: 'Company contact not found' });
        }
        return res.json(company);
    } catch (error) {
        console.error('Error fetching company:', error);
        return res.status(500).json({ message: 'Error fetching company' });
    }
}

export async function updateCompanyHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const validation = updateCompanySchema.safeParse(req.body);
        if (!validation.success) {
            console.error('Validation errors:', validation.error.errors);
            return res
                .status(400)
                .json({ message: 'Invalid update data', errors: validation.error.errors });
        }

        if (Object.keys(validation.data).length === 0) {
            return res.status(400).json({ message: 'No fields provided to update' });
        }

        const result = await CompaniesServices.updateCompany(id, validation.data);
        switch (result.status) {
            case 'not-found':
                return res.status(404).json({ message: 'Company not found' });
            case 'duplicate-name':
                return res.status(409).json({ message: 'A company with this name already exists' });
            case 'ok':
                return res.json(result.company);
        }
    } catch (error) {
        console.error('Error updating company:', error);
        return res.status(500).json({ message: 'Error updating company' });
    }
}

export async function addContactHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const validation = insertCompanyContactSchema.safeParse(req.body);
        if (!validation.success) {
            return res
                .status(400)
                .json({ message: 'Invalid contact data', errors: validation.error.errors });
        }
        const result = await CompaniesServices.addContact(id, validation.data);
        switch (result.status) {
            case 'company-not-found':
                return res.status(404).json({ message: 'Company not found' });
            case 'ok':
                return res.status(201).json(result.contact);
        }
    } catch (error) {
        console.error('Error adding contact:', error);
        return res.status(500).json({ message: 'Error adding contact' });
    }
}

export async function updateContactHandler(req: Request, res: Response) {
    try {
        const { id, contactId } = req.params;
        const contactIdNum = parseInt(contactId, 10);
        if (isNaN(contactIdNum)) {
            return res.status(400).json({ message: 'Invalid contact ID' });
        }
        const validation = updateCompanyContactSchema.safeParse(req.body);
        if (!validation.success) {
            return res
                .status(400)
                .json({ message: 'Invalid contact data', errors: validation.error.errors });
        }
        if (Object.keys(validation.data).length === 0) {
            return res.status(400).json({ message: 'No fields provided to update' });
        }
        const result = await CompaniesServices.updateContact(id, contactIdNum, validation.data);
        switch (result.status) {
            case 'contact-not-found':
                return res.status(404).json({ message: 'Contact not found' });
            case 'ok':
                return res.json(result.contact);
        }
    } catch (error) {
        console.error('Error updating contact:', error);
        return res.status(500).json({ message: 'Error updating contact' });
    }
}

export async function deleteContactHandler(req: Request, res: Response) {
    try {
        const { id, contactId } = req.params;
        const contactIdNum = parseInt(contactId, 10);
        if (isNaN(contactIdNum)) {
            return res.status(400).json({ message: 'Invalid contact ID' });
        }
        const result = await CompaniesServices.deleteContact(id, contactIdNum);
        switch (result.status) {
            case 'contact-not-found':
                return res.status(404).json({ message: 'Contact not found' });
            case 'ok':
                return res.status(204).send();
        }
    } catch (error) {
        console.error('Error deleting contact:', error);
        return res.status(500).json({ message: 'Error deleting contact' });
    }
}

export async function enrichCompanyHandler(req: Request, res: Response) {
    try {
        const { id } = req.params;
        const { state } = req.body as { state?: string };
        if (!state || typeof state !== 'string' || state.trim().length !== 2) {
            return res
                .status(400)
                .json({ message: 'state is required and must be a 2-letter code (e.g. CA, FL)' });
        }
        const result = await CompaniesServices.enrichCompany(id, state.trim().toUpperCase());
        switch (result.status) {
            case 'not-found':
                return res.status(404).json({ message: 'Company not found' });
            case 'unknown-jurisdiction':
                return res.status(400).json({ message: `Unsupported state: ${result.state}` });
            case 'no-match':
                return res.status(404).json({
                    message: `No exact match found for "${result.companyName}" in jurisdiction ${result.jurisdiction}`,
                });
            case 'oc-error':
                return res.status(502).json({ message: result.message });
            case 'ok':
                return res.status(200).json({ message: 'Company enriched successfully' });
        }
    } catch (error) {
        console.error('Error enriching company:', error);
        return res.status(500).json({ message: 'Error enriching company' });
    }
}
