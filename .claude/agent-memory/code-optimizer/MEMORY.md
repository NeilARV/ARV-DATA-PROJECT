# Memory Index

- [No DB transactions in services](project_no_db_transactions.md) — server has zero db.transaction usage; multi-write flows are non-atomic, flag missing transactions as real risk
- [Property filter feeds three endpoints](project_property_filter_three_endpoints.md) — one query builder feeds list/map/zip-counts; new filters must be honored in all three services or views diverge
- [companyMembers.role is nullable](project_companymembers_nullable_role.md) — admin-set memberships insert null role; consumers reading m.role must handle null
- [Category delete cascades](project_category_delete_cascades.md) — deleting a category cascade-drops vendor_categories/post_categories links silently; flag missing guard/warning
- [Mastermind soft-delete](project_mastermind_soft_delete.md) — messages are soft-delete only; judge cascade FKs to messages.id against never-hard-delete principle
- [Mastermind archived-channel status](project_mastermind_archived_channel_status.md) — archived channel = 404 on read paths but 403 on create, on purpose; don't consolidate the duplicate lookup
