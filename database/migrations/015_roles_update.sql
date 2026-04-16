-- Migration: 015
-- Description: Add role_type column to roles table, classify existing roles, and insert new roles

-- Add role_type column (defaults to 'user' so existing rows are safe)
ALTER TABLE roles
ADD COLUMN IF NOT EXISTS role_type VARCHAR(255) NOT NULL DEFAULT 'user';

-- Classify existing roles
UPDATE roles SET role_type = 'arv'  WHERE name IN ('owner', 'admin', 'relationship-manager');
UPDATE roles SET role_type = 'user' WHERE name = 'pro';

-- Insert new roles
INSERT INTO roles (name, role_type) VALUES ('member', 'arv');
INSERT INTO roles (name, role_type) VALUES ('base',   'user');
