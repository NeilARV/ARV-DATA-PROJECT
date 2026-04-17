-- Migration: 015
-- Description:
--   1. Create subscriptions lookup table (basic, pro, premium)
--   2. Add subscription_id FK column to users (references subscriptions.id)
--   3. Migrate existing pro assignments from user_roles -> users.subscription_id
--   4. Remove pro from user_roles and roles (subscriptions no longer live in roles table)
--   5. Add member as a new ARV team role

CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
)

-- Step 1: Seed subscriptions
INSERT INTO subscriptions (name) VALUES ('basic'), ('pro'), ('premium');

-- Step 2: Add subscription_id FK to users
ALTER TABLE users
ADD COLUMN subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL DEFAULT NULL;

-- Step 4: Clean up pro from the join table and roles
DELETE FROM user_roles
WHERE role_id = (SELECT id FROM roles WHERE name = 'pro');

DELETE FROM roles WHERE name = 'pro';

-- Step 5: Add member as a new ARV team role
INSERT INTO roles (name)
VALUES ('member')
ON CONFLICT (name) DO NOTHING;
