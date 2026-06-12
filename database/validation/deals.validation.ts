import { z } from 'zod';

export const requestDealInfoSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().optional(),
    message: z.string().optional(),
});

export type RequestDealInfoFormValues = z.infer<typeof requestDealInfoSchema>;

export const submitOfferSchema = z.object({
    amount: z.coerce
        .number({ invalid_type_error: 'Offer amount is required' })
        .positive('Offer must be greater than 0'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().optional(),
});

export type SubmitOfferFormValues = z.infer<typeof submitOfferSchema>;
