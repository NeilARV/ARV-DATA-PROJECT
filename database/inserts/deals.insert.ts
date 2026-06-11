import { z } from 'zod';

export const dealFormSchema = z.object({
    address: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().length(2, 'State must be 2 characters'),
    zipCode: z.string().min(5, 'Valid zip code is required').max(10),
    msaId: z.number().int().positive('MSA required'),
    price: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.coerce
            .number({ invalid_type_error: 'Price must be a number' })
            .positive('Price must be greater than 0')
            .optional(),
    ),
    dealType: z.enum(['wholesale', 'agent', 'sold', 'reo']).default('agent'),
    beds: z.coerce.number().int().positive('Beds required'),
    baths: z.coerce.number().positive('Baths required'),
    sqft: z.coerce.number().int().positive('Square feet required'),
    propertyType: z.string().min(1, 'Property type required'),
    potentialARV: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.coerce.number().positive('ARV must be greater than 0').optional(),
    ),
    notes: z.string().max(1000, 'Notes must be 1000 characters or fewer').optional(),
    adminNotes: z.string().max(1000, 'Admin notes must be 1000 characters or fewer').optional(),
    showingDate: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z
            .string()
            .regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Enter a valid date (MM/DD/YYYY)')
            .optional(),
    ),
    showingTimeStr: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z
            .string()
            .regex(/^\d{1,2}:\d{2}$/, 'Enter a valid time (HH:MM)')
            .optional(),
    ),
    showingAmPm: z.enum(['AM', 'PM']).default('AM'),
    estimatedBudget: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.coerce
            .number({ invalid_type_error: 'Estimated budget must be a number' })
            .int()
            .positive('Estimated budget must be greater than 0')
            .optional(),
    ),
    sendNotifications: z.boolean().default(true),
    photosUrl: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.string().url('Please enter a valid URL').optional(),
    ),

    // Admin / RM-only fields (stripped server-side for unprivileged callers)
    isArvExclusive: z.boolean().default(false),
    onBehalfOfEmail: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.string().email('Invalid email address').optional(),
    ),
});

export type DealFormValues = z.infer<typeof dealFormSchema>;
