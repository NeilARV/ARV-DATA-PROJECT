import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { users, emailSubscriptionList } from '../schemas';
import { countySubscriptionSelectionSchema } from '../validation/countySubscriptions.validation';

export const insertEmailSubscriptionListSchema = createInsertSchema(emailSubscriptionList)
    .omit({
        id: true,
        createdAt: true,
        updatedAt: true,
    })
    .extend({
        email: z.string().email('Invalid email address'),
        // The counties replace-list (issue #134) — same resolution contract as the user
        // subscription replace-list; an entry with no counties would receive nothing, so reject.
        counties: z.array(countySubscriptionSelectionSchema).min(1, 'Select at least one county'),
        relationshipManagerId: z.string().uuid().optional().nullable(),
    })
    .strict();

export const insertUserSchema = createInsertSchema(users)
    .omit({
        id: true,
        passwordHash: true,
        createdAt: true,
        updatedAt: true,
        notifications: true,
    })
    .extend({
        password: z.string().min(6, 'Password must be at least 6 characters'),
        email: z.string().email('Invalid email address'),
        phone: z.string().min(14, 'Valid phone number is required'),
        county: z.string().nullable().optional(),
        state: z.string().max(2).nullable().optional(),
    });

export const insertUserBySignUpSchema = insertUserSchema
    .extend({
        confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ['confirmPassword'],
    })
    .refine((data) => !(data.county && !data.state), {
        message: 'State is required when a county is selected',
        path: ['state'],
    });
