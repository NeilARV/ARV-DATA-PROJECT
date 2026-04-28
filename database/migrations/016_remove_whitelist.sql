UPDATE users
SET subscription_id = (SELECT id FROM subscriptions WHERE name = 'basic')
WHERE subscription_id IS NULL;

CREATE TABLE email_subscription_list (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    msa INTEGER REFERENCES msas(id) ON DELETE SET NULL,
    relationship_manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO email_subscription_list (email, msa, relationship_manager_id, created_at, updated_at)
SELECT email, msa, relationship_manager_id, COALESCE(created_at, NOW()), NOW()
FROM email_whitelist
ON CONFLICT (email) DO NOTHING;

DROP TABLE IF EXISTS email_whitelist;
