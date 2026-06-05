---
name: project-category-delete-cascades
description: Deleting a category cascades to vendor_categories and post_categories, silently dropping vendor/post associations
metadata:
  type: project
---

Deleting a row from `categories` cascades (onDelete: 'cascade') to both `vendor_categories` and `post_categories` join tables (see `database/schemas/vendors.schema.ts`).

**Why:** The FK constraints on the join tables are declared with `onDelete: 'cascade'`. So `CategoriesServices.remove(id)` (a single `db.delete`) will silently remove every vendor↔category and post↔category link for that category — vendors/posts that were only in that category lose their tagging with no warning.

**How to apply:** When reviewing category-delete code, flag the absence of a guard or confirmation that surfaces how many vendors/posts will be affected. A plain hard-delete is data-destructive by design, not a bug, but the UI/handler should warn the operator or block deletion of non-empty categories.
