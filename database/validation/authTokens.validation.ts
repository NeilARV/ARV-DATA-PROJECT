import { z } from 'zod';

// Shared validation for any raw link token arriving in a request body. Bounded length
// guards against oversized payloads; the real check is the hashed lookup in the service.
export const tokenStringSchema = z.string().min(1, 'Token is required').max(512, 'Invalid token');

export const verifyEmailSchema = z.object({
    token: tokenStringSchema,
});

export type VerifyEmailData = z.infer<typeof verifyEmailSchema>;
