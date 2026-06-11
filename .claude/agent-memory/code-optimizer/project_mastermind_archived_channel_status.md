---
name: mastermind-archived-channel-status
description: Mastermind messages — archived channel returns 404 on read paths but 403 on the create path, on purpose
metadata:
  type: project
---

In the Mastermind messages service (`server/services/messages/messages.services.ts`), an archived (or non-public) channel is handled deliberately differently per operation:

- Read paths (`getReadableChannelOrThrow`, used by list + backfill): archived/non-public/unknown → **404** (don't leak channel existence to readers).
- Create path (`createMessage`): non-public → 404, but archived → **403 "This channel is archived"** (writers are told the channel is frozen).

**Why:** Intentional asymmetry — readers shouldn't learn an archived channel exists; writers need an actionable error. Confirmed as a design rule during the Part 3 review, not a bug.

**How to apply:** Do NOT flag the duplicated channel lookup in `createMessage` as "should reuse `getReadableChannelOrThrow`" — consolidating them would silently change the read-path 404 contract into a 403. If a future change unifies these, treat it as a regression. Relates to [[project_mastermind_soft_delete]].
