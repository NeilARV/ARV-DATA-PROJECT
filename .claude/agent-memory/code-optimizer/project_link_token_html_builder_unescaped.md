---
name: link-token-html-builder-unescaped
description: sendLinkEmail's buildHtml interpolates heading/bodyLines/ctaLabel/url raw — every future link email (verify/reset/invite) inherits the injection risk
metadata:
  type: project
---

`server/services/postmark/linkEmail.services.ts` `buildHtml` interpolates `heading`, `bodyLines`, `ctaLabel`, `footerNote`, and `url` into HTML with NO escaping. `url` sits inside `href="${url}"`.

**Why:** This is the shared Phase-0 builder that email verification, password reset, and invite flows are all designed to route through. Invite flows are the likely first source of user-controlled fields (inviter name/message), and any user-derived value reaches the email unescaped — letting a crafted value rewrite the trusted CTA link.

**How to apply:** When reviewing any new caller of `sendLinkEmail`, check whether it passes user-controlled data into these fields. Until `buildHtml` HTML-escapes its inputs (and encodes `url`), treat new callers with dynamic content as a CRITICAL injection finding rather than a per-caller issue. `buildText` is safe (plain text). Related: [[link-token-foundation-phase0]].
