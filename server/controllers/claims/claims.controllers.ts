import { Request, Response } from 'express';
import { ClaimsServices } from 'server/services/claims';
import { reviewCompanyClaimSchema } from '@database/updates/companyClaims.update';

export async function submitClaimHandler(req: Request, res: Response) {
    try {
        const { id: companyId } = req.params;
        const userId = req.session.userId!;

        const result = await ClaimsServices.submitClaim(userId, companyId);
        switch (result.status) {
            case 'company-not-found':
                return res.status(404).json({ message: 'Company not found' });
            case 'already-claimed-by-user':
                return res.status(409).json({
                    message: 'You already have a pending or approved claim for this company',
                });
            case 'ok':
                return res
                    .status(201)
                    .json({ message: 'Claim submitted', claimId: result.claimId });
        }
    } catch (error) {
        console.error('Error submitting claim:', error);
        return res.status(500).json({ message: 'Error submitting claim' });
    }
}

export async function listClaimsHandler(req: Request, res: Response) {
    try {
        const status = req.query.status?.toString();
        const claims = await ClaimsServices.listClaims(status);
        return res.json({ data: claims, count: claims.length });
    } catch (error) {
        console.error('Error listing claims:', error);
        return res.status(500).json({ message: 'Error listing claims' });
    }
}

export async function reviewClaimHandler(req: Request, res: Response) {
    try {
        const { id: claimId } = req.params;
        const reviewerId = req.session.userId!;

        const validation = reviewCompanyClaimSchema.safeParse(req.body);
        if (!validation.success) {
            return res
                .status(400)
                .json({ message: 'Invalid request data', errors: validation.error.errors });
        }

        const { action, adminNotes } = validation.data;
        const result = await ClaimsServices.reviewClaim(claimId, reviewerId, action, adminNotes);

        switch (result.status) {
            case 'not-found':
                return res.status(404).json({ message: 'Claim not found' });
            case 'already-reviewed':
                return res.status(409).json({ message: 'This claim has already been reviewed' });
            case 'ok':
                return res.json({ message: `Claim ${action}d`, claim: result.claim });
        }
    } catch (error) {
        console.error('Error reviewing claim:', error);
        return res.status(500).json({ message: 'Error reviewing claim' });
    }
}

export async function getCompanyMembersHandler(req: Request, res: Response) {
    try {
        const { id: companyId } = req.params;
        const members = await ClaimsServices.getCompanyMembers(companyId);
        return res.json({ data: members, count: members.length });
    } catch (error) {
        console.error('Error fetching company members:', error);
        return res.status(500).json({ message: 'Error fetching company members' });
    }
}

export async function getUserMembershipsHandler(req: Request, res: Response) {
    try {
        const userId = req.session.userId!;
        const memberships = await ClaimsServices.getUserMemberships(userId);
        return res.json({ data: memberships, count: memberships.length });
    } catch (error) {
        console.error('Error fetching user memberships:', error);
        return res.status(500).json({ message: 'Error fetching user memberships' });
    }
}
