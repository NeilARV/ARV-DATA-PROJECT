import { z } from 'zod';

// Reuses the `member_role` enum values (owner | member); a new role enum is intentionally not added.
export const memberRoleSchema = z.enum(['owner', 'member']);

export const createGroupSchema = z.object({
    name: z.string().trim().min(1, 'Group name is required').max(255),
    description: z.string().max(1000).optional(),
});

// At least one field must be present; `description: null` clears it.
export const updateGroupSchema = z
    .object({
        name: z.string().trim().min(1, 'Group name is required').max(255).optional(),
        description: z.string().max(1000).nullable().optional(),
    })
    .refine((data) => data.name !== undefined || data.description !== undefined, {
        message: 'Provide a name or description to update',
    });

export const addCompanySchema = z.object({ companyId: z.string().uuid() });

// role is optional on add — the member_role column is nullable, matching legacy company_members rows.
export const addMemberSchema = z.object({
    userId: z.string().uuid(),
    role: memberRoleSchema.optional(),
});

export const setMemberRoleSchema = z.object({ role: memberRoleSchema });

// The :id path param is the source group (A); targetGroupId is the surviving group (B).
export const mergeGroupSchema = z.object({ targetGroupId: z.string().uuid() });

export type MemberRoleInput = z.infer<typeof memberRoleSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AddCompanyInput = z.infer<typeof addCompanySchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>;
export type MergeGroupInput = z.infer<typeof mergeGroupSchema>;
