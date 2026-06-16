---
name: shared-serviceerror-uuid-utils
description: server/utils/serviceError.ts and uuid.ts exist but only the messages domain uses them; 5 other domains keep identical inline copies — migration must move error class + handleServiceError together
metadata:
  type: project
---

`server/utils/serviceError.ts` (base `ServiceError extends Error` with statusCode + `this.name = new.target.name`, plus `handleServiceError(res, err, fallback)`) and `server/utils/uuid.ts` (`UUID_REGEX` + `isUuid`) are the canonical dedup targets.

As of 2026-06-15 only the Mastermind messages domain (messages/reactions/attachments services + controllers) adopted them. Still-duplicated inline copies live in:
- `UUID_REGEX`: channels.controllers, pins.controllers, deals.controllers, notifications.controllers, websocket/connection.ts
- `handleServiceError`: channels.controllers, pins.controllers, deals.controllers, notifications.controllers, posts.controllers
- status-carrying error classes still `extends Error` (not `ServiceError`): channels.services, pins.services, deals.services, notifications.services, posts.services

**Why:** the shared `handleServiceError` matches `instanceof ServiceError` (base). Each un-migrated domain's local copy still matches its own specific subclass (which still `extends Error`), so they are internally consistent today.

**How to apply:** when reviewing a migration of one of those domains, ensure the error class switch to `extends ServiceError {}` AND the controller switch to the shared `handleServiceError` happen in the same change — otherwise a local `handleServiceError` keyed on the now-removed specific class breaks. Also note the widening: the shared handler will surface the status of ANY `ServiceError` subclass that reaches a controller's catch, so verify no service leaks another domain's `ServiceError` with a misleading status. Relates to [[mastermind-channel-access-gotcha]].
