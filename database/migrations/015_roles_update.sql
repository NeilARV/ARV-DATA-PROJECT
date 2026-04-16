-- Migration: 015
-- Description:
--   1. Add user_role column to users for tier-based roles (base, pro) — nullable
--   2. Migrate existing pro assignments from user_roles join table → users.user_role
--   3. Remove pro from user_roles and roles (user tiers no longer live in roles table)
--   4. Add member as a new ARV team role

-- ── Step 1: Add user_role column to users ─────────────────────────────────────
-- Nullable — a user may not have a role assigned yet
-- Valid values: 'base', 'pro' (add more tiers here as the product grows)
ALTER TABLE users
ADD COLUMN user_role VARCHAR(50) DEFAULT NULL;

-- ── Step 2: Migrate existing pro assignments → users.user_role ────────────────
UPDATE users u
SET user_role = 'pro'
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
WHERE ur.user_id = u.id
  AND r.name = 'pro';

-- ── Step 3: Clean up pro from the join table and roles ────────────────────────
DELETE FROM user_roles
WHERE role_id = (SELECT id FROM roles WHERE name = 'pro');

DELETE FROM roles WHERE name = 'pro';

-- ── Step 4: Add member as a new ARV team role ─────────────────────────────────
INSERT INTO roles (name)
VALUES ('member')
ON CONFLICT (name) DO NOTHING;
