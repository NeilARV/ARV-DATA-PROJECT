---
name: deals-request-info-now-gated
description: POST /api/deals/:id/request-info requires requireSub(basic/pro/premium)+bypassRoles; verify-email gate was removed; client still gates with requireAuth only
metadata:
  type: project
---

`POST /api/deals/:id/request-info` is non-public: `requireSub(['basic','pro','premium'], { bypassRoles: ALL_TEAM_ROLES })`. The `requireVerifiedEmail` gate that briefly sat here was REMOVED in the email-verification unwind (verification is now a soft nudge only, never an access gate — see [[project_email_verification_soft_nudge]]).

The deals client (`DealsPageContent.tsx`) still gates the Request Info button with `requireAuth(...)` only (not `requireSubscription`), and `requestDealInfo.onError` shows a generic destructive toast that ignores the `403 Forbidden - Subscription required` response. Same auth-only-vs-requireSub mismatch on the offers button. With the whole Deals page now wrapped in `<AppAccessGate>`, a no-access user never reaches these buttons — so the mismatch is latent unless the page gate is bypassed.

**Why:** Phase-1 verification gate was added then unwound; the route stayed on requireSub. Client gating was never tightened to match.

**How to apply:** When reviewing deals request-info/offers flows, check client gating matches server `requireSub` and that error handlers surface the 403 (not a generic failure toast). Low practical impact while AppAccessGate fronts the page.
