# Memory Index

- [No DB transactions in services](project_no_db_transactions.md) — server has zero db.transaction usage; multi-write flows are non-atomic, flag missing transactions as real risk
- [Property filter feeds three endpoints](project_property_filter_three_endpoints.md) — one query builder feeds list/map/zip-counts; new filters must be honored in all three services or views diverge
- [companyMembers.role is nullable](project_companymembers_nullable_role.md) — admin-set memberships insert null role; consumers reading m.role must handle null
- [Category delete cascades](project_category_delete_cascades.md) — deleting a category cascade-drops vendor_categories/post_categories links silently; flag missing guard/warning
- [Enum change needs migration](project_enum_change_needs_migration.md) — editing a pgEnum array passes `npm run check` but needs an ALTER TYPE ADD VALUE migration or inserts fail at runtime
