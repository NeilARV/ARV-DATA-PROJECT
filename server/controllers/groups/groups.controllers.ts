import type { Request, Response } from 'express';
import { z } from 'zod';
import { GroupsService } from 'server/services/groups';
import { GroupServiceError } from 'server/services/groups/groups.services';
import {
    createGroupSchema,
    updateGroupSchema,
    addCompanySchema,
    addMemberSchema,
    setMemberRoleSchema,
} from '@database/validation/groups.validation';

const uuidParam = z.string().uuid();

function handleServiceError(res: Response, err: unknown, fallbackMessage: string): void {
    if (err instanceof GroupServiceError) {
        res.status(err.statusCode).json({ message: err.message });
    } else {
        console.error(fallbackMessage, err);
        res.status(500).json({ message: fallbackMessage });
    }
}

// ── POST /api/groups ─────────────────────────────────────────────────────────
export async function createGroupController(req: Request, res: Response): Promise<void> {
    try {
        const createdBy = req.session.userId;
        if (!createdBy) {
            res.status(401).json({ message: 'Unauthorized - Please log in' });
            return;
        }

        const parsed = createGroupSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
            return;
        }

        const group = await GroupsService.createGroup({ ...parsed.data, createdBy });
        res.status(201).json({ message: 'Group created', group });
    } catch (err) {
        handleServiceError(res, err, 'Error creating group');
    }
}

// ── PATCH /api/groups/:id ──────────────────────────────────────────────────────
export async function updateGroupController(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid group ID' });
            return;
        }

        const parsed = updateGroupSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
            return;
        }

        const group = await GroupsService.updateGroup(idValidation.data, parsed.data);
        res.json({ message: 'Group updated', group });
    } catch (err) {
        handleServiceError(res, err, 'Error updating group');
    }
}

// ── DELETE /api/groups/:id ─────────────────────────────────────────────────────
export async function disbandGroupController(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid group ID' });
            return;
        }

        const result = await GroupsService.disbandGroup(idValidation.data);
        res.json({ message: 'Group disbanded', id: result.id });
    } catch (err) {
        handleServiceError(res, err, 'Error disbanding group');
    }
}

// ── POST /api/groups/:id/companies ─────────────────────────────────────────────
export async function addCompanyController(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid group ID' });
            return;
        }

        const parsed = addCompanySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
            return;
        }

        await GroupsService.addCompanyToGroup(idValidation.data, parsed.data.companyId);
        res.json({ message: 'Company added to group' });
    } catch (err) {
        handleServiceError(res, err, 'Error adding company to group');
    }
}

// ── DELETE /api/groups/:id/companies/:companyId ────────────────────────────────
export async function removeCompanyController(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        const companyValidation = uuidParam.safeParse(req.params.companyId);
        if (!idValidation.success || !companyValidation.success) {
            res.status(400).json({ message: 'Invalid group or company ID' });
            return;
        }

        await GroupsService.removeCompanyFromGroup(idValidation.data, companyValidation.data);
        res.json({ message: 'Company removed from group' });
    } catch (err) {
        handleServiceError(res, err, 'Error removing company from group');
    }
}

// ── POST /api/groups/:id/members ───────────────────────────────────────────────
export async function addMemberController(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        if (!idValidation.success) {
            res.status(400).json({ message: 'Invalid group ID' });
            return;
        }

        const parsed = addMemberSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
            return;
        }

        const member = await GroupsService.addGroupMember(
            idValidation.data,
            parsed.data.userId,
            parsed.data.role ?? null,
        );
        res.status(201).json({ message: 'Member added to group', member });
    } catch (err) {
        handleServiceError(res, err, 'Error adding member to group');
    }
}

// ── DELETE /api/groups/:id/members/:userId ─────────────────────────────────────
export async function removeMemberController(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        const userValidation = uuidParam.safeParse(req.params.userId);
        if (!idValidation.success || !userValidation.success) {
            res.status(400).json({ message: 'Invalid group or user ID' });
            return;
        }

        await GroupsService.removeGroupMember(idValidation.data, userValidation.data);
        res.json({ message: 'Member removed from group' });
    } catch (err) {
        handleServiceError(res, err, 'Error removing member from group');
    }
}

// ── PATCH /api/groups/:id/members/:userId ──────────────────────────────────────
export async function setMemberRoleController(req: Request, res: Response): Promise<void> {
    try {
        const idValidation = uuidParam.safeParse(req.params.id);
        const userValidation = uuidParam.safeParse(req.params.userId);
        if (!idValidation.success || !userValidation.success) {
            res.status(400).json({ message: 'Invalid group or user ID' });
            return;
        }

        const parsed = setMemberRoleSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
            return;
        }

        const member = await GroupsService.setGroupMemberRole(
            idValidation.data,
            userValidation.data,
            parsed.data.role,
        );
        res.json({ message: 'Member role updated', member });
    } catch (err) {
        handleServiceError(res, err, 'Error updating member role');
    }
}

// ── POST /api/groups/companies/:companyId/members ──────────────────────────────
export async function addMemberToCompanyController(req: Request, res: Response): Promise<void> {
    try {
        const createdBy = req.session.userId;
        if (!createdBy) {
            res.status(401).json({ message: 'Unauthorized - Please log in' });
            return;
        }

        const companyValidation = uuidParam.safeParse(req.params.companyId);
        if (!companyValidation.success) {
            res.status(400).json({ message: 'Invalid company ID' });
            return;
        }

        const parsed = addMemberSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: 'Invalid request data', errors: parsed.error.errors });
            return;
        }

        const result = await GroupsService.addMemberToCompany({
            companyId: companyValidation.data,
            userId: parsed.data.userId,
            role: parsed.data.role ?? null,
            createdBy,
        });
        res.status(201).json({ message: 'Member added to company', ...result });
    } catch (err) {
        handleServiceError(res, err, 'Error adding member to company');
    }
}
