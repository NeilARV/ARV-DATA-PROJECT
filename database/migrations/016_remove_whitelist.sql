DROP INDEX IF EXISTS email_whitelist_email_key;
DROP TABLE IF EXISTS email_whitelist;

UPDATE users
SET subscription_id = (SELECT id FROM subscriptions WHERE name = 'basic')
WHERE subscription_id IS NULL;
