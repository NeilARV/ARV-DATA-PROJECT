---
name: mastermind-temp-admin-gate
description: TEMPORARY frontend gate limits Mastermind to admin/owner via canAccessMastermind; broader canAccessApp data-layer gates (socket, notifications) were intentionally left untouched
metadata:
  type: project
---

Mastermind has a TEMPORARY frontend-only restriction to admin/owner roles while it runs on the dev/Replit server (pending a DB migration before general release).

Implementation: `useAuth()` exposes `canAccessMastermind = isOwner || isAdmin` (both false during admin-status loading, so the gate is restrictive during hydration — the inverse of `canAccessApp`, which is permissive during loading; see [[project_useauth_isloading_scope]]). UI consumers switched from `canAccessApp` to `canAccessMastermind`: Header desktop button + mobile-menu item + NotificationBell render, and Mastermind.tsx channels-query `enabled` + access gate.

NOT switched (still on `canAccessApp`): the `MastermindSocketProvider` WS connection (`use-mastermind-socket.tsx`) and the `useNotifications` query (`use-notifications.ts`). So non-admin subscribers/team-members still open the WS and fetch `/api/notifications` even though they can no longer see Mastermind UI. Backend enforces real channel access separately, so this is a harmless redundancy, not a security hole.

**Why:** Deliberate scoping — the change is a UX hide-it gate, not an access-control change. Reversal is a single line: switch consumers back to `canAccessApp` and delete `canAccessMastermind`.

**How to apply:** When this temporary gate is removed, also re-check that `canAccessMastermind` has no remaining references. When auditing flash/early-fetch behavior, remember the data layer (socket/notifications) is gated more loosely than the UI.
