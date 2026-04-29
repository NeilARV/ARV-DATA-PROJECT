
-- Create lookup table for user account types
CREATE TABLE account_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

INSERT INTO account_types (name) VALUES
    ('agent'),
    ('investor'),
    ('wholesaler');

-- Many-to-many junction: a user can have none, one, or many account types
CREATE TABLE user_account_types (
    user_id         UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_type_id INTEGER NOT NULL REFERENCES account_types(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (user_id, account_type_id)
);

CREATE INDEX idx_user_account_types_user_id         ON user_account_types(user_id);
CREATE INDEX idx_user_account_types_account_type_id ON user_account_types(account_type_id);
