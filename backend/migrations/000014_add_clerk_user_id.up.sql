ALTER TABLE users ADD COLUMN clerk_user_id TEXT UNIQUE;
CREATE INDEX idx_users_clerk_user_id ON users (clerk_user_id);
