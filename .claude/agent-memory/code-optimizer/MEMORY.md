# Memory Index

- [No DB transactions in services](project_no_db_transactions.md) — server has zero db.transaction usage; multi-write flows are non-atomic, flag missing transactions as real risk
- [Property filter feeds three endpoints](project_property_filter_three_endpoints.md) — one query builder feeds list/map/zip-counts; new filters must be honored in all three services or views diverge
- [companyMembers.role is nullable](project_companymembers_nullable_role.md) — admin-set memberships insert null role; consumers reading m.role must handle null
- [Category delete cascades](project_category_delete_cascades.md) — deleting a category cascade-drops vendor_categories/post_categories links silently; flag missing guard/warning
- [Mastermind soft-delete](project_mastermind_soft_delete.md) — messages are soft-delete only; judge cascade FKs to messages.id against never-hard-delete principle
- [Mastermind archived-channel status](project_mastermind_archived_channel_status.md) — archived channel = 404 on read paths but 403 on create, on purpose; don't consolidate the duplicate lookup
- [Mastermind WS date serialization](project_mastermind_ws_date_serialization.md) — WS broadcasts raw EnrichedMessage Dates; JSON.stringify is the only Date->ISO step matching the wire DTO
- [useAuth isLoading scope](project_useauth_isloading_scope.md) — isLoading only covers /api/auth/me, not admin-status; canAccessApp gates can flash before access is decided
- [Mastermind eligibility duplicated](project_mastermind_eligibility_duplicated.md) — tiers+bypass-roles rule copy-pasted across requireMastermind and mention-candidate query; both must change together
- [Mastermind WS delivery scope](project_mastermind_ws_delivery_scope.md) — MessageCreated only reaches subscribers of that channel; client subscribes to active channel only — cross-channel live features need broadcastToUser
- [Mastermind reactions broadcast-only](project_mastermind_reactions_broadcast_only.md) — no optimistic update; idempotent add/remove drifts counts if WS delta is broadcast unconditionally without checking DB changed
- [Message-id routes bypass channel guard](project_mastermind_message_id_routes_bypass_channel_guard.md) — /api/messages/:id edit/delete/reactions resolve by message id and skip getReadableChannelOrThrow; re-audit each when a channel-level rule (admin-only) ships
- [Mastermind temp admin gate](project_mastermind_temp_admin_gate.md) — TEMPORARY canAccessMastermind=isOwner||isAdmin hides UI; socket+notifications queries left on broader canAccessApp on purpose
- [Mastermind edit attachments authoritative](project_mastermind_edit_attachments_authoritative.md) — edit sends full desired attachment set, server reconciles by fileUrl; cache no longer preserves cached attachments on MessageUpdated
