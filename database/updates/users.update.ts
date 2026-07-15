import { z } from 'zod';
import { countySubscriptionSelectionSchema } from '../validation/countySubscriptions.validation';

const SUBSCRIPTION_TIERS = ['basic', 'pro', 'premium'] as const;

const DATA_APP_STATUS_VALUES = ['in-renovation', 'on-market', 'wholesale', 'sold'] as const;
const DEAL_TYPE_VALUES = ['wholesale', 'agent', 'sold', 'reo'] as const;

export const updateNotificationPreferencesSchema = z
    .object({
        dataAppEnabled: z.boolean().optional(),
        dealNotificationsEnabled: z.boolean().optional(),
        vendorNotificationsEnabled: z.boolean().optional(),
        analyticsEnabled: z.boolean().optional(),
        dataAppStatusFilter: z.array(z.enum(DATA_APP_STATUS_VALUES)).optional(),
        dealTypeFilter: z.array(z.enum(DEAL_TYPE_VALUES)).optional(),
    })
    .strict();

export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;

export const adminPatchUserSchema = z.object({
    subscriptionTier: z.enum(SUBSCRIPTION_TIERS).nullable().optional(),
    accountTypes: z.array(z.string().min(1)).optional(),
    relationshipManagerId: z.string().uuid().nullable().optional(),
});

export type AdminPatchUser = z.infer<typeof adminPatchUserSchema>;

export const updateUserProfileSchema = z
    .object({
        firstName: z.string().min(1, 'First name is required').optional(),
        lastName: z.string().min(1, 'Last name is required').optional(),
        email: z.string().email('Invalid email address').optional(),
        phone: z.string().min(1, 'Phone is required').optional(),
        notifications: z.boolean().optional(),
        // County subscriptions are the replace-list going forward (issue #114); msaSubscriptions is
        // the legacy whole-MSA form, still accepted until the profile UI moves onto counties (#115).
        countySubscriptions: z.array(countySubscriptionSelectionSchema).optional(),
        msaSubscriptions: z.array(z.string()).optional(),
        county: z.string().nullable().optional(),
        state: z.string().max(2).nullable().optional(),
    })
    .strict();
