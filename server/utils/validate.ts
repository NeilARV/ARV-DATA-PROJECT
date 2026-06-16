import type { ZodSchema } from 'zod';
import { ServiceError } from 'server/lib/error';

// Validates a request payload against a Zod schema. Returns the typed data on success, or throws
// ServiceError(400) carrying the Zod issues (surfaced to the client as `errors` by the global
// errorHandler). Replaces the repeated safeParse + 400 block in controllers. Pass `message` to
// keep an endpoint-specific wording (e.g. 'Invalid login data').
export function validate<T>(schema: ZodSchema<T>, data: unknown, message = 'Invalid input'): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new ServiceError(400, message, result.error.errors);
    }
    return result.data;
}
