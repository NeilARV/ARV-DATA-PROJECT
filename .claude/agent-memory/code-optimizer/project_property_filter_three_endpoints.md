---
name: property-filter-three-endpoints
description: Property filter state feeds three backend endpoints (list, map, zip-counts) via one shared query builder — new filters must be honored in all three services or views diverge
metadata:
  type: project
---

`client/src/lib/propertyQueryParams.ts` (`buildPropertyQueryParams`) is the single query-string builder consumed by THREE client hooks that hit THREE separate backend services:

- `useProperties.tsx` → `getProperties` in `server/services/properties/properties.services.ts` (list/count)
- `useMap.tsx` → `getMapProperties` in `server/services/properties/maps.services.ts` (map pins)
- `useZipCounts.ts` → zip counts in `server/services/properties/zipCounts.services.ts`

All three independently build a company `EXISTS` subquery with `(pt.buyer_id = ... OR pt.seller_id = ...)`. They do NOT share SQL.

**Why:** Each endpoint is optimized differently (map returns pin colors, zipCounts pre-filters by county for performance), so the buyer/seller condition is duplicated rather than shared.

**How to apply:** When any new property filter is added to `PropertyFilters` and appended in `buildPropertyQueryParams`, verify it is read by the controller AND honored in the service for all three endpoints. A filter wired only into `getProperties` will make the map and zip-count totals disagree with the list. (Observed 2026-06-04: `companyRole` was added to the list service only; maps/zipCounts controllers don't even extract it.)
