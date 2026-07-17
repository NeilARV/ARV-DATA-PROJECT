# County-granularity branch — deferred review findings

Findings from the final two-axis review (2026-07-17) of `feature/county-granularity` vs `main`, against spec issues #111 and #130. Noted for later — none were judged merge blockers, but Standards #1 and Spec #1/#5 deserve a deliberate decision before or shortly after merge.

## Standards

### Hard violations (documented standards)

1. **RX.EFFECT-DEPS** — `client/src/pages/Data.tsx`: the new effect `useEffect(() => { syncSelectionToFilters(); ... }, [navSelectionKey])` silences the exhaustive-deps lint instead of fixing the dependency (`syncSelectionToFilters` is recreated every render and omitted). The mount-effect disable is pre-existing; this one was added by the branch.
2. **DB.LIMIT1-DESTRUCTURE** — `server/services/subscriptions/countySubscriptions.services.ts`, `seedHomeCountySubscription`: single-row destructure of the `msas` lookup without `.limit(1)`. Sibling queries in the same change (admin services, recipient resolver) chain it correctly.
3. **RX.NO-RAW-FETCH** (borderline) — `client/src/components/data/LeaderboardDialog.tsx`: the branch rewrites the queryFn for multi-county params but keeps raw `fetch(..., { credentials: 'include' })` instead of `apiRequest`. Pre-existing pattern perpetuated in a rewritten hunk.

### Baseline smells (judgement calls)

4. **Duplicated Code** — `shared/constants/countyToMsa.ts` exports both `getMsaNameFromCounty` (→ `undefined`, still used by EmailListTab) and the newer `getMsaForCounty` (→ `null`): two exports, one semantic, divergent null conventions. Consolidate on one.
5. **Duplicated Code** — `server/services/email/recipientResolver.ts`: the tracked-county guard + scope-conditions block is verbatim-duplicated between `resolveDealRecipients` and `resolveWhitelistDealRecipients` (only the table differs); the "fold per-county rows into one recipient" Map shape recurs three times in the file. Extract the shared shape.
6. **Duplicated Code** — county query-param normalization (`Array.isArray ? map(toString) : toString`) is extracted as `countyParam` in `companies.controllers.ts` but re-inlined in `deals.controllers.ts`, `property.controllers.ts`, and `zipCounts.controllers.ts`. Hoist to `server/utils`.
7. **Duplicated Code** — `msaShortName` lives in `client/src/lib/county.ts`, yet `server/services/deals/deals.services.ts` still inlines the same `split('-')[0].split(',')[0].trim()` shape. `shared/` could own it for both sides.
8. **Primitive Obsession (mild)** — the `'neil@arvfinance.com'` poster-exception literal in `recipientResolver.ts` (moved, not introduced); a named constant would carry the why.
9. **TST.NAME (soft)** — jsdom component tests (e.g. `tests/client/components/MsaCountyPicker.test.tsx`) drop the `fn — condition — outcome` naming shape the HTTP integration tests follow. Coverage itself is strong.

## Spec (#111 / #130)

Overall verdict: faithful, near-complete implementation of both specs. Deviations:

### Missing / partial

1. **Legacy location search still live on `/deals-preview`** — #111 says the free-text location search is superseded by the picker. Done on `/deals`, but `client/src/pages/DealsPreview.tsx` still renders `DealsToolbar` → `DealsLocationSearch` with the old `COUNTIES`/MSA/city/zip machinery. Decide: migrate `/deals-preview` to the picker, or retire the old machinery deliberately.

### Scope creep / unrequested behavior

2. **Whitelist PATCH contract tightened beyond spec** — `updateEmailSubscriptionListSchema` (`database/updates/users.update.ts`) is now `.strict()` and requires `relationshipManagerId` to be uuid-or-null; previously `''` cleared the RM. A caller sending `''` (or extra keys) now gets 400. Spec only asked for the counties replace-list.
3. **`requestDealInfo` emails also use the new deep-link format** — the deal-info request email (not the notification email) switched to `buildDealDeepLink` msa+counties URLs (`server/services/deals/deals.services.ts`). Consistent, but neither spec mentions that email.
4. **Unrequested URL contract in `parseMsaCountyParams`** — `?msa=X` with *no* `counties` param means "all counties of X", while `counties=` (empty) means none. Sensible (it backs the MSA-fallback deep link) but not in the spec.

### Implemented but arguably not as specified

5. **Companion-city fan-out never spans two MSAs** — #130: "companion city → every entry with any county in primary ∪ companion MSAs". In practice `resolveMsaId`'s Tier-0 override stores Temecula/Murrieta deals with msaId = San Diego, so `resolveDealRecipients` computes `msaIds = [San Diego]` only — Riverside-MSA subscribers/whitelist entries (the deal's geographic MSA) are never included. Preserves pre-branch behavior and satisfies story 11 ("keep reaching San Diego subscribers"), but if "primary" meant the deal's physical MSA, the fan-out is narrower than the spec line reads. Decide which reading is intended and either document or widen.
