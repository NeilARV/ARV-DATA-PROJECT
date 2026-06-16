---
name: app-access-gating
description: Data feeds/table + whole Deals page gated behind app-access (any tier OR team role); map/detail/zip-counts/suggestions/streetview stay public
metadata:
  type: project
---

App-access = any subscription tier OR any team role, enforced via `requireSub(['basic','pro','premium'], { bypassRoles: [...ALL_TEAM_ROLES] })`.

Server gates: `GET /api/properties` (bare list only), `GET /api/deals`, `/api/deals/msas`, `/api/deals/:id`. PUBLIC on properties: `/map`, `/zip-counts`, `/suggestions`, `/streetview`, `/:id`, `/:id/transactions` — so the anonymous map teaser + company directory keep working.

Client: `useProperties` list query `enabled: view !== 'map' && canAccessApp`. `Home.tsx` renders map+directory to everyone, shows `<AppAccessLocked>` for table/feeds when `!canAccessApp` (default view is 'map', so anon lands public). `Deals.tsx` wraps content in `<AppAccessGate>` (replaced the old authGate-dialog effect; authGate dialog is still used by useRequireAuth elsewhere — not orphaned).

`AppAccessGate` (`client/src/components/auth/AppAccessGate.tsx`) holds a spinner while `isLoading || (isAuthenticated && isAdminStatusLoading)`, so a real subscriber never flashes the locked screen — correctly addresses the [[useauth-isloading-scope]] flash window.

**Why:** Gate the data table/feeds and deals marketplace to subscribers/team while keeping the public map as a teaser.

**How to apply:** Any NEW property read that should be public must NOT sit behind the list gate; any new gated deals read must add requireDealAccess. New client query firing for anon map visitors must be checked against the public/gated split (see [[project_property_filter_three_endpoints]]).
