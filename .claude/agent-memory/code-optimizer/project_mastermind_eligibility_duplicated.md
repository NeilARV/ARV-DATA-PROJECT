---
name: mastermind-eligibility-duplicated
description: Mastermind access rule (tiers + bypass roles) is copy-pasted in 3+ files; changes must update all of them or candidate list diverges from gate
metadata:
  type: project
---

The Mastermind eligibility rule — `MASTERMIND_TIERS = ['basic','pro','premium']` plus `MASTERMIND_BYPASS_ROLES = ['admin','owner','relationship-manager','member']` — is hand-duplicated in at least:
- `server/middleware/requireMastermind.ts` (the gate + `isMastermindEligible`)
- `server/services/channels/channels.services.ts` (`listChannelMentionCandidates`, the @mention candidate pool)

**Why:** These two must stay in lockstep — the mention candidate list should equal the set of users who can access Mastermind. As of the feature/mastermind branch they match exactly (same constants, same join shape, no subscription status/active column exists on `subscriptions`).

**How to apply:** When reviewing any change to Mastermind access rules or the mention candidate query, check that BOTH constants were updated in BOTH files. A drift means users could be mentionable but not have access, or vice versa. Relates to [[useauth-isloading-scope]] (frontend `canAccessApp` is the client mirror of this same rule).
