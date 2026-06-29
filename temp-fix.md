# Map Overhaul — Deferred Fixes (ALL RESOLVED ✅)

All items below were implemented on `feat/map-overhaul`. `npm run check` is green and the map
route integration tests (7) pass.

## Major — RESOLVED

### Extent/empty-state ignored price/beds/baths/type filters ✅
- **Fix:** Pushed price/beds/baths/type into the shared `buildMapIdConditions`
  (`server/services/properties/maps.services.ts`) so the **pins, extent, and region-count** queries
  all respect them — the extent count + auto-framing now reflect the truly filtered set, so the
  empty-state copy is correct. `structures`/`last_sales` are joined only when a beds/baths or price
  filter is active (`$dynamic()` + `MapJoinRequirements`). The client `matchesFiltersForPin` filter
  is retained as the final authority for the wholesale-seller nuance the server status filter can't
  express. Wired through the controller (Zod) and `buildPropertyQueryParams` (forMapPins + forRegions).

## Non-blocking / polish — RESOLVED

### Dead `page`/`limit` params on map query builders ✅
- **Fix:** `page`/`limit` are now optional in `BuildPropertyQueryParamsOptions` and only appended on
  the full list/feed path. Removed from the `forMapPins`/`forRegions` call sites in `useMap.tsx` and
  `useZipCounts.ts`.

### Region-counts query over-refetched on company/sortBy change ✅
- **Fix:** Narrowed `mapRegionsQueryUrl` deps to status/date + the attribute filters; dropped
  `company`/`sortBy` (inert for the cross-region overview).

### No server-side LIMIT on `getMapProperties` — ACCEPTED AS-IS
- Left intentionally unbounded: the viewport bbox + overview gate bound the set, and clustering
  renders it. Documented here as a known, acceptable trade-off rather than adding a cap.

### Effect-order coupling between ZoomLock and Camera controllers ✅
- **Fix:** `CameraController` (now in `mapControllers.tsx`) raises `maxZoom` to at least the target
  zoom before `setView`, so a same-commit lock-flip + camera move is no longer order-dependent.
