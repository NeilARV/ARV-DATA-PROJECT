---
name: require-access-engine
description: requireAccess.ts is the single access engine; requireRole/requireSub are thin wrappers preserving exact 403/500 message strings and role-before-tier ordering
metadata:
  type: project
---

`server/middleware/requireAccess.ts` is the single access-control engine: pass if user has ANY allowed role OR ANY allowed tier (roles checked first → a qualifying role short-circuits the tier query), 401 with no session, 403 otherwise. Configurable `forbiddenMessage` / `errorMessage`.

`requireRole.ts` and `requireSub.ts` are now thin wrappers over it:
- `requireRole(roles)` → `requireAccess({ roles, forbiddenMessage: 'Forbidden - Required role access', errorMessage: 'Error checking role' })`
- `requireSub(tiers, { bypassRoles })` → `requireAccess({ tiers, roles: bypassRoles ?? [], forbiddenMessage: 'Forbidden - Subscription required', errorMessage: 'Error checking subscription' })`

The empty-input throws live in BOTH layers: the wrappers throw their own `requireRole/requireSub: at least one ... must be provided`, and requireAccess throws if both arrays are empty. Wrapper guards fire first, so the wrapper-specific message is what callers see.

**Why:** Consolidation to remove duplicated role/tier query logic while keeping each wrapper's exact contract (status codes, message strings, role-bypass-before-tier ordering) so existing access-control integration tests stay green.

**How to apply:** When auditing access changes, parity is preserved as long as wrappers keep passing their original message strings. Behavior verified equivalent to pre-refactor: role lookup before tier, same 401/403/500 codes. requireMastermind still builds on requireSub unchanged.
