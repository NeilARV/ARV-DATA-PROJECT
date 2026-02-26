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

CREATE INDEX idx_users_relationship_manager_id
ON users(relationship_manager_id);
