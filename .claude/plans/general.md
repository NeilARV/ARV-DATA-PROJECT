# General — deferred items / notes

## Deferred

- **Deals action buttons client-gate on `requireAuth` only** (`client/src/components/deals/DealsPageContent.tsx` — `onSubmitOffer`, `onRequestInfo`, and `requestDealInfo.onError`). The server routes require `requireSub(['basic','pro','premium'], { bypassRoles })`, so the client gate is looser than the server. Currently **latent**: the whole Deals page is fronted by `<AppAccessGate>`, so a no-access user can't reach those buttons. If the page-level gate is ever removed or the buttons surface elsewhere, tighten these to `requireSubscription` and surface the `403 Forbidden - Subscription required` instead of the generic error toast. (Noted 2026-06-16.)
