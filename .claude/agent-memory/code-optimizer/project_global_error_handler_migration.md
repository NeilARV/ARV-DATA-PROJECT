---
name: global-error-handler-migration
description: Phase 0 global Express error-handling migration — utils added, no routes migrated yet; multer errors become 500s pending attachments-domain work
metadata:
  type: project
---

Project is migrating from per-controller `handleServiceError(res, err, msg)` to a global Express error-handling middleware (`server/middleware/errorHandler.ts`). Controllers will eventually `throw new ServiceError(...)` and async route handlers will be wrapped in `asyncHandler` (`server/utils/asyncHandler.ts`) to forward rejections. `validate()` (`server/utils/validate.ts`) throws `ServiceError(400, msg, error.errors)`.

**Why:** Old inline handler in app.ts trusted any `err.statusCode` and echoed `err.message` for all errors — an info leak. New handler only exposes messages for ServiceError and http-errors with `expose === true`; everything else is logged + generic 500.

**How to apply:**
- The client validation contract is `{ message, errors }` where `errors` is the raw Zod `error.errors` array. `serviceErrorBody()` must keep producing exactly this. ~20 controllers still use the old inline `{ message, errors: validation.error.errors }` shape — see [[shared-serviceerror-uuid-utils]].
- body-parser 400 (malformed JSON) and 413 (payload too large) carry `expose: true` and still surface as 4xx — verified, do not flag as regression.
- **MulterError carries no status and `expose: undefined`**, so file-size-limit errors become generic 500s under the new handler. This is NOT a regression (old handler also returned 500; no per-route multer handling exists), but the attachments-domain migration should add a MulterError->413/400 branch to errorHandler. Mastermind bucket enforces <=10MB.
- New util files import one-directionally (errorHandler/validate -> serviceError); no circular imports. Keep it that way.
