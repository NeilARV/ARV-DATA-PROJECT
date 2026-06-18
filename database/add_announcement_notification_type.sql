-- Adds the `announcement` value to the notification_type enum (the admin/owner @announcement
-- broadcast). Additive and non-destructive — run this targeted ALTER directly against the
-- database rather than `db:push` (which prompts to truncate unrelated tables on drift).
-- Idempotent: safe to run more than once.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'announcement';
