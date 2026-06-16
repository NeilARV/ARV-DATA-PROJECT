// Base for service-layer errors that carry an HTTP status. Domain services subclass this
// (e.g. MessageServiceError) so call sites read clearly and can be matched by type. The global
// errorHandler translates any ServiceError into its status; `details` (e.g. Zod issues) is
// surfaced to the client as the `errors` field when present.
export class ServiceError extends Error {
    constructor(
        public statusCode: number,
        message: string,
        public details?: unknown,
    ) {
        super(message);
        this.name = new.target.name;
    }
}
