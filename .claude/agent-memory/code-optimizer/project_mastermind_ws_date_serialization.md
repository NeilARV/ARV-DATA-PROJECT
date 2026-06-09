---
name: mastermind-ws-date-serialization
description: Mastermind WS broadcasts raw EnrichedMessage (Date fields); JSON.stringify is the only thing converting Date->ISO to match the wire DTO
metadata:
  type: project
---

The Mastermind WebSocket layer broadcasts `EnrichedMessage` objects (which carry JS `Date` fields for createdAt/updatedAt) directly from the message controllers, but the shared wire contract `MastermindMessageWire` (shared/mastermind/events.ts) types those fields as ISO `string`.

**Why:** There is no explicit serialization step. The conversion happens implicitly inside `registry.send` via `JSON.stringify`, which renders Date as an ISO string. The client's `mergeMessages` then does string comparison on `createdAt`, which only works because the wire value is an ISO string (lexicographically sortable).

**How to apply:** If anyone refactors broadcasting to send pre-serialized payloads, build messages by hand, or stops routing through `JSON.stringify`, the Date->ISO conversion and the client-side string sort can silently break. Treat the controller-side broadcast + JSON.stringify as a load-bearing coupling. Related: [[project_property_filter_three_endpoints]] (similar "multiple consumers of one shape" hazard).
