-- Create Roles table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
)

-- Insert rows into roles table
INSERT INTO roles (name)
VALUES ('owner'), ('admin'), ('relationship-manager')

-- Create user roles table to create relationship between users and roles
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

-- Update users table with relationship manager id
ALTER TABLE users
ADD COLUMN relationship_manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Idx for faster relationship manager look up
CREATE INDEX idx_users_relationship_manager_id
ON users(relationship_manager_id);

-- Insert admin role for all users where is_admin = TRUE
INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
SELECT u.id, r.id, NOW(), NOW()
FROM users u
JOIN roles r ON r.name = 'admin'
WHERE u.is_admin = TRUE
ON CONFLICT (user_id, role_id) DO NOTHING;