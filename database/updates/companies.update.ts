import { z } from 'zod';

export const updateCompanySchema = z
    .object({
        isArvClient: z.boolean().optional(),
    })
    .strict();

export const updateCompanyContactSchema = z
    .object({
        firstName: z.string().min(1, 'First name is required').optional(),
        lastName: z.string().nullable().optional(),
        email: z.preprocess(
            (val) => (val === '' || val === undefined ? null : val),
            z.union([z.string().email('Invalid email address'), z.null()]).optional(),
        ),
        phoneNumber: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
    })
    .strict();
