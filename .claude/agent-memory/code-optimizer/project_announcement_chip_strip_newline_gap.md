---
name: announcement-chip-strip-newline-gap
description: ANNOUNCEMENT_CHIP_RE strips the admin-only @announcement chip but its .*? has no dotall flag, so a chip with a newline in its text survives the strip AND is still detected as a broadcast — non-admin announcement bypass
metadata:
  type: project
---

`stripAnnouncementChips` in `server/services/messages/messages.services.ts` uses
`ANNOUNCEMENT_CHIP_RE = /<span\b[^>]*\bdata-id="@announcement"[^>]*>.*?<\/span>/gi`.
The `.*?` between the open `<span>` and `</span>` does NOT match newlines (no `s`/dotall flag).
`sanitizeMessageHtml` preserves newlines inside chip text, and message `content` is validated only
by `z.string().max(10000)` (no newline normalization). So a non-admin can POST/edit a tampered chip
like `<span ... data-id="@announcement">line1\nline2</span>` and the strip regex fails to match it.

Consequences when bypassed: the chip persists in stored HTML, renders for everyone, and
`parseBroadcastSentinels` (which only inspects the open-tag attrs, unaffected by the newline) still
reports `@announcement` -> `mentionedAnnouncement: true` -> announcement fan-out to all eligible
users. This defeats the entire admin/owner-only point of the feature.

**Why:** the two functions disagree on what a "chip" is — detection keys on the open tag, stripping
requires a same-line `</span>`. Detection sees more than stripping can remove.

**How to apply:** the strip and the detection must agree. Either give the regex the `s` flag (and
verify it still can't over-match across two adjacent chips — lazy `.*?` to first `</span>` is fine),
or — more robust — drive both off the same span-by-span parse (`userMentionSpans` already splits
correctly) rather than a content-spanning regex. When reviewing any future "strip a chip server-side"
gate, confirm the stripper handles every byte the sanitizer can emit (newlines, entities like
`&lt;/span&gt;`, self-closing `<span/>` which sanitize-html rewrites to an open+close pair).
Related: [[mastermind-message-id-routes-bypass-channel-guard]] — same theme of a guard that does not
cover every reachable shape of input.
