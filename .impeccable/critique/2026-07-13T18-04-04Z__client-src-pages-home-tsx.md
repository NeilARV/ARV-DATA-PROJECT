---
target: client/src/pages/Home.tsx
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-07-13T18-04-04Z
slug: client-src-pages-home-tsx
---
# Critique — client/src/pages/Home.tsx (marketing landing page)

Method: dual-agent (A: design review · B: detector + grep evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Scroll-CTAs and route-CTAs look identical; no cue that "View live deals" leaves the page into a login gate. |
| 2 | Match System / Real World | 3 | Strong domain voice, but "double closes"/"REO"/"spread" land unglossed on a first-timer. |
| 3 | User Control and Freedom | 3 | Slider is keyboard-operable; no back-to-top on a long page. |
| 4 | Consistency and Standards | 2 | "9 markets" (Hero/stats/marquee) vs "six major markets" (ClosingCTA); "Get started free" vs "Exclusive for ARV clients." |
| 5 | Error Prevention | 2 | App CTAs dump logged-out users into a login wall unannounced; footer About/Careers/Privacy/Terms are dead buttons. |
| 6 | Recognition Rather Than Recall | 3 | Interactive previews show the product, but the four apps appear twice (bento + long-form). |
| 7 | Flexibility and Efficiency | 3 | DataVisual view-tabs and the reveal slider let users self-explore. |
| 8 | Aesthetic and Minimalist Design | 2 | Pill-eyebrow on every section, count-up trio, browser chrome, apps shown twice → busy and template-flavored. |
| 9 | Error Recovery | 3 | Dead footer links and gated CTAs give no feedback or recovery path. |
| 10 | Help and Documentation | 3 | Nothing answers "how do I get access / what does it cost / am I eligible?" |
| **Total** | | **27/40** | **Acceptable — solid bones, real drag on consistency + minimalism** |

## Anti-Patterns Verdict

**Partial AI-slop.** Escapes a flat "yes" only because of two genuinely bespoke, on-brand centerpieces — the ArvRevealSlider (drag As-Is → ARV) and the MiniMap whose pins/colors mirror the real PropertyMap. Everything around them is competent template: glow-blob hero → market marquee → bento → alternating feature blocks → single testimonial → glow CTA → 4-col footer. Template tells present: hero-metric count-up trio (Hero.tsx:102-106), browser-window-chrome mock with traffic-light dots (Hero.tsx:18-25), tracked-uppercase eyebrows repeated across sections (AppSections.tsx:67, Features.tsx:142, MarketsMarquee.tsx:24), a Pill eyebrow + Sparkles icon opening most sections, decorative `bg-primary/20 blur-3xl` glow blobs (Hero.tsx:64, ClosingCTA.tsx:12). No absolute bans fired: no gradient text, no side-stripe borders, no numbered scaffolding, overflow well-guarded.

**Deterministic scan:** detector exit 2, 4 advisory findings — 3× `border-radius:9999px` (primitives.tsx:47/56/64) and 1× undocumented color `#9333EA` (primitives.tsx:271). Both largely false positives: 9999px is the `rounded-full` pill idiom, and #9333EA is the documented "Wholesale" deal-type color. The real standards signal is broader: ~20 hardcoded hex values across AppSections.tsx/primitives.tsx (the deal-type/status palette inlined rather than referenced as tokens), plus 2 decorative `backdrop-blur` uses (MarketingHeader.tsx:95, primitives.tsx:282). No browser overlay — no browser tool exposed this run.

## What's Working

- **ArvRevealSlider** — bespoke, keyboard-accessible (`role="slider"`, arrow keys, `aria-valuenow`), and it makes the product's core promise physical. This is the page's real POV.
- **MiniMap / DataVisual** — schematic mocks whose pin colors, teardrop SVG, and status badges are deliberately matched to the real tool, so the previews feel like the actual product, not stock art.
- **Token discipline & motion restraint** — near-total semantic-token use, flat border-ladder instead of shadows, reduced-motion handling on the custom animations (useCountUp, Reveal, marquee).

## Priority Issues

**[P1] Internal data contradiction: 9 markets vs. 6.** Hero pill "Now live across 9 markets" + StatItem "9 Active markets" + a 9-city marquee (adds Riverside/Seattle/Tampa beyond the brand's 6 MSAs) contradict ClosingCTA's "six major markets." For a product whose entire positioning is data accuracy, a self-contradicting headline number is the fastest trust-killer. Fix: one source of truth for the market count + city list, propagated to pill, stat, marquee, and closing copy.

**[P1] "Get started free" contradicts the "exclusive / clients-only" promise.** Hero: "Exclusive for ARV clients and partners"; ClosingCTA: "Get started free" → /signup. No pricing, eligibility, or "request access" framing anywhere, so the visitor can't tell if they can even use this — conversion dies at the decision point. Fix: reconcile the message and add one line on who qualifies / what happens next.

**[P1] Primary-CTA and accent-text contrast fail AA (~1.9:1).** `btnPrimary` is white on `--primary` (hsl 192 67% 65%) ≈ 1.9:1; the same light cyan used *as text* (Hero headline span Hero.tsx:75, the four eyebrows, "Learn more" links) also fails. This is the single biggest legibility issue and hits the most-clicked elements. Caveat: it's the app-wide token pairing, not a Home bug, and PRODUCT.md sets no formal WCAG target — so it's a system-level judgment call, not an auto-fix. Fix (if taken): darker cyan for text/badges on light bg, and darken the fill or flip button text to a dark foreground; verify 4.5:1 (3:1 large).

**[P2] App/deal CTAs silently drop logged-out visitors into a login gate; footer links are dead.** "View live deals" (Hero.tsx:95) and every FeatureSection CTA route to login-gated apps with no warning; footer About/Careers/Privacy/Terms render as buttons that swallow the click and do nothing. Both erode credibility (missing Privacy/Terms is also a trust signal). Fix: label gated CTAs ("Sign in to view deals") or route through signup with return path; render placeholder footer items as non-interactive text or ship the pages.

**[P2] The page is the modal proptech template, and it shows the four apps twice.** Section skeleton is the category-standard landing page, and the four apps appear once as the Features bento then again in full in AppSections — roughly doubling scroll length with "Learn more" links that only jump to content the user reaches anyway. Combined with a pill eyebrow on every section, the count-up trio, and the browser-chrome mock, the page reads more "generated" than the ArvRevealSlider deserves. Fix: cut the duplication (one deep treatment), vary the section openings, and lead with the bespoke slider.

## Persona Red Flags

**Jordan (first-timer):** Can't tell if the product is free or invite-only; meets "double closes / spread / REO" unexplained in the Hero subhead; "View live deals" lands on an unexpected login wall.

**Riley (stress tester):** Instantly catches 9-vs-6 markets and the three invented cities in the marquee; clicks About/Careers/Privacy/Terms → nothing; sees "Loved by investors" (plural) backed by exactly one testimonial whose avatar loads from a raw `/testimonials/*.jpg` path that 404s conspicuously if missing.

**Casey (distracted mobile):** Very long page (apps shown twice) with simultaneous motion — marquee + LiveDot ping + two `animate-ping` map dots (not reduced-motion-gated, unlike the custom animations) + reveal-on-scroll + hover-translate cards. The centered nav is `hidden lg:flex`, so mobile has no section links at all.

**Wholesaler/flipper arriving mid-work (project persona):** Expects the tool to already know their market; every mock is hard-coded Denver ("Denver, CO · 142 transactions" and every preview row). A San Diego or Port St. Lucie operator sees zero reflection of their market and no "choose your market" affordance — weakening the "insider who knows your turf" promise.

## Minor Observations

- Sparkles icon as a section-opener signature (Hero.tsx:69, ArvRevealSlider.tsx:25) reads AI-coded — swap for domain icons.
- `$489K` repeats across HeroMock, ArvReveal, and DealVisual — a sharp analyst varies the mock figures.
- StatItem count-up animates single digits (9/4/4) — motion for its own sake; the payoff of watching "4" tick is negligible.
- ~20 hardcoded hex values (deal-type/status palette) inlined in AppSections.tsx/primitives.tsx — the sanctioned categorical palette exists; reference tokens per DS.NO-HARDCODED-COLOR.
- ArvReveal has no "drag me" hint beyond body copy; a subtle initial nudge (reduced-motion-safe) would signal interactivity.

## Questions to Consider

1. If the product's whole reason to exist is trustworthy data, why does the page state two market counts and invent three cities the brand doesn't claim?
2. You show all four apps as a bento, then again in full — what does the second pass earn, and is the doubled scroll costing you the mobile visitor before the CTA?
3. The ArvRevealSlider is the one moment that feels like *your* product — why is it buried as section three behind a stock glow-hero instead of greeting the visitor?
