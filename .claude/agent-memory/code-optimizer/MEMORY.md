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
