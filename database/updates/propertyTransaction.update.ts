import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const updatePropertyTransactionSchema = z
    .object({
        transactionType: z.string().min(1).optional(),
        recordingDate: z.string().regex(dateRegex, 'Must be YYYY-MM-DD').optional(),
        saleDate: z.string().regex(dateRegex, 'Must be YYYY-MM-DD').optional(),
        buyerName: z.string().optional().nullable(),
        sellerName: z.string().optional().nullable(),
        salePrice: z.string().optional().nullable(),
        firstMtgLenderName: z.string().optional().nullable(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided',
    });

export type UpdatePropertyTransactionInput = z.infer<typeof updatePropertyTransactionSchema>;
