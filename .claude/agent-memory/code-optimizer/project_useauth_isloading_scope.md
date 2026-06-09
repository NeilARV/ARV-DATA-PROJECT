---
name: useauth-isloading-scope
description: useAuth().isLoading only covers /api/auth/me, not the admin-status query that drives canAccessApp — gates can flash
metadata:
  type: project
---

`useAuth().isLoading` reflects only the `/api/auth/me` query. The separate `/api/admin/status` query (which produces `roles`, `subscriptionTier`, and therefore `canAccessApp`) has its own `isAdminStatusLoading`, exposed only as the combined `isAdminStatusLoading` return value — NOT folded into `isLoading`.

`canAccessApp` is deliberately true while admin-status loads (`isAdminStatusLoading || subscriptionTier !== null || hasTeamRole`) to avoid blocking during hydration.

**Why:** A gate written as `if (isLoading) spinner; else if (!isAuthenticated) ...; else if (!canAccessApp) blocked` will pass the `isLoading` check as soon as `/api/auth/me` resolves, while admin-status may still be in flight. During that window `canAccessApp` is permissive (true), so the user sees the full app briefly even if they ultimately lack access — and any query gated on `enabled: canAccessApp` fires early. No hard error, but a possible content flash / premature fetch.

**How to apply:** When reviewing a `canAccessApp`/`canAccessAdminPanel` gate, check whether it also waits on `isAdminStatusLoading` before rendering the blocked/allowed branch. If a definitive "access denied" screen matters, gate on `isAdminStatusLoading` too. See [[project_property_filter_three_endpoints]] style of cross-cutting concerns.
