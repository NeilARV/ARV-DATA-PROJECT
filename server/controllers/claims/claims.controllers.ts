import { Request, Response } from 'express';
import { z } from 'zod';
import { ClaimsServices } from 'server/services/claims';
import { reviewCompanyClaimSchema } from '@database/updates/companyClaims.update';
import { insertCompanyClaimSchema } from '@database/inserts/companyClaims.insert';
import { claimStatusFilterSchema } from '@database/validation/claims.validation';

const uuidParam = z.string().uuid();

/** Submits a company join request for the session user. */
export async function submitClaimHandler(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid company ID' });
            return;
        }
        const companyId = idValidation.data;

        const userId = req.session.userId;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized - Please log in' });
            return;
        }

        const bodyValidation = insertCompanyClaimSchema
            .omit({ companyId: true })
            .safeParse(req.body);
        if (!bodyValidation.success) {
            res.status(400).json({
                message: 'Invalid request data',
                errors: bodyValidation.error.errors,
            });
            return;
        }
        const userMessage = bodyValidation.data.userMessage;

        const result = await ClaimsServices.submitClaim(userId, companyId, userMessage);
        switch (result.status) {
            case 'company-not-found':
                res.status(404).json({ message: 'Company not found' });
                return;
            case 'already-claimed-by-user':
                res.status(409).json({
                    message: 'You already have a pending or approved claim for this company',
                });
                return;
            case 'ok':
                res.status(201).json({ message: 'Claim submitted', claimId: result.claimId });
                return;
        }
    } catch (error) {
        console.error('Error submitting claim:', error);
        res.status(500).json({ message: 'Error submitting claim' });
    }
}

/** Lists claims for the admin review queue, optionally filtered by status. */
export async function listClaimsHandler(req: Request, res: Response): Promise<void> {
    try {
        const statusValidation = claimStatusFilterSchema.safeParse(req.query.status);
        if (!statusValidation.success) {
            res.status(400).json({
                message: 'Invalid status filter',
                errors: statusValidation.error.errors,
            });
            return;
        }

        const claims = await ClaimsServices.listClaims(statusValidation.data);
        res.json({ data: claims, count: claims.length });
    } catch (error) {
        console.error('Error listing claims:', error);
        res.status(500).json({ message: 'Error listing claims' });
    }
}

/** Approves or rejects a pending claim as the session admin. */
export async function reviewClaimHandler(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid claim ID' });
            return;
        }
        const claimId = idValidation.data;

        const reviewerId = req.session.userId;
        if (!reviewerId) {
            res.status(401).json({ message: 'Unauthorized - Please log in' });
            return;
        }

        const validation = reviewCompanyClaimSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid request data',
                errors: validation.error.errors,
            });
            return;
        }

        const { action, adminNotes, adminMessage } = validation.data;
        const result = await ClaimsServices.reviewClaim(
            claimId,
            reviewerId,
            action,
            adminNotes,
            adminMessage,
        );

        switch (result.status) {
            case 'not-found':
                res.status(404).json({ message: 'Claim not found' });
                return;
            case 'already-reviewed':
                res.status(409).json({ message: 'This claim has already been reviewed' });
                return;
            case 'ok':
                res.json({ message: `Claim ${action}d`, claim: result.claim });
                return;
        }
    } catch (error) {
        console.error('Error reviewing claim:', error);
        res.status(500).json({ message: 'Error reviewing claim' });
    }
}

/** Lists the member user ids of a company. */
export async function getCompanyMembersHandler(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid company ID' });
            return;
        }
        const companyId = idValidation.data;
        const members = await ClaimsServices.getCompanyMembers(companyId);
        res.json({ data: members, count: members.length });
    } catch (error) {
        console.error('Error fetching company members:', error);
        res.status(500).json({ message: 'Error fetching company members' });
    }
}

/** Lists the session user's company memberships. */
export async function getUserMembershipsHandler(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.session.userId;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized - Please log in' });
            return;
        }
        const memberships = await ClaimsServices.getUserMemberships(userId);
        res.json({ data: memberships, count: memberships.length });
    } catch (error) {
        console.error('Error fetching user memberships:', error);
        res.status(500).json({ message: 'Error fetching user memberships' });
    }
}

/** Lists any user's company memberships (admin view). */
export async function getAdminUserMembershipsHandler(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.userId);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid user ID' });
            return;
        }
        const memberships = await ClaimsServices.getUserMemberships(idValidation.data);
        res.json({ data: memberships, count: memberships.length });
    } catch (error) {
        console.error('Error fetching user memberships:', error);
        res.status(500).json({ message: 'Error fetching user memberships' });
    }
}

/** Replaces a user's company memberships with the given company ids (admin operation). */
export async function setUserCompanyMembershipsHandler(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.userId);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid user ID' });
            return;
        }
        const userId = idValidation.data;

        const bodyValidation = z
            .object({ companyIds: z.array(z.string().uuid()) })
            .safeParse(req.body);
        if (!bodyValidation.success) {
            res.status(400).json({
                message: 'Invalid request data',
                errors: bodyValidation.error.errors,
            });
            return;
        }

        const result = await ClaimsServices.setUserCompanyMemberships(
            userId,
            bodyValidation.data.companyIds,
        );
        if (result.status === 'unknown-company-ids') {
            res.status(400).json({
                message: `Unknown company ids: ${result.unknownIds.join(', ')}`,
            });
            return;
        }
        res.json({ message: 'Company memberships updated' });
    } catch (error) {
        console.error('Error updating company memberships:', error);
        res.status(500).json({ message: 'Error updating company memberships' });
    }
}
